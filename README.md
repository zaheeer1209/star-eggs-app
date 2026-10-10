# Star Eggs app

A business ledger for Star Eggs that can be installed on a phone. It tracks:

- Eggs bought and sold
- Stock
- Seller dues
- Partner capital
- Expenses
- Profit
- Invoices, as PDF files or WhatsApp messages

Every new sale makes its invoice straight away and opens it ready to share as a PDF or on WhatsApp. You can turn this off with the switch on the sale form.

The same code runs two ways:

- **Website / web app** on Vercel, served from `www/`.
- **Android app (APK)** built by GitHub Actions with Capacitor.

Data and logins live in Supabase.

```
www/                  the app (web and Android share it)
  index.html            screens and login
  styles.css            design
  app.js                all app logic
  config.js             Supabase URL and anon key
  vendor/               Supabase and PDF libraries (bundled so the app works without CDNs)
  sw.js, manifest.webmanifest, icons/   install-as-web-app pieces
android/              native Android project (Capacitor), with icons and signing key
.github/workflows/android.yml   builds the APK on every push
store/                the public online shop (its own Vercel project)
schema.sql            database tables and access rules (run once in Supabase)
migrations/           database updates to run in order (002 = online shop)
vercel.json           tells Vercel to serve www/
```

## Online shop

Customers order from the shop in `store/`:
1. They pick boxes of 12 or trays of 30.
2. They give their address and pincode.
3. They pay by UPI (a button for phones, a QR code for computers) or cash on delivery.

Each order gets a number like `ORD-1001`. Customers can track it on the shop and send it to you on WhatsApp.

Orders appear live in the app's **Orders** tab:
- **New** orders show a red badge.
- Tap **Confirm**, then **Out for delivery**, then **Delivered**. Delivered turns the order into sales and makes the bill, ready to send on WhatsApp.
- If a UPI customer taps "I've paid", the card shows their UPI reference. Check it in your UPI app before tapping **Mark paid**.

Prices, stock, pincodes, minimum order and cash on delivery are set in **Orders → Online shop settings**. The business name, address, phone, UPI ID and FSSAI number come from **Invoices → Business details**.

The database works out every price and total itself, checks pincodes and stock, and limits repeat orders. Customers can't see other people's orders or anything in the books.

### Turn the shop on

1. In Supabase, open **SQL Editor → New query**, paste `migrations/002_online_store.sql` and click **Run**. It's safe to run twice.
2. On Vercel, click **Add New → Project** and import the same repo again. Under **Root Directory**, choose `store`, set Framework to **Other**, and click **Deploy**.
3. In that project, go to **Settings → Domains** and add the shop domain, e.g. `stareggs.in`. You can point `app.stareggs.in` at the first project for the ledger.
4. In the app, fill in the FSSAI number, UPI ID, phone and address under **Invoices → Business details**. Then set prices and pincodes under **Orders → Online shop settings**.

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

## 3. Android app (APK)

GitHub builds the app automatically after every push that changes `www/` or `android/`. This takes about 5 minutes.

1. Open the repo on GitHub and go to **Releases** (right-hand side).
2. Open the newest **Star Eggs app 1.1.x** and download `StarEggs-1.1.x.apk`.
3. Send the APK to the phone, for example on WhatsApp to yourself, and open it.
4. Android asks to allow installing from that app (WhatsApp, Files, Chrome). Allow it, then tap **Install**.

Updates install over the old version and keep the login. To build one manually, go to **Actions → Android app → Run workflow**.

The signing key is `android/app/star-eggs-release.keystore`, with its passwords in `android/keystore.properties`. Every update must be signed with this same key, so never delete or replace it. It's committed so the build works without setup. That's acceptable for a private repo and a sideloaded internal app, but before a Play Store release, move both into GitHub Secrets and remove them from the repo.

**iPhone:** this needs a Mac with Xcode and an Apple Developer account (₹8,700/yr) to put on other people's phones. Until then, iPhone users can use the web app via **Share → Add to Home Screen**.

## 4. Install the web app on phones

- **Android (Chrome):** open the link and tap **Install app** at the top, or use **⋮ → Add to Home screen**.
- **iPhone (Safari):** open the link, tap **Share → Add to Home Screen**.

It then opens full-screen from its own icon. People stay signed in until they tap **Sign out**.

## Updating the app

1. Edit the files in `www/` and push to GitHub. Vercel redeploys the website, and GitHub builds a new APK.
2. Change `VERSION` in `sw.js` (e.g. `star-eggs-v2`) with every release so installed phones pick up the new files.

## Good to know

- **UPI on the shop:** use a business/merchant UPI ID (PhonePe Business, Paytm for Business, GPay for Business or a bank merchant QR). Some UPI apps block "pay with amount" links to personal UPI IDs.

- **Free Supabase projects pause after about a week with no activity.** Daily use keeps it awake. If it ever pauses, click **Restore** in the Supabase dashboard; no data is lost.
- **Backups:** the free plan has no automatic backups you can download. Every month or so, export each table as a CSV from **Table Editor → Export**, or upgrade to Pro for daily backups.
- **Invoice wording:** invoices default to **Bill of Supply** because fresh eggs (HSN 0407) are GST-exempt. Confirm this with the business's CA. The title can be changed under **Invoices → Business details printed on invoices**.
- **Sending invoices:** each invoice has these buttons:
  - **Send PDF on WhatsApp:** in the Android app, opens the seller's chat with the PDF attached. It uses WhatsApp Business if installed; you can change this per phone in business details.
  - **Send SMS:** opens the SMS app with a short bill summary. SMS can't carry PDFs.
  - **Save PDF:** saves to `Downloads/Star Eggs` and opens it.
  - **Share:** opens Android's share menu.
- **Saving a seller's number:** fill in the seller's WhatsApp number on the sale form once. It's remembered for their next invoices.
