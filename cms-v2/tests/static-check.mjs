import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (file) => readFile(path.join(root, file), 'utf8');

const [alias, admin, worker, wrangler] = await Promise.all([
  read('cms-v2/index.html'),
  read('admin-v2/index.html'),
  read('src/index.js'),
  read('wrangler.jsonc')
]);

assert.match(alias, /http-equiv="refresh"[^>]*content="0;url=\/admin-v2\//i,
  'CMS 2.0 entry page must have a no-JavaScript redirect to Admin V2.');
assert.match(alias, /window\.location\.replace\(["']\/admin-v2\/["']\)/,
  'CMS 2.0 entry page must redirect to the supported publisher.');
assert.match(alias, /href="\/admin-v2\//,
  'CMS 2.0 entry page must include a manual fallback link.');
assert.doesNotMatch(alias, /supabase|service_role|localStorage|github_pat_|ghp_/i,
  'The CMS entry page must not contain database credentials or browser storage.');

assert.match(admin, /fetch\('\/admin-v2\/api\/'\+path/,
  'Admin V2 UI must call the same-origin Worker API.');
assert.match(admin, /credentials:'same-origin'/,
  'Admin V2 API calls must include same-origin cookies.');
assert.match(admin, /x-csrf-token/,
  'Admin V2 UI must send its CSRF token on mutations.');
assert.match(admin, /async function save\(published\)/,
  'Admin V2 must retain the draft/publish workflow.');
assert.match(admin, /media-upload/,
  'Admin V2 must retain its server-backed media upload workflow.');

assert.match(worker, /async function adminSession\(request,env\)/,
  'Worker must verify the Admin session server-side.');
assert.match(worker, /crypto\.subtle\.verify\("HMAC"/,
  'Worker session cookie must have a valid HMAC signature.');
assert.match(worker, /Path=\/admin-v2; HttpOnly; Secure; SameSite=Strict; Max-Age=28800/,
  'Worker must set an eight-hour HttpOnly, Secure, SameSite=Strict cookie.');
assert.match(worker, /function adminOriginOk\(request\)/,
  'Worker must verify the request origin.');
assert.match(worker, /x-csrf-token/,
  'Worker must validate the CSRF token for mutations.');
assert.match(worker, /url\.pathname\.startsWith\("\/admin-v2\/api\/"\)\)return adminV2Api/,
  'Worker must route Admin V2 API requests through the protected handler.');
assert.match(worker, /if\(!env\.ADMIN_PASSWORD\)return json\(/,
  'Worker must fail closed when ADMIN_PASSWORD is not configured.');
for (const endpoint of ['publish', 'update', 'delete', 'media-upload', 'media-delete']) {
  assert.ok(worker.includes('"' + endpoint + '"'), 'Worker is missing D1 endpoint: ' + endpoint);
}

assert.match(wrangler, /"\/admin-v2\/\*"/,
  'Wrangler must route Admin V2 paths through the Worker.');

console.log('CMS 2.0 architecture checks passed.');
console.log('Verified the /cms-v2/ redirect, Admin V2 browser API, HMAC session, secure cookie, CSRF/origin checks, D1 publishing/media endpoints, and Wrangler Worker routing.');
