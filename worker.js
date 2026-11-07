const encoder = new TextEncoder();
let jwksCache = { expires: 0, keys: [] };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function getJwks(teamDomain) {
  if (jwksCache.expires > Date.now() && jwksCache.keys.length) return jwksCache.keys;
  const response = await fetch(teamDomain + "/cdn-cgi/access/certs", {
    headers: { "accept": "application/json" },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error("Could not retrieve Access signing keys");
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw new Error("Invalid Access signing-key response");
  jwksCache = { keys: data.keys, expires: Date.now() + 5 * 60 * 1000 };
  return jwksCache.keys;
}

async function verifyAccess(request, env) {
  const teamDomain = String(env.CF_ACCESS_TEAM_DOMAIN || "").replace(/\/$/, "");
  const expectedAud = String(env.CF_ACCESS_AUD || "");
  if (!teamDomain.startsWith("https://") || !expectedAud) {
    throw new Error("Access verification is not configured");
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new Error("Missing Cloudflare Access assertion");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed Access assertion");

  const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Access token");

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== teamDomain || !Array.isArray(claims.aud) || !claims.aud.includes(expectedAud)) {
    throw new Error("Access issuer or audience mismatch");
  }
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new Error("Access token expired");
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) throw new Error("Access token not active");

  const keys = await getJwks(teamDomain);
  const jwk = keys.find(key => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) throw new Error("Access signing key not found");

  const publicKey = await crypto.subtle.importKey(
    "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
  );
  const signed = encoder.encode(parts[0] + "." + parts[1]);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", publicKey, base64UrlToBytes(parts[2]), signed
  );
  if (!valid) throw new Error("Invalid Access token signature");
  return { email: typeof claims.email === "string" ? claims.email : null };
}

function slugify(value) {
  return String(value).normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
}

function yamlQuote(value) {
  return JSON.stringify(String(value));
}

async function githubRequest(env, path, options = {}) {
  const owner = env.GITHUB_OWNER;
  const repo = env.GITHUB_REPO;
  const token = env.GITHUB_TOKEN;
  if (!owner || !repo || !token) throw new Error("GitHub backend settings are incomplete");
  const response = await fetch("https://api.github.com/repos/" + owner + "/" + repo + path, {
    ...options,
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": "Bearer " + token,
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
      "user-agent": "ProEditsAPK-Worker",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    const error = new Error("GitHub API " + response.status + ": " + (data.message || "request failed"));
    error.status = response.status;
    throw error;
  }
  return data;
}

async function readPosts(env, branch) {
  const result = await githubRequest(env, "/contents/posts.json?ref=" + encodeURIComponent(branch));
  if (!result.content) throw new Error("posts.json is empty or unavailable");
  const posts = JSON.parse(decodeBase64Utf8(result.content));
  if (!Array.isArray(posts)) throw new Error("posts.json must contain an array");
  return posts;
}

function validPostPath(value) {
  return typeof value === "string" &&
    /^_posts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(value) &&
    !value.includes("..");
}

function articleMarkdown(title, date, description, iconUrl, content) {
  const lines = ["---", "title: " + yamlQuote(title), "date: " + date,
    "description: " + yamlQuote(description)];
  if (iconUrl) lines.push("iconUrl: " + yamlQuote(iconUrl));
  lines.push("layout: post", "---", "", content, "");
  return lines.join("\n");
}

async function readArticle(env, branch, path) {
  const result = await githubRequest(env, "/contents/" + path.split("/").map(encodeURIComponent).join("/") +
    "?ref=" + encodeURIComponent(branch));
  if (!result.content) throw new Error("Article content is empty or unavailable");
  return decodeBase64Utf8(result.content);
}

async function createCommit(env, branch, files, message) {
  const ref = await githubRequest(env, "/git/ref/heads/" + encodeURIComponent(branch));
  const parentSha = ref.object.sha;
  const parent = await githubRequest(env, "/git/commits/" + parentSha);
  const treeEntries = [];
  for (const file of files) {
    if (file.delete) {
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: null });
    } else {
      const blob = await githubRequest(env, "/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: file.content, encoding: "utf-8" })
      });
      treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
  }
  const tree = await githubRequest(env, "/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: treeEntries })
  });
  const commit = await githubRequest(env, "/git/commits", {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] })
  });
  await githubRequest(env, "/git/refs/heads/" + encodeURIComponent(branch), {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false })
  });
  return commit.sha;
}

async function handleIconLookup(request, env, url) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  let pkg = String(url.searchParams.get("package") || "");
  const query = String(url.searchParams.get("q") || "").trim().slice(0, 100);
  const headers = { "user-agent": "Mozilla/5.0 (compatible; ProEditsAPK/1.0)" };
  if (pkg && !/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(pkg)) return json({ error: "Invalid Android package name" }, 400);
  if (!pkg && query.length >= 2) {
    const searchResponse = await fetch("https://play.google.com/store/search?q=" + encodeURIComponent(query) + "&c=apps&hl=en", { headers, cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!searchResponse.ok) return json({ error: "Google Play search failed" }, 502);
    const searchHtml = await searchResponse.text();
    const found = searchHtml.match(/\/store\/apps\/details\?id=([a-zA-Z0-9_.]+)/);
    if (found) pkg = found[1];
  }
  if (!pkg) return json({ error: "No matching Google Play app found" }, 404);
  const response = await fetch("https://play.google.com/store/apps/details?id=" + encodeURIComponent(pkg) + "&hl=en", { headers, cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!response.ok) return json({ error: "App icon not found on Google Play" }, 404);
  const html = await response.text();
  const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!match) return json({ error: "Google Play did not provide an app icon" }, 404);
  const icon = match[1].replace(/&amp;/g, "&");
  if (!/^https:\/\/(play-lh|lh3)\.googleusercontent\.com\//.test(icon)) return json({ error: "Untrusted icon source" }, 502);
  return Response.redirect(icon, 302);
}

async function handleApi(request, env, url) {
  const branch = String(env.GITHUB_BRANCH || "main");
  if (request.method === "GET" && url.pathname === "/admin/api/health") {
    const posts = await readPosts(env, branch);
    return json({ ok: true, service: "proeditsapk-api", branch, storage: "github", articles: posts.length });
  }

  if (request.method === "GET" && url.pathname === "/admin/api/articles") {
    const posts = await readPosts(env, branch);
    const path = url.searchParams.get("path");
    if (path) {
      if (!validPostPath(path) || !posts.some(p => p.path === path)) return json({ error: "Article not found" }, 404);
      return json({ ok: true, article: posts.find(p => p.path === path), content: await readArticle(env, branch, path) });
    }
    return json({ ok: true, articles: posts });
  }

  if (["POST", "PUT"].includes(request.method) && url.pathname === "/admin/api/articles") {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 1_000_000) return json({ error: "Article request is too large (1 MB maximum)" }, 413);
    const body = await request.json();
    const title = String(body.title || "").trim().slice(0, 160);
    const content = String(body.content || "").trim();
    const description = String(body.description || "").trim().slice(0, 300);
    const dateInput = String(body.date || "");
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? dateInput : new Date().toISOString().slice(0, 10);
    if (!title || content.length < 20) return json({ error: "A title and article content (at least 20 characters) are required" }, 400);

    const posts = await readPosts(env, branch);
    let path, record, message;
    if (request.method === "PUT") {
      path = String(body.path || "");
      if (!validPostPath(path) || !posts.some(p => p.path === path)) return json({ error: "Article not found" }, 404);
      const prior = posts.find(p => p.path === path);
      record = { ...prior, title, date: prior.date || date, description };
      message = "Update article: " + title.slice(0, 72);
    } else {
      const slug = slugify(body.slug || title);
      if (!slug) return json({ error: "A valid article slug is required" }, 400);
      path = "_posts/" + date + "-" + slug + ".md";
      if (posts.some(p => p.path === path)) return json({ error: "This article URL already exists. Edit the existing article instead." }, 409);
      const slugFromPath = path.slice(18, -3);
      const rawUrl = "https://raw.githubusercontent.com/" + env.GITHUB_OWNER + "/" + env.GITHUB_REPO + "/" + branch + "/" + path;
      record = { title, path, rawUrl, date, slug: slugFromPath, description };
      message = "Publish article: " + title.slice(0, 72);
    }
    const iconUrl = /^https:\/\/(play-lh|lh3)\.googleusercontent\.com\//.test(String(body.iconUrl || "")) ? String(body.iconUrl) : "";
    const packageName = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(String(body.packageName || "")) ? String(body.packageName) : "";
    record.description = description;
    if (iconUrl) record.iconUrl = iconUrl; else delete record.iconUrl;
    if (packageName) record.packageName = packageName; else if (request.method === "PUT") delete record.packageName;
    const markdown = articleMarkdown(title, record.date, description, iconUrl, content);
    const updated = [record, ...posts.filter(p => p.path !== path)];
    const commit = await createCommit(env, branch, [
      { path, content: markdown },
      { path: "posts.json", content: JSON.stringify(updated, null, 2) + "\n" }
    ], message);
    return json({ ok: true, article: record, commit, branch });
  }

  if (request.method === "DELETE" && url.pathname === "/admin/api/articles") {
    const body = await request.json();
    const path = String(body.path || "");
    const posts = await readPosts(env, branch);
    if (!validPostPath(path) || !posts.some(p => p.path === path)) return json({ error: "Article not found" }, 404);
    const updated = posts.filter(p => p.path !== path);
    const commit = await createCommit(env, branch, [
      { path, delete: true },
      { path: "posts.json", content: JSON.stringify(updated, null, 2) + "\n" }
    ], "Delete article: " + String(posts.find(p => p.path === path).title || "").slice(0, 72));
    return json({ ok: true, deleted: path, commit, branch });
  }
  return json({ error: "API route not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/app-icon") {
      try { return await handleIconLookup(request, env, url); }
      catch (error) { return json({ error: error.message || "Icon lookup failed" }, 502); }
    }
    if (!url.pathname.startsWith("/admin/api/")) return env.ASSETS.fetch(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "allow": "GET, POST, PUT, DELETE, OPTIONS",
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, cf-access-jwt-assertion",
        "cache-control": "no-store"
      }});
    }
    try {
      await verifyAccess(request, env);
    } catch {
      return json({ error: "Access verification failed" }, 403);
    }
    try {
      return await handleApi(request, env, url);
    } catch (error) {
      return json({ error: error.message || "Backend request failed" }, error.status || 500);
    }
  }
};
