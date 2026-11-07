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

async function createCommit(env, branch, files, message) {
  const ref = await githubRequest(env, "/git/ref/heads/" + encodeURIComponent(branch));
  const parentSha = ref.object.sha;
  const parent = await githubRequest(env, "/git/commits/" + parentSha);
  const treeEntries = [];

  for (const file of files) {
    const blob = await githubRequest(env, "/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: file.content, encoding: "utf-8" })
    });
    treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
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

async function handleApi(request, env, url) {
  const branch = String(env.GITHUB_BRANCH || "main");
  if (request.method === "GET" && url.pathname === "/admin/api/health") {
    return json({ ok: true, service: "proeditsapk-api", branch, storage: "github" });
  }
  if (request.method === "GET" && url.pathname === "/admin/api/articles") {
    const articles = await readPosts(env, branch);
    return json({ ok: true, articles });
  }
  if (request.method === "POST" && url.pathname === "/admin/api/articles") {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 1_000_000) return json({ error: "Article request is too large (1 MB maximum)" }, 413);
    const body = await request.json();
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    const description = String(body.description || "").trim().slice(0, 300);
    const slug = slugify(body.slug || title);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? String(body.date) : new Date().toISOString().slice(0, 10);
    if (!title || !content || !slug) return json({ error: "Title, slug and article content are required" }, 400);

    const posts = await readPosts(env, branch);
    const path = "_posts/" + date + "-" + slug + ".md";
    const markdown = [
      "---",
      "title: " + yamlQuote(title),
      "date: " + date,
      "description: " + yamlQuote(description),
      "layout: post",
      "---",
      "",
      content,
      ""
    ].join("\n");
    const rawUrl = "https://raw.githubusercontent.com/" + env.GITHUB_OWNER + "/" + env.GITHUB_REPO + "/" + branch + "/" + path;
    const record = { title, path, rawUrl, date };
    const filtered = posts.filter(item => item.path !== path);
    filtered.unshift(record);
    const commit = await createCommit(env, branch, [
      { path, content: markdown },
      { path: "posts.json", content: JSON.stringify(filtered, null, 2) + "\n" }
    ], "Publish article: " + title.slice(0, 72));
    return json({ ok: true, article: record, commit });
  }
  return json({ error: "API route not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/admin/api/")) return env.ASSETS.fetch(request);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "allow": "GET, POST, OPTIONS",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type, cf-access-jwt-assertion",
          "cache-control": "no-store"
        }
      });
    }

    try {
      await verifyAccess(request, env);
      return await handleApi(request, env, url);
    } catch (error) {
      const status = error.status || 403;
      return json({ error: status === 403 ? "Access verification failed" : error.message }, status);
    }
  }
};
