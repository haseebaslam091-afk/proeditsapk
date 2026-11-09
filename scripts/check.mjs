import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

const worker = await readFile("src/index.js", "utf8");
const admin = await readFile("admin/index.html", "utf8");
const article = await readFile("article.html", "utf8");
const home = await readFile("index.html", "utf8");
const robots = await readFile("robots.txt", "utf8");
const sitemap = await readFile("sitemap.xml", "utf8");
const configText = await readFile("wrangler.jsonc", "utf8");
const config = JSON.parse(configText);

const adminScript = admin.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(adminScript, "Admin page must contain its application script");
new Script(adminScript[1], { filename: "admin/index.html inline script" });
new Script(worker.replace(/^export default\s*\{/m, "const workerDefault = {"), { filename: "src/index.js" });

assert.equal(config.name, "proeditsapk");
assert.ok(config.d1_databases?.some((binding) => binding.binding === "DB"), "D1 DB binding is required");
assert.ok(config.assets?.run_worker_first?.includes("/media/library/*"), "Media assets must reach the Worker");
assert.ok(config.assets?.run_worker_first?.includes("/admin/api/*"), "Admin API routes must reach the Worker");
assert.ok(!config.r2_buckets?.length, "Free-plan deployment must not require an R2 bucket");
assert.ok(worker.includes("TEMPORARY: Cloudflare Access application was removed at the owner's request."), "Temporary public Admin access must be explicitly documented in code");
assert.ok(!worker.includes('if(!request.headers.get("cf-access-jwt-assertion"))'), "Temporary mode must not silently claim Access JWT enforcement");
assert.ok(worker.includes("CREATE TABLE IF NOT EXISTS media_assets"), "Media table schema is required");
assert.ok(worker.includes("/admin/api/media-upload"), "Media upload API is required");
assert.ok(worker.includes("bytes.length>1572864"), "Media uploads must remain below the D1-safe 1.5 MB limit");
assert.ok(worker.includes("signatureOk"), "Media uploads must validate file signatures");
assert.ok(worker.includes('headers.set("cache-control","no-store, no-cache, must-revalidate")'), "Admin HTML must not be cached");
assert.ok(worker.includes('url.pathname==="/sitemap.xml"'), "Worker must provide a D1-backed sitemap");
assert.ok(article.includes("DOMPurify.sanitize"), "Article Markdown must be sanitized before rendering");
assert.ok(article.includes("marked.parse"), "Article Markdown renderer must be present");
assert.ok(home.includes('rel="canonical"'), "Homepage canonical URL is required");
assert.ok(home.includes('name="description"'), "Homepage meta description is required");
assert.ok(robots.includes("Disallow: /admin/"), "Admin must be excluded from crawler indexing");
assert.ok(robots.includes("Sitemap: https://proeditsapk.com/sitemap.xml"), "Robots file must advertise the sitemap");
assert.ok(sitemap.includes("/articles/"), "Static sitemap must include article URLs");
assert.ok(!worker.includes("GITHUB_TOKEN") && !admin.includes("GITHUB_TOKEN"), "CMS must not depend on a GitHub token");

console.log("PASS: Worker and Admin JavaScript syntax");
console.log("PASS: Wrangler JSON configuration and free-plan bindings");
console.log("PASS: D1, Cloudflare Access, media upload safety and no-cache checks");
console.log("PASS: Article sanitization, homepage metadata, robots and sitemap checks");
