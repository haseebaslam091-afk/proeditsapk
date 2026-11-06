# ProEditsAPK Cloudflare Worker backend

This branch adds the first backend foundation while keeping the production `main` branch unchanged.

## Files
- `worker.js`: Worker entry point, Cloudflare Access JWT verification, and GitHub-backed article API.
- `wrangler.jsonc`: Worker + static-assets configuration.
- `.assetsignore`: prevents source files and private content directories from being published as public static assets.

## Required secret
The Worker expects `GITHUB_TOKEN` as a Cloudflare Worker secret. Never put it in `wrangler.jsonc`, HTML, JavaScript served to browsers, or Git.

Create a fine-grained GitHub token limited to this repository with **Contents: Read and write**. Add it to the Worker as a secret named `GITHUB_TOKEN` after the Worker configuration is deployed.

## Access configuration
The Wrangler config includes the Access team issuer and application AUD supplied by the site owner. The Worker validates the JWT signature against the team's published signing keys and checks issuer, audience, expiry, and activation time.

The Cloudflare Access application must protect `/admin/*` on the production hostname. Do not expose `/admin/api/*` outside that policy.

## API routes
- `GET /admin/api/health`
- `GET /admin/api/articles`
- `POST /admin/api/articles`

The POST route writes a dated Markdown file and updates `posts.json` in one Git commit on the configured branch.

## Important deployment notes
1. This branch is not production and must not be merged until reviewed and tested.
2. Confirm the Cloudflare Pages/Workers build integration deploys from the intended branch and uses the root `wrangler.jsonc`.
3. Set the `GITHUB_TOKEN` secret before testing write operations.
4. Test on a staging hostname or preview deployment protected by Cloudflare Access.
5. The current CMS interface is still browser-local until its frontend is connected to these API routes. Do not treat CMS publish buttons as server-backed yet.
