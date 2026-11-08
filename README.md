# ProEditsAPK

ProEditsAPK is a static-first Android apps, video editing and AI tools publishing website, served by a Cloudflare Worker with static assets and Cloudflare D1-backed article management.

## Stack and hosting

- Cloudflare Workers + Workers Static Assets
- Cloudflare D1 database (`proeditsapk-db`, binding `DB`)
- Cloudflare Workers AI binding (`AI`)
- Admin access is protected by Cloudflare Access
- Existing repository: https://github.com/haseebaslam091-afk/proeditsapk
- Production site: https://proeditsapk.com

The project intentionally retains its existing Worker/static-assets architecture.

## Local development

1. Install Node.js (LTS) and npm.
2. Install Wrangler: `npm install --global wrangler`.
3. Authenticate with Cloudflare: `wrangler login`.
4. Clone this repository and run `wrangler dev` from the repository root.
5. Configure the D1 binding in `wrangler.jsonc` for local development and use `wrangler d1 migrations apply proeditsapk-db --local` when local migrations exist.

There is no package.json/build script in the current repository; the Worker and static assets are deployed directly by Wrangler.

## Deploy

1. Confirm the Cloudflare account has the Worker `proeditsapk` and D1 database `proeditsapk-db`.
2. Confirm the `DB` D1 binding and `AI` binding are present.
3. From the repository root run `wrangler deploy`.
4. Verify `https://proeditsapk.com/`, `/articles/`, `/sitemap.xml`, and `/admin/`.
5. Confirm Cloudflare Access protects `/admin/*` and the admin API.

Production deployment is normally connected to the repository's `main` branch in Cloudflare.

## Environment and bindings

No GitHub publishing token is required: the CMS uses D1. Do not add credentials to source control.

| Name | Type | Purpose |
| --- | --- | --- |
| `DB` | D1 binding | Stores article records and current app-logo blobs |
| `AI` | Workers AI binding | Existing AI-backed site functionality |
| `ASSETS` | Workers Static Assets binding | Serves the static site and admin UI |

The existing Worker configuration declares the D1 database ID and bindings in `wrangler.jsonc`. No secret values are documented here.

## Admin access and content

- Open `/admin/` after authenticating through the configured Cloudflare Access policy.
- Articles are stored in D1 and exposed through same-origin Worker API routes.
- The existing CMS supports article create, edit, delete, official-logo lookup and D1 status checks.
- Deleting an article is permanent; use the admin confirmation dialog carefully.
- Keep a separate backup/export of important content before schema or storage changes.

## Current limitations

- The repository currently has no R2 or Cloudflare Images binding. The existing D1 logo upload is intentionally small and is not a general-purpose media library.
- General photo uploads, server-side image resizing/compression, thumbnails, reusable media management and media deletion require a durable object store (recommended: Cloudflare R2) and a configured binding/bucket.
- Rich article preview, autosave across devices, and fully managed image/download blocks are not yet part of the production CMS.
- Automated test/build scripts are not currently configured in the repository.
