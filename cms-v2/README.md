# ProEditsAPK CMS 2.0

## One publisher, one database

The supported publisher is the Cloudflare Worker-backed Admin V2 at `/admin-v2/`. The public website reads article records from the existing Cloudflare D1 database through the Worker. Admin V2 uses the same D1 data and already provides:

- Secure admin login with a server-verified HMAC session.
- Draft, publish, edit and delete actions.
- Server-side article search and pagination.
- SEO title, description, excerpt, focus keyword, category and tags.
- D1-backed media library, article images, thumbnails and app logos.
- An eight-hour HttpOnly, Secure, SameSite=Strict session cookie.
- Same-origin and CSRF checks on write requests.

**The `/cms-v2/` page is a safe entry link to `/admin-v2/`.** It deliberately reuses the existing publisher instead of creating a second article database.

**Legacy API safety:** the old `/admin/api/` handler now returns HTTP 503 if `ADMIN_PASSWORD` is missing, and otherwise requires a valid server-side session. The supported interface remains `/admin-v2/`; do not use legacy Admin endpoints.

## Important architecture correction

An earlier CMS prototype used Supabase for article storage. The live ProEditsAPK website does not read articles from that Supabase table; it uses Cloudflare D1. Running a separate Supabase migration would create a second, disconnected copy of articles. The Supabase prototype and its SQL migrations have therefore been removed from this draft.

Do not create a Supabase project or run the old `001_cms_articles.sql` / `002_verify_cms_security.sql` scripts for this route. No article data needs to be migrated for this alias.

## Before signing in

The Worker must have the `ADMIN_PASSWORD` secret configured:

1. Open Cloudflare Dashboard → **Workers & Pages** → **proeditsapk**.
2. Open **Settings → Variables and Secrets**.
3. Add `ADMIN_PASSWORD` as a **Secret**, not a plain-text variable.
4. Use a unique password of at least 32 characters and store it in a password manager.
5. Save the secret and redeploy the Worker using the existing approved deployment process.

Never put this password, a GitHub token, a Cloudflare API token, or any other secret in this repository, browser code, localStorage, or chat. The CMS does not need a GitHub publishing token: the Worker writes to D1.

If the login screen reports that `ADMIN_PASSWORD` is missing, stop there and configure the Worker secret in Cloudflare. Do not try to fix it by adding a key to `cms-v2/index.html`.

## Open the CMS on iPhone

1. Open `https://proeditsapk.com/cms-v2/` in Safari.
2. The page forwards to `/admin-v2/`.
3. Sign in using the Admin V2 password configured in Cloudflare.
4. Create a test draft first. Confirm it appears in **All articles**.
5. Open the draft, edit it, and save again.
6. Only after the draft test succeeds, create a separate test article and use **Publish article**.
7. Open the resulting public article URL and confirm its title, content, thumbnail and download link.
8. Upload one small test image (the current D1 media limit is 1.5 MB), insert it into a test article, and verify it loads publicly.
9. Delete only the test article and test image after confirming they are not needed.

## Static verification

Run this in GitHub Codespaces from the repository root:

```bash
node cms-v2/tests/static-check.mjs
```

The check verifies the redirect, the Admin V2 browser API calls, the Worker session/cookie/CSRF protections, the D1 publishing endpoints, and the Worker route configuration. It does not prove that the production Worker is deployed or that the Cloudflare secret is configured.

## Safe rollout

- This draft changes only files under `cms-v2/` plus its dedicated static-check workflow.
- It does not change the root homepage, existing `/admin/`, `/admin-v2/`, Worker source, D1 records, or production deployment.
- Keep the pull request in Draft until the static checks pass and the live login, draft, publish, public article, and media smoke tests are completed.
