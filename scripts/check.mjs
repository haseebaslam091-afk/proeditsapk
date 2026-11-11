import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

const worker = await readFile("src/index.js", "utf8");
const admin = await readFile("admin/index.html", "utf8");
const adminV2 = await readFile("admin-v2/index.html", "utf8");
const article = await readFile("article.html", "utf8");
const home = await readFile("index.html", "utf8");
const robots = await readFile("robots.txt", "utf8");
const sitemap = await readFile("sitemap.xml", "utf8");
const configText = await readFile("wrangler.jsonc", "utf8");
const config = JSON.parse(configText);

const adminScript = admin.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(adminScript, "Admin page must contain its application script");
new Script(adminScript[1], { filename: "admin/index.html inline script" });\nassert.ok(adminV2Script, "Admin V2 must contain its application script");\nnew Script(adminV2Script[1], { filename: "admin-v2/index.html inline script" });
new Script(worker.replace(/^export default\s*\{/m, "const workerDefault = {"), { filename: "src/index.js" });

assert.ok(config.assets?.run_worker_first?.includes("/admin-v2/*"), "Admin V2 routes must reach the authenticated Worker");
assert.ok(worker.includes("async function adminV2Api") && worker.includes("async function adminSession"), "Admin V2 must use server-verified sessions");
assert.ok(worker.includes('env.ADMIN_PASSWORD') && worker.includes('HttpOnly; Secure; SameSite=Strict'), "Admin V2 must use a signed secure HttpOnly session cookie");
assert.ok(worker.includes('x-csrf-token') && worker.includes('adminOriginOk'), "Admin V2 mutations must enforce same-origin CSRF protection");
assert.ok(worker.includes('LIMIT ? OFFSET ?') && worker.includes('ADMIN_SECRET_MISSING'), "Admin V2 must paginate articles and fail closed without its password secret");
assert.ok(adminV2.includes('id="loginForm"') && adminV2.includes('id="logout"'), "Admin V2 must provide sign-in and sign-out");
assert.ok(adminV2.includes('id="content"') && adminV2.includes('id="iconFile"') && adminV2.includes('id="thumbFile"'), "Admin V2 must provide article editor and manual media upload controls");
assert.ok(adminV2.includes('id="mediaGrid"') && adminV2.includes('id="downloadUrl"') && adminV2.includes('id="seoTitle"'), "Admin V2 must provide media library, download link and SEO controls");
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


assert.ok(worker.includes("const iconVersion=row.updated_at?\"?v=\"+encodeURIComponent(String(row.updated_at)):\"\";"), "D1 icon URLs must be versioned to prevent stale cached uploads");
assert.ok(home.includes("?v=[a-zA-Z0-9%._-]+"), "Homepage must accept versioned D1 app icon URLs");
assert.ok(article.includes("?v=[a-zA-Z0-9%._-]+"), "Article pages must accept versioned D1 app icon URLs");

assert.ok(worker.includes("image/gif"), "Animated GIF thumbnails must be supported");
assert.ok(worker.includes("ALTER TABLE posts ADD COLUMN download_url TEXT") && worker.includes("download_url=?"), "Article download links must be persisted in D1");
assert.ok(!worker.includes("resolveOfficialAppIcon") && !worker.includes("refresh-icons"), "Automatic app-logo lookup must be removed");
assert.ok(!admin.includes("refresh-icons") && !admin.includes("refreshIcons"), "Admin must use manual logo uploads only");
assert.ok(admin.includes('id="downloadUrl"') && admin.includes('id="thumbnailFile"'), "Admin must expose manual download and thumbnail fields");
assert.ok(article.includes("renderDownloadModal") && article.includes("Download Now"), "Article pages must show the download modal and CTA");
const d1MediaPath="\\/media\\/library\\/";
assert.ok(home.includes(d1MediaPath) && article.includes(d1MediaPath) && (await readFile("articles.html", "utf8")).includes(d1MediaPath), "Uploaded D1 thumbnails must render across the site");

const articles = await readFile("articles.html", "utf8");
assert.ok(worker.includes("const refreshed=await env.DB.prepare(\"PRAGMA table_info(posts)\").all()") && worker.includes("if(!(refreshed.results||[]).some(column=>column.name===name))throw error"), "D1 schema migrations must tolerate concurrent duplicate-column races");
assert.ok(worker.includes('ALTER TABLE posts ADD COLUMN seo_title TEXT') && worker.includes('ALTER TABLE posts ADD COLUMN focus_keyword TEXT') && worker.includes('ALTER TABLE posts ADD COLUMN category TEXT') && worker.includes('ALTER TABLE posts ADD COLUMN tags TEXT') && worker.includes('ALTER TABLE posts ADD COLUMN excerpt TEXT'), "SEO and article taxonomy columns must migrate safely");
assert.ok(worker.includes('published=data.published===false?0:1'), "Admin must be able to save unpublished drafts");
assert.ok(worker.includes('url.pathname==="/admin/api/article"') && admin.includes("call('article?path='"), "Admin must load drafts as well as published article content");
assert.ok(admin.includes('id="richEditor"') && admin.includes('contenteditable="true"'), "Admin must provide a rich text editor");
assert.ok(admin.includes('data-command="bold"') && admin.includes('insertUnorderedList') && admin.includes('insertOrderedList') && admin.includes('id="insertTable"'), "Rich editor must provide formatting, lists and tables");
assert.ok(admin.includes('id="togglePreview"') && admin.includes('id="editorPreview"') && admin.includes('id="wordCount"'), "Rich editor must provide preview and word count");
assert.ok(admin.includes('id="saveDraft"') && admin.includes("published:!saveButton"), "Admin must save drafts separately from publishing");
assert.ok(admin.includes('id="seoTitle"') && admin.includes('id="focusKeyword"') && admin.includes('id="category"') && admin.includes('id="tags"') && admin.includes('id="excerpt"'), "Admin must provide SEO and article taxonomy fields");
assert.ok(article.includes("payload.seoTitle") && article.includes('meta[property="og:title"]') && article.includes("payload.tags"), "Public article pages must use SEO and tag metadata");
assert.ok(home.includes("p.excerpt||p.description") && articles.includes("p.excerpt||p.description"), "Homepage and archive must use article excerpts");

console.log("PASS: Worker, Admin V1 and Admin V2 JavaScript syntax");
console.log("PASS: Wrangler JSON configuration and free-plan bindings");
console.log("PASS: D1, secure Admin V2 sessions, CSRF, pagination, media upload safety and no-cache checks");
console.log("PASS: Article sanitization, homepage metadata, robots and sitemap checks");
