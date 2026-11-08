# ProEditsAPK CMS 2.0 — isolated authentication foundation

This folder is deliberately separate from the production website. The root `index.html` and existing `admin/index.html` are not changed by this CMS 2.0 work.

## What this milestone adds

The CMS 2.0 page is designed to use Supabase Auth for:
- Admin email/password sign-in (no public sign-up form).
- Password reset by email.
- Changing the administrator's display username.
- Requesting a login-email change.
- Changing the password after confirming the current password.
- Logout.

The recovery link now opens an in-page **Set a new password** form and updates the password through Supabase Auth. The Supabase JavaScript client is pinned to v2.102.0 so the current-password check used by the account password-change form is supported.

The page uses a memory-only Supabase session (`persistSession: false`). This avoids writing authentication tokens to localStorage, but it also means a page refresh signs the administrator out.

The username is a display name. Supabase email/password sign-in uses the admin email address.

## One-time Supabase setup

1. Create a Supabase project.
2. In **Authentication → Sign In / Providers**, keep Email enabled.
3. Disable public user sign-ups. Only create/invite the one administrator from **Authentication → Users**.
4. In **Authentication → URL Configuration**, set the Site URL to `https://proeditsapk.com` and add these Redirect URLs:
   - `https://proeditsapk.com/cms-v2/`
   - `https://proeditsapk.com/cms-v2/index.html`
5. In **Project Settings → API**, copy the Project URL and the public **publishable** key (or legacy anon key).
6. Open `cms-v2/index.html` and replace:
   - `https://YOUR_PROJECT_ID.supabase.co`
   - `YOUR_SUPABASE_PUBLISHABLE_KEY`

Only the public publishable/anon key belongs in this static page. Never paste a `service_role` key, secret API key, GitHub token, or Worker secret into HTML, JavaScript, chat, or localStorage.

## Database preparation — private article table

A first database migration is included at `cms-v2/database/001_cms_articles.sql`.

1. In your Supabase project, open **SQL Editor**.
2. Tap **New query**.
3. Open `cms-v2/database/001_cms_articles.sql` in GitHub, copy the complete SQL, and paste it into the query editor.
4. Tap **Run**.
5. Confirm the final result says `row_level_security_enabled = true`. In **Table Editor**, you should also see `cms_articles`.

The table stores article fields and applies Row Level Security (RLS) to all four operations. A signed-in user can select, add, edit, and delete only rows whose `owner_id` equals their Supabase Auth user ID. Anonymous access is not granted. The table defaults `owner_id` to the signed-in user.

This prepares the database only; the current article editor still uses this browser's local storage. The next code milestone is to connect the editor to this table and verify create/edit/delete under the authenticated account. Do not merge or deploy the CMS until that integration and the live Auth tests pass.

## Important limits — do not skip

- The CMS page currently stores article drafts, media metadata, and workspace preferences in this browser's localStorage. They are not yet in a cloud database and do not sync across devices.
- Supabase Auth verifies the admin's login for the interface. The static page is not a server-side security boundary; do not expose protected database or publishing operations without server-side authorization and Row Level Security. A static GitHub Pages file is still downloadable, and browser-only checks are not a substitute for server-side authorization. Before connecting database records or publishing, the next milestone must add Row Level Security and server-side authorization to every protected API.
- GitHub publishing, real media upload, analytics, and AI services are not connected by this foundation.
- This branch is not production. Do not change the GitHub Pages production source or merge it into `main` until authentication is configured and tested.

## Mobile smoke test

After adding the CMS page and configuring Supabase:
1. Open `/cms-v2/` and confirm the login screen appears.
2. Sign in with the administrator account created in Supabase.
3. Open **Settings → Admin account** and change the display username.
4. Test password change with the current password.
5. Test email change and confirm the email through the message Supabase sends.
6. Log out, then refresh the page and confirm the login screen appears again.
7. Use **Forgot password?** to request a recovery email.
8. Open the recovery email on the same device/browser. Confirm it returns to `/cms-v2/`, then enter and confirm a new password on the **Set a new password** screen.
9. Sign in with the new password and confirm the account settings still work.

Official Supabase references:
- Password sign-in: https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- Password reset: https://supabase.com/docs/guides/auth/passwords
- JavaScript Auth configuration: https://supabase.com/docs/reference/javascript/auth
