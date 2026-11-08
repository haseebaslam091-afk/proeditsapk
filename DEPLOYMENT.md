# ProEditsAPK deployment and Cloudflare D1 setup

## Worker deployment
The repository is connected to the Cloudflare Worker `proeditsapk`.

- Build command: leave blank
- Deploy command: `npx wrangler deploy`
- Root directory: leave blank
- Production branch: `main`

`wrangler.jsonc` binds the existing D1 database `proeditsapk-db` as `env.DB`. The Worker automatically creates the posts table and indexes on its first request, so the initial deployment does not depend on a separate CLI migration command. The tracked migration is retained at `migrations/0001_create_posts.sql` for reproducible schema management.

## Database and publishing
- D1 database: `proeditsapk-db`
- Article metadata and content are stored in D1.
- Uploaded official app logos (up to 1.5 MB) are stored as BLOBs in the separate `post_media` D1 table, so large article content does not consume the logo row's 2 MB limit. Logos are served from `/media/icons/<slug>`.
- On the first authenticated Admin Panel load, the Worker imports the four existing published articles and their Markdown content into D1. The migration is idempotent and does not overwrite an already-populated database.
- The Admin Panel Publish, Edit and Delete actions use D1.
- The admin API remains protected by Cloudflare Access. Keep the Access application and Allow policy protecting `proeditsapk.com/admin/*`; do not create a public bypass.
- A GitHub personal access token is not required for article publishing or editing. GitHub remains the source-code repository and Cloudflare's Git integration can continue deploying code.

## Test after deployment
1. Open `https://proeditsapk.com/` and confirm the homepage loads.
2. Open `https://proeditsapk.com/admin/` and complete Cloudflare Access login.
3. Confirm the D1 connection check reports the number of stored articles. On the first Admin Panel load, the existing four articles should be imported.
4. Confirm all four existing articles appear in Published articles.
5. Publish a test article, edit it, then delete it; confirm each action succeeds.
6. Open an article at `https://proeditsapk.com/articles/<slug>` and confirm its content loads.
7. Open `https://proeditsapk.com/sitemap.xml` and confirm it lists published D1 articles.
8. Upload an official app logo, save the article, edit it again, and confirm the logo remains visible.
9. Submit the sitemap in Google Search Console.

## Notes
- Existing Markdown files in `_posts/` remain in GitHub as the original backup; the live CMS no longer writes them.
- Published article URLs use `/articles/<slug>`.
- Uploaded official app logos are stored in D1 and served from `/media/icons/<slug>`.
- The D1 migration is designed to stop with an explicit error if an article exceeds D1's 2 MB row limit; do not treat a partial migration as successful.
- Search Console indexing and rankings are controlled by Google and cannot be guaranteed by deployment.
