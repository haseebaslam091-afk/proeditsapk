# ProEditsAPK deployment and publisher setup

## Cloudflare Worker
This repository now uses Wrangler's Workers Static Assets configuration. In the Cloudflare Git integration for the `proeditsapk` Worker, use:

- Build command: leave blank
- Deploy command: `npx wrangler deploy`
- Root directory: leave blank
- Production branch: `main`

The root directory is the repository root. The `wrangler.jsonc` file is the deployment configuration.

## Required publishing secret
The CMS writes articles to this GitHub repository through the Worker. It requires a GitHub fine-grained personal access token stored as a Cloudflare Worker secret.

1. In GitHub, open Settings → Developer settings → Personal access tokens → Fine-grained tokens.
2. Create a token restricted to repository `haseebaslam091-afk/proeditsapk`.
3. Grant **Contents: Read and write**. No other repository permission is required.
4. In Cloudflare, open Workers & Pages → `proeditsapk` → Settings → Variables and Secrets.
5. Add a **Secret** named `GITHUB_TOKEN` and paste the token value there. Never put it in a source file, CMS field, or chat.
6. Trigger a new deployment after adding the secret if Cloudflare does not automatically redeploy.

## Access protection
Keep the Cloudflare Access application and Allow policy protecting `proeditsapk.com/admin/*`. The API is under `/admin/api/*` and expects the Cloudflare Access JWT assertion header. Do not create a public bypass policy for this path.

## Test after deployment
1. Open `https://proeditsapk.com/` and confirm the homepage loads.
2. Open `https://proeditsapk.com/articles/capcut-latest-version-ai-pro` and confirm the article loads.
3. Open `https://proeditsapk.com/admin/`; complete Cloudflare Access login.
4. Publish a short test article with original content, then confirm its clean URL and sitemap entry.
5. Submit `https://proeditsapk.com/sitemap.xml` in Google Search Console.

## Notes
- Existing Markdown articles are preserved in `_posts/`; that folder is excluded from public static asset uploads.
- Published article URLs use `/articles/<slug>`.
- The CMS requires the Cloudflare secret above before it can publish. Do not share the token with anyone.
- Search Console indexing and rankings are controlled by Google and cannot be guaranteed by deployment.
