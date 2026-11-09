# ProEditsAPK

ProEditsAPK is a static-first Android apps, video editing and AI tools publishing website, served by a Cloudflare Worker with static assets and Cloudflare D1-backed article management.

## Stack and hosting

- Cloudflare Workers + Workers Static Assets
- Cloudflare D1 database (`proeditsapk-db`, binding `DB`)
- Cloudflare Workers AI binding (`AI`)
- Admin access is temporarily public at the owner's request; restore Cloudflare Access before production use
- Existing repository: https://github.com/haseebaslam091-afk/proeditsapk
- Production site: https://proeditsapk.com

The project intentionally retains its existing Worker/static-assets architecture. Article media is stored as small image blobs in D1 for this deployment; each library image is limited to 1.5 MB. D1 is not intended to replace object storage for larger media.

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

- Open `/admin/` directly while temporary public mode is enabled. All Admin API write/delete routes are also public; restore Cloudflare Access before production use.
- Articles are stored in D1 and exposed through same-origin Worker API routes.
- The existing CMS supports article create, edit, delete, official-logo lookup and D1 status checks.
- Deleting an article is permanent; use the admin confirmation dialog carefully.
- Keep a separate backup/export of important content before schema or storage changes.

## Current limitations

- The repository currently has no R2 or Cloudflare Images binding. The new D1 media library is limited to small images (1.5 MB each); it is not suitable for video or large image collections.
- Server-side resizing, generated thumbnails, upload progress, and large-file storage still require Cloudflare R2 or Cloudflare Images.
- The editor preview is a safe plain-text preview, not a pixel-perfect rendered article preview. Draft autosave is browser-local and does not sync across devices.
- The download-link shortcut inserts a normal Markdown link. A dedicated download-block renderer and attachment storage are not yet implemented.
- A GitHub Actions validation workflow now checks Worker/Admin JavaScript syntax, Wrangler configuration, Access protection and media upload guardrails. Full end-to-end Worker integration tests are still a future improvement.


## Admin media library

The Admin Panel includes an authenticated media library backed by the existing D1 database. Uploads accept PNG, JPEG, WEBP and AVIF files up to 1.5 MB. The Worker checks the declared MIME type against the file signature, assigns an opaque UUID, and serves stored images from `/media/library/<id>`. Alt text and original filenames are stored with each asset. The editor can insert an image Markdown reference at the current cursor position.

The editor also includes heading/bold/link/download-link insertion helpers, a safe plain-text preview, and browser-local draft autosave/restore. Drafts remain in the current browser and are not synced between devices. A download-link helper inserts a normal Markdown link; the target site template determines whether it is rendered as a download action.

D1-backed media is deliberately limited to small images. For larger files, video, transformations, generated thumbnails, or a large media catalogue, configure Cloudflare R2 (or Cloudflare Images) before expanding upload limits. No paid storage resource is created automatically.
