# Star Eggs app

A business ledger for Star Eggs that can be installed on a phone. It tracks:

- Eggs bought and sold
- Stock
- Seller dues
- Partner capital
- Expenses
- Profit
- Invoices, as PDF files or WhatsApp messages

It is a plain static site with no build step. Data and logins live in Supabase.

```
index.html            app screens and login
styles.css            design
app.js                all app logic
config.js             your Supabase URL and anon key  ← edit this
schema.sql            database tables and access rules ← run once in Supabase
sw.js                 offline shell so it installs like an app
manifest.webmanifest  app name, icon and colours for "Install"
icons/                app icons
```

## 1. Set up the database (Supabase, free)

1. Create a project at https://supabase.com. Choose the **Mumbai (ap-south-1)** region so it's fast in Hyderabad, and save the database password somewhere safe.
2. Open `schema.sql`. At the bottom, list every email that should be able to use the app, then copy the whole file.
3. In Supabase, go to **SQL Editor → New query**, paste the file and click **Run**.
4. Go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". Only people you create can log in.
5. Create a login for each person:
   1. Go to **Authentication → Users → Add user → Create new user**.
   2. Enter their email and a password.
   3. Tick **Auto Confirm User**.
   4. Use the same emails you listed in step 2.
6. Go to **Project Settings → API** and copy the **Project URL** and the **anon / publishable** key into `config.js`.

The anon key is meant to be public. The database rules only let signed-in emails on the members list read or change anything.

To add someone later:

1. Create their login as in step 5.
2. In the SQL Editor, run:
   ```sql
   insert into members (email, name) values ('them@example.com', 'Name');
   ```

To remove someone, delete their row from `members` and their user from Authentication.

## 2. Put it online (Vercel, free)

1. Push this folder to a GitHub repo (it can be private).
2. On https://vercel.com, click **Add New → Project** and import the repo.
3. Set **Framework Preset** to **Other**. Leave the build command and output directory empty.
4. Click **Deploy**. You get a link like `star-eggs.vercel.app`.
5. To use your own domain, go to **Project → Settings → Domains** and add one, e.g. `app.stareggs.in`. Vercel shows the DNS record to add at the domain registrar.

Netlify, Cloudflare Pages or GitHub Pages work the same way, since it's just static files.

## 3. Install it on phones

- **Android (Chrome):** open the link and tap **Install app** at the top, or use **⋮ → Add to Home screen**.
- **iPhone (Safari):** open the link, tap **Share → Add to Home Screen**.

It then opens full-screen from its own icon. People stay signed in until they tap **Sign out**.

## Updating the app

1. Edit the files and push to GitHub. Vercel redeploys automatically.
2. Change `VERSION` in `sw.js` (e.g. `star-eggs-v2`) with every release so installed phones pick up the new files.

## Good to know

- **Free Supabase projects pause after about a week with no activity.** Daily use keeps it awake. If it ever pauses, click **Restore** in the Supabase dashboard; no data is lost.
- **Backups:** the free plan has no automatic backups you can download. Every month or so, export each table as a CSV from **Table Editor → Export**, or upgrade to Pro for daily backups.
- **Invoice wording:** invoices default to **Bill of Supply** because fresh eggs (HSN 0407) are GST-exempt. Confirm this with the business's CA. The title can be changed under **Invoices → Business details printed on invoices**.
- **Sharing PDFs:** on phones, **Share PDF** opens the share sheet, so the PDF can go straight to WhatsApp. On computers it downloads instead.
