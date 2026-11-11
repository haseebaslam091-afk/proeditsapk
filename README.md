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

## Admin V2 (new secure publisher)

A rebuilt publisher interface is available at `/admin-v2/` on the feature branch. It includes a responsive dashboard, server-side article search and pagination, a rich-text editor, draft/publish/edit/delete workflows, manual app-logo and animated thumbnail uploads, inline article images, SEO/category/tag fields, a media library, and live preview. It uses a signed eight-hour HttpOnly/Secure/SameSite session cookie, same-origin checks, and a CSRF token for mutations. The API fails closed until the Cloudflare Worker secret `ADMIN_PASSWORD` is configured.

### Configure the Admin V2 password

1. In Cloudflare, open **Workers & Pages → proeditsapk → Settings → Variables and Secrets**.
2. Add a **Secret** named `ADMIN_PASSWORD` (not a plain text variable). Use a unique, randomly generated password of at least 32 characters and keep it in a password manager.
3. Save the secret and redeploy the Worker. Never put this password in GitHub, source code, chat, or the public website.
4. Open `/admin-v2/` and sign in. The legacy `/admin/` and `/admin/api/*` remain unchanged during the staged migration; do not treat them as secure until the final cutover protects or disables them.

Do not switch `/admin/` to V2 until the secret is configured and the V2 end-to-end checks pass. Keep the previous Admin available for rollback during the staged rollout.

## Admin access and content

- Open `/admin/` while temporary public mode is enabled. **Admin and write APIs are currently public at the owner's request. Restore Cloudflare Access before production use.**
- Articles are stored in Cloudflare D1. Admin supports create, edit, save draft, publish, update, and delete.
- The rich text editor supports headings, bold, italic, underline, strikethrough, lists, blockquotes, links, code blocks, tables, alignment, dividers, undo/redo, image insertion, preview, HTML source view, and word counts.
- Article metadata includes SEO title, meta description, focus keyword, category, tags, and excerpt. Custom categories are reflected in homepage and archive filters.
- App logos and animated GIF/image thumbnails are uploaded manually. The media library stores small images in D1, with a 1.5 MB per-file limit.
- Each article can have its own HTTPS download URL. The public article page displays a Download button and a confirmation modal with a Download Now link.
- Browser-local autosave helps recover an unfinished new article; the explicit Save draft action stores drafts in D1 so they can be reopened from another device.
- Deleting an article is permanent; use the admin confirmation dialog carefully and keep backups of important content.

## Current limitations

- The repository currently has no R2 or Cloudflare Images binding. The D1 media library is limited to small images (1.5 MB each); it is not suitable for video or large image collections.
- Server-side resizing, generated thumbnails, large-file storage, and upload progress require Cloudflare R2 or Cloudflare Images.
- The editor uses browser rich-text commands and renders a safe preview; always review the public article after publishing, especially complex pasted layouts.
- There is no scheduled publishing or multi-user role/approval workflow.
- GitHub Actions validates Worker/Admin JavaScript syntax, Wrangler configuration, media guardrails, and the editor/draft/SEO workflows. Full end-to-end Worker integration tests are still a future improvement.

## Admin media library

The Admin Panel includes a D1-backed media library. Uploads accept PNG, JPEG, WEBP, AVIF, and GIF files up to 1.5 MB. The Worker checks the declared MIME type against the file signature, assigns an opaque UUID, and serves stored images from `/media/library/<id>`. Alt text and original filenames are stored with each asset. The rich editor inserts uploaded media as HTML image elements at the saved cursor position.

App logos are uploaded separately and remain distinct from article thumbnails. Thumbnail uploads accept animated GIFs; each article can use its own uploaded thumbnail. The public homepage, article archive, and article page render the saved thumbnail.

