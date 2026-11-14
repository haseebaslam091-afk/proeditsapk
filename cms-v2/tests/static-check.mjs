import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const cmsDir = path.resolve(here, '..');
const html = await readFile(path.join(cmsDir, 'index.html'), 'utf8');
const sql = await readFile(path.join(cmsDir, 'database', '001_cms_articles.sql'), 'utf8');

const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attrs, code]) => !/\bsrc\s*=/.test(attrs) && code.trim());

assert.equal(inlineScripts.length, 2, 'Expected the two inline CMS scripts.');
inlineScripts.forEach(([, , code], index) => {
  new Script(code, { filename: 'cms-inline-' + (index + 1) + '.js' });
});

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML contains duplicate id attributes.');

const idSet = new Set(ids);
const references = [...html.matchAll(/getElementById\(["']([^"']+)["']\)/g)].map((m) => m[1]);
const missingIds = [...new Set(references.filter((id) => !idSet.has(id)))];
assert.deepEqual(missingIds, [], 'Some getElementById references do not exist in the HTML.');

const functions = new Set(
  [...html.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1])
);
const clickHandlers = [...html.matchAll(/\bonclick=["']([^"']+)["']/g)].map((m) => m[1]);
const missingHandlers = clickHandlers
  .map((handler) => (handler.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/) || [])[1])
  .filter((name) => name && !functions.has(name));
assert.deepEqual([...new Set(missingHandlers)], [], 'An inline click handler has no matching function.');

assert.match(html, /persistSession\s*:\s*false/, 'Auth sessions must not be persisted in browser storage.');
assert.doesNotMatch(html, /auth\\.signUp\\s*\\(/i, 'Public sign-up must not be available in the admin CMS.');
assert.doesNotMatch(html, /service_role\\s*[:=]\\s*[\"'][^\"']+/i, 'A service-role key must never be embedded in browser code.');
assert.doesNotMatch(
  html,
  /proedits_cms20_articles|localStorage\.(?:getItem|setItem|removeItem)\([^)]*articles/i,
  'Article content must not be stored in localStorage.'
);
assert.match(html, /\.from\(['"]cms_articles['"]\)\s*\.select\(/i, 'Missing article SELECT query.');
assert.match(html, /\.from\(['"]cms_articles['"]\)\s*\.insert\(/i, 'Missing article INSERT query.');
assert.match(html, /\.from\(['"]cms_articles['"]\)\s*\.update\(/i, 'Missing article UPDATE query.');
assert.match(html, /\.from\(['"]cms_articles['"]\)\s*\.delete\(/i, 'Missing article DELETE query.');
const deleteCurrentStart = html.indexOf('async function deleteCurrent(){');
const deleteCurrentEnd = html.indexOf('\\n}', deleteCurrentStart);
const deleteCurrentBody = deleteCurrentStart >= 0 && deleteCurrentEnd >= 0
  ? html.slice(deleteCurrentStart, deleteCurrentEnd + 2)
  : '';
assert.match(deleteCurrentBody, /const deleted=await deleteArticle\(id\)/, 'The editor must wait for the database delete result.');
assert.match(deleteCurrentBody, /if\(deleted\)\{clearEditor\(\);go\('articles'\);\}/, 'The editor must remain open if deletion is cancelled or fails.');

assert.match(sql, /enable row level security/i, 'The articles table must enable RLS.');
assert.match(
  sql,
  /revoke all on table public\.cms_articles from anon, public/i,
  'Anonymous/public table privileges must be revoked.'
);
for (const policy of [
  'cms_articles_select_own',
  'cms_articles_insert_own',
  'cms_articles_update_own',
  'cms_articles_delete_own'
]) {
  assert.match(sql, new RegExp('create policy\\s+' + policy + '\\b', 'i'), 'Missing policy: ' + policy);
}
assert.match(sql, /auth\.uid\(\)\s*=\s*owner_id/i, 'Policies must scope rows to the authenticated owner.');

console.log('CMS 2.0 static checks passed.');
console.log(
  'Checked ' + inlineScripts.length + ' inline scripts, ' + ids.length +
  ' unique HTML IDs, ' + references.length + ' DOM references, four RLS policies, and database CRUD hooks.'
);
