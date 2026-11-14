# ProEditsAPK CMS 2.0 — isolated authentication + article database foundation

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

The article list and editor now use the `cms_articles` Supabase table for reading, creating, updating, and deleting articles. Article content is no longer saved to browser localStorage. The table's RLS policies enforce ownership in the database.

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

The CMS article editor is now connected to this table. After the SQL migration has run and the Supabase URL/public key have been configured in `cms-v2/index.html`, sign in and use **New article → Save draft**. The CMS loads articles from Supabase and supports create, edit, and delete. The database—not browser localStorage—enforces ownership through RLS. If the migration has not been run, the dashboard will show a database setup error and article saving will not work.

## Verify database security (read-only)

After running `001_cms_articles.sql`, open `cms-v2/database/002_verify_cms_security.sql` on GitHub, tap **Raw**, copy the complete query, and run it in the same Supabase project's **SQL Editor**. This second query is read-only: it does not change tables or article data.

The result should show:
- `table_exists = true`
- `rls_enabled = true`
- `total_policies = 4` and `expected_policy_count = 4`
- All four `anon_*_blocked` values = `true`
- All four `authenticated_*_allowed` values = `true`
- `all_checks_passed = true`

If `all_checks_passed` is false, do not put any secret key in the page. Check that migration 001 was run in the correct Supabase project, then inspect the individual false result columns.

## Important limits — do not skip

- Article records are stored in Supabase. Media metadata and workspace preferences still use this browser's localStorage; actual image files are not uploaded. Old prototype drafts previously saved under the `proedits_cms20_articles` localStorage key are not automatically imported.
- The static page is downloadable, so its interface is not a security boundary. Direct article database requests use only the public Supabase publishable/anon key, and the database RLS policies enforce ownership on every read/write. Never add a service-role key or other private secret to the page. Privileged GitHub publishing must use a Supabase Edge Function or another server-side service that verifies the signed-in admin before using a server-side GitHub secret.
- GitHub publishing, real media upload, analytics, and AI services are not connected yet.
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
10. Open **New article**, enter a title, slug, and content, then tap **Save draft**. Confirm the article appears in **Articles**.
11. Sign out and sign in again. Confirm the same article loads from the database.
12. Edit the article and save again. Confirm the change remains after signing out and back in.
13. Delete the test article and confirm it disappears from the list.

Official Supabase references:
- Password sign-in: https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- Password reset: https://supabase.com/docs/guides/auth/passwords
- JavaScript Auth configuration: https://supabase.com/docs/reference/javascript/auth


## Password-change confirmation

The account settings form asks for the current password, new password, and a matching confirmation. It uses Supabase Auth's `current_password` option, supported by the pinned supabase-js v2.102.0 client. The page checks that the two new-password fields match before sending the update.

## Current verification status

The repository code can be statically checked, but the live Supabase integration is not verified until the project URL/public publishable key are configured and the SQL migrations have been run in the user's Supabase project. Do not treat a successful static code check as proof of a live database connection.

## Repeatable static checks (no Supabase secrets required)

A small Node.js check script is included at `cms-v2/tests/static-check.mjs`. It checks:
- Both inline JavaScript blocks parse successfully.
- HTML IDs are unique and direct DOM references point to existing IDs.
- Inline click handlers point to defined functions.
- Auth sessions are not persisted in browser storage, public sign-up is absent, and no service-role key is embedded.
- Article CRUD calls use the `cms_articles` table and article drafts are not stored in localStorage.
- Cancelling a delete or receiving a database delete error keeps the current editor open instead of clearing it.
- The SQL migration enables RLS, revokes anonymous table privileges, and defines all four owner-scoped policies.

To run it in GitHub Codespaces:
1. Open this repository and select the `cms-v2-db-crud-polish` branch.
2. Open **Code → Codespaces** and start your Codespace.
3. Open **Terminal → New Terminal**.
4. Paste and run:

```bash
node cms-v2/tests/static-check.mjs
```

Expected final output begins with `CMS 2.0 static checks passed.`

These are static code checks only. They do not prove that Supabase is configured, that the SQL was run in the correct project, or that live login/article CRUD works. Complete the mobile smoke test above after configuring Supabase.
