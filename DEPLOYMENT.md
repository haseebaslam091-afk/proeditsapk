# ProEditsAPK deployment and Cloudflare D1 setup

## Cloudflare Worker
In the Cloudflare Git integration for the `proeditsapk` Worker, use:

- Build command: leave blank
- Deploy command: `npx wrangler d1 migrations apply proeditsapk-db --remote && npx wrangler deploy`
- Root directory: leave blank
- Production branch: `main`

The root directory is the repository root. `wrangler.jsonc` binds the existing D1 database as `env.DB`.

## Database and publishing
- D1 database: `proeditsapk-db`
- Database ID is configured in `wrangler.jsonc`.
- Schema migration: `migrations/0001_create_posts.sql`.
- Admin publishing, editing and deleting use D1; article content and uploaded app logos are stored in D1.
- On first authenticated Admin Panel load, the Worker imports existing published articles and Markdown content into D1. This migration is idempotent and will not overwrite an already-populated D1 database.
- The admin API remains protected by Cloudflare Access. Keep the Access application and Allow policy protecting `proeditsapk.com/admin/*`; do not create a public bypass.
- A GitHub personal access token is no longer required for article publishing.

## Test after deployment
1. Open `https://proeditsapk.com/` and confirm the homepage loads.
2. Open `https://proeditsapk.com/admin/` and complete Cloudflare Access login.
3. The first admin load imports the existing four articles into D1. Confirm they appear in Published articles.
4. Publish a test article, edit it, then delete it; confirm each action succeeds.
5. Open an article at `https://proeditsapk.com/articles/<slug>` and confirm its content loads.
6. Open `https://proeditsapk.com/sitemap.xml` and confirm it lists published D1 articles.
7. Submit the sitemap in Google Search Console.

## Notes
- Existing Markdown files in `_posts/` remain in GitHub as the original backup; the live CMS no longer writes them.
- Published article URLs use `/articles/<slug>`.
- Uploaded official app logos are stored in D1 and served from `/media/icons/<slug>`.
- Search Console indexing and rankings are controlled by Google and cannot be guaranteed by deployment.
