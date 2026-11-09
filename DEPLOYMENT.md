# ProEditsAPK deployment and Cloudflare Free setup

## Production architecture

- Production site: https://proeditsapk.com
- Worker: `proeditsapk`
- Static assets: Cloudflare Workers Static Assets
- Database: Cloudflare D1 `proeditsapk-db`, binding `DB`
- AI binding: `AI` (existing Worker functionality)
- Admin protection: temporarily disabled at the owner's request; Admin APIs are public until Access is restored
- Production branch: `main`

The Worker is deployed from this repository using Cloudflare's Git integration. The Wrangler deploy command is `npx wrangler deploy`; there is no separate build step.

## Free-plan storage

The project intentionally uses the existing D1 database and does not require Cloudflare R2, Cloudflare Images, or a paid storage subscription.

- Article records and Markdown content are stored in D1.
- Small uploaded PNG, JPEG, WEBP and AVIF images are stored in the D1 `media_assets` table (maximum 1.5 MB per image).
- App logos are stored in the D1 `post_media` table and served from `/media/icons/<slug>`.
- Media-library images are served from `/media/library/<uuid>`.
- D1 is not intended for videos or large media collections. Do not increase the upload limit without moving large objects to a suitable object-storage service.
- No R2 binding or paid storage service is configured.

## Admin and content

Open `https://proeditsapk.com/admin/` and authenticate through Cloudflare Access.

The Admin Panel supports:
- Listing, creating, editing and deleting D1 articles.
- Uploading small images to the D1 media library, adding alt text, inserting image Markdown, and deleting media.
- Uploading app logos and setting verified HTTPS logo URLs.
- Refreshing verified official app-logo lookups.
- Browser-local draft autosave and restore.
- D1 connection and article-count checks.

TEMPORARY OWNER-REQUESTED STATE: Cloudflare Access and the Worker JWT check are currently disabled. This makes every Admin API route, including publish, update, delete and media upload/delete, publicly reachable. Restore a Cloudflare Access application and Allow policy for `proeditsapk.com/admin/*` and reinstate Worker JWT validation before production use. Never leave this temporary bypass enabled on a public production site.

The CMS does not use GitHub for publishing and does not need a GitHub personal access token. Do not recreate a `GITHUB_TOKEN` Worker secret. GitHub is used for source control and the connected deployment pipeline only.

## Database behavior

The Worker creates the required D1 tables and indexes on first request when they are missing. The existing production database has already been populated with the four original articles. The migration endpoint is only for an empty database and is not part of normal Admin refresh; do not run it to refresh existing content.

The original Markdown files in `_posts/` remain in GitHub as a source backup. The live Admin Panel writes to D1.

## Verification checklist

After a deployment, verify:

0. Confirm whether temporary public Admin mode is still explicitly intended. If not, restore Cloudflare Access and Worker JWT validation before any other Admin use.

1. `/` loads and displays the homepage.
2. `/articles/` lists published articles.
3. `/admin/` redirects through Cloudflare Access and loads after authentication.
4. The Admin D1 check reports the expected article count.
5. Existing article URLs under `/articles/<slug>` load their content and images.
6. `/sitemap.xml` lists the published articles.
7. `/robots.txt` allows public pages and disallows `/admin/`.
8. In a controlled test, create, edit and delete a disposable test article.
9. In a controlled test, upload, view, insert and delete a disposable media image.

Do not use an existing published article or its media as a test record. The Admin Panel's Delete action is permanent.

## Automated checks and known limits

GitHub Actions runs `node scripts/check.mjs` on pull requests and pushes to `main`. It validates Worker/Admin JavaScript syntax, Wrangler configuration, Access guardrails, media upload limits and key SEO/security wiring. This is a static validation suite, not a full browser or production integration test.

The editor preview is plain text rather than a pixel-perfect rendered preview. Draft autosave is local to the current browser and does not sync across devices. The download helper inserts a normal Markdown link, not a managed attachment block. Server-side image resizing, generated thumbnails and video/large-file storage are not configured on the free D1-only setup.

Search indexing and rankings are controlled by search engines and cannot be guaranteed by deployment.
