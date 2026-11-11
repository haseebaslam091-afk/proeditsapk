# ProEditsAPK Admin v2 rebuild

## Safety and rollout
- Build v2 on a separate branch and route; do not replace the current Admin until v2 passes validation.
- Preserve all existing D1 article rows, slugs, published URLs, drafts, uploaded icon blobs, media_assets, and post_media rows.
- Do not run destructive migrations or rewrite existing content during cutover.
- Keep rollback to the current Admin route available until production smoke tests pass.

## Findings from the current implementation
- Admin API routes are publicly reachable: the current api() handler explicitly notes that Cloudflare Access was removed and does not authenticate requests.
- Article creation and icon persistence use separate D1 writes; a failure between them can leave partial data.
- Media uploads are stored as D1 blobs with a 1.5 MB cap; this is not suitable for large GIFs or a growing media library.
- The article list endpoint loads the entire post collection rather than offering server-side pagination/search.
- Schema initialization is performed in the Worker request path; retries exist, but migrations and business writes need clearer separation.
- The current Admin editor is a large single HTML document with inline application logic, making testing and maintenance harder.

## V2 architecture
- Split the Admin into small modules: app shell, API client, article list, editor, media library, SEO panel, settings, and shared validation.
- Use one versioned API contract with structured errors, request IDs, bounded timeouts, and retry only for safe/idempotent operations.
- Add server-side pagination, filtering, and search for articles; never fetch an unbounded list.
- Add draft autosave with revision/version checks, explicit publish confirmation, idempotency keys, and conflict detection.
- Make article + icon metadata persistence atomic where D1 supports a batch/transaction; make uploads independently idempotent and attach only after verification.
- Keep one canonical article body format (sanitized HTML) and convert legacy Markdown on read, preserving existing content.
- Insert media as actual image elements, retain alt text, preserve animated GIFs, and use responsive image styles.
- Keep manual logo, GIF thumbnail, article images, download URL, and download modal workflows.
- Add revision history/restore, validation, live preview, SEO checks, and accessible mobile controls.
- Add operational health diagnostics and structured server-side error IDs without exposing stack traces.

## Storage strategy
- Keep existing D1 media records readable so current article images never break.
- Add optional R2 object storage for new media only after an R2 bucket/binding is configured; preserve D1 fallback during migration.
- Do not copy, delete, or transform existing media automatically.
- Enforce MIME/signature validation, file-size limits, and upload idempotency.

## Authentication gate
- V2 must not expose read/write Admin APIs publicly.
- Implement secure server-verified sessions using a Cloudflare Worker secret (never commit passwords or signing keys).
- Require same-origin/CSRF checks for mutations, HttpOnly Secure SameSite cookies, expiry, and logout.
- Production cutover must wait until the owner configures the required Worker secret or Cloudflare Access application and confirms login works.

## Quality gates before cutover
- Syntax and configuration validation.
- Unit tests for validation, HTML sanitization, Markdown compatibility, session expiry, CSRF/origin checks, retry policy, and idempotency.
- API tests for list pagination, create, draft, publish, edit, slug change, delete, media upload, media attach, and rollback.
- Verify old published routes, thumbnails, logos, GIFs, body images, download links, sitemap, and public posts feed remain intact.
- Run mobile Safari smoke tests and a production read-only smoke test.
- Only switch /admin after all gates pass; retain a documented rollback path.

## Implemented on the feature branch
- Added a new independent `/admin-v2/` publisher UI; the legacy Admin route is not overwritten.
- Added signed HMAC sessions using the Cloudflare Worker secret `ADMIN_PASSWORD`, Secure/HttpOnly/SameSite=Strict cookie flags, eight-hour expiry, same-origin mutation checks, and CSRF token verification.
- Added a fail-closed API namespace under `/admin-v2/api/*`; it returns an explicit setup error if the secret is absent.
- Added server-side article pagination, filtering, and search; dashboard metrics; draft/publish/edit/delete; rich text content editing; manual logo and thumbnail uploads; inline body image uploads; SEO and taxonomy fields; download URLs; and media library management.
- Added Worker-first routing for the new Admin V2 page and API.
- Extended GitHub Actions syntax/config checks to parse the new UI and assert its authentication and API guardrails.

## Not yet safe to cut over
- The owner must add the `ADMIN_PASSWORD` Worker secret in Cloudflare and redeploy.
- The legacy `/admin/` and `/admin/api/*` routes are still the existing public temporary setup. They must be protected or disabled as part of final cutover; the new V2 API does not magically secure the legacy namespace.
- V2 currently uses the existing D1 media library and its 1.5 MB limit. R2 is not bound in this account, so the rebuild deliberately does not assume R2 exists.
- Production end-to-end create/edit/publish tests must be performed only after login is configured, using a draft and then deleting that test draft. Existing published content must remain untouched.