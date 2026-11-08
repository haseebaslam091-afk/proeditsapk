# Changelog

## 2026-11-08 — Production-readiness audit and admin recovery

### Follow-up fix
- Serve the Admin Panel HTML with `no-store` cache headers so mobile browsers do not keep rendering an older dashboard after a production deployment.

### Fixed
- Hardened the Admin Panel API helper to send JSON content type only when a request has a body, set an explicit JSON Accept header, disable caching, and stop waiting indefinitely on requests.
- Added clearer handling for non-JSON responses, HTTP errors, network failures and timeouts.
- Made the published-article list validate the API response shape, render an explicit empty state, expose actionable error text, and clear its busy state on both success and failure.
- Made article content loading use same-origin credentials and no-store caching.
- Kept the existing D1-backed CMS and all existing published content intact.

### Documented
- Added project setup, deployment, binding and environment documentation.
- Recorded the current production-readiness gaps rather than claiming unimplemented features are complete.

### Decisions
- Kept the existing Cloudflare Workers + Static Assets + D1 architecture; no framework migration or new runtime dependencies.
- Did not add a fake local upload directory: Worker static assets are not a writable persistent filesystem.
- Did not store arbitrary 5 MB images in D1. D1 is not a suitable media object store and the current deployment has no R2/Cloudflare Images binding. General media uploads are blocked pending a durable object-storage binding.
- The download-button and rich-media editor controls are not reported as implemented until their end-to-end public rendering and security tests pass.

### Remaining work
- Configure an R2 bucket and Worker binding (or Cloudflare Images) for media storage, image transformations and thumbnails.
- Implement authenticated media CRUD, MIME/signature validation, upload limits, alt text, media library and upload progress.
- Implement cursor-position image/download blocks, safe public rendering, preview and draft autosave.
- Add automated tests and run a production browser regression suite for all routes and admin actions.
- Verify the deployed Worker revision and the Admin Panel in a real authenticated browser session after deployment.
