import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

const worker = await readFile("src/index.js", "utf8");
const admin = await readFile("admin/index.html", "utf8");
const configText = await readFile("wrangler.jsonc", "utf8");
const config = JSON.parse(configText);

const adminScript = admin.match(/<script>([\\s\\S]*?)<\\/script>/);
assert.ok(adminScript, "Admin page must contain its application script");
new Script(adminScript[1], { filename: "admin/index.html inline script" });
new Script(worker.replace(/^export default\\s*\\{/m, "const workerDefault = {"), { filename: "src/index.js" });

assert.equal(config.name, "proeditsapk");
assert.ok(config.d1_databases?.some((binding) => binding.binding === "DB"), "D1 DB binding is required");
assert.ok(config.assets?.run_worker_first?.includes("/media/library/*"), "Media assets must reach the Worker");
assert.ok(worker.includes('if(!request.headers.get("cf-access-jwt-assertion"))'), "Admin API must enforce Cloudflare Access JWT");
assert.ok(worker.includes("CREATE TABLE IF NOT EXISTS media_assets"), "Media table schema is required");
assert.ok(worker.includes("/admin/api/media-upload"), "Media upload API is required");
assert.ok(worker.includes("bytes.length>1572864"), "Media uploads must remain below the D1-safe 1.5 MB limit");
assert.ok(worker.includes("signatureOk"), "Media uploads must validate file signatures");

console.log("PASS: Worker and Admin JavaScript syntax");
console.log("PASS: Wrangler JSON configuration");
console.log("PASS: D1, Worker-first media routing, Access guard and upload safety checks");
