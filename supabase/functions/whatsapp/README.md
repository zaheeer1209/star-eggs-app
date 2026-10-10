# Star Eggs WhatsApp ordering bot

Customers message the Star Eggs WhatsApp number. The bot then:
1. Shows the packs and prices.
2. Takes quantities.
3. Asks for name, address (typed or a shared 📍 location) and pincode.
4. Offers UPI or cash on delivery.
5. Confirms the order.

Orders land in the same `orders` table as the website, so they show in the app's **Orders** tab with a green **WhatsApp** tag.

The bot also:
- **Asks UPI customers for their reference number** after the order (they send the 12-digit number in the chat).
- **Shows order status** when a customer taps **My orders**.
- **Sends new-order and "talk to us" alerts to the owner** on WhatsApp.
- **Messages the customer automatically** when you change an order in the app: confirmed, out for delivery, delivered, cancelled, or payment received.
- **Remembers each customer's address** for next time.

Prices, stock, pincodes, minimum order and cash on delivery come from **Orders → Online shop settings** in the app. The totals are always worked out by the database.

## Files

- `bot.ts`: the conversation.
- `index.ts`: the webhook (checks Meta's signature, ignores duplicates, sends replies).
- `bot_test.ts`: tests for every conversation path. Run them with `deno test supabase/functions/whatsapp/bot_test.ts`.

## Setup (about 45 minutes, once)

### 1. Database
In Supabase, open **SQL Editor** and run `migrations/002_online_store.sql` (if you haven't yet), then `migrations/003_whatsapp_bot.sql`.

### 2. WhatsApp number on Meta
1. Go to https://developers.facebook.com → **My Apps → Create app**. Choose **Other → Business**, then add the **WhatsApp** product. Connect it to the business's Meta Business account.
2. Under **WhatsApp → API Setup**, add the phone number the bot will use and verify it by SMS or call.
   - Use a number that is **not** active on the normal WhatsApp or WhatsApp Business app. A new SIM is easiest.
   - Meta also has a "coexistence" option for keeping an existing WhatsApp Business app number, but it's set up through Meta/partners. Check whether it's offered to you before relying on it.
3. Copy the **Phone number ID** from that page.
4. Create a permanent token:
   1. Go to **Business settings → Users → System users → Add**, with the Admin role.
   2. Click **Assign assets** and give it the app and the WhatsApp account.
   3. Click **Generate token** and tick `whatsapp_business_messaging` and `whatsapp_business_management`.
5. Copy the **App secret** from **App settings → Basic**.

### 3. Deploy the bot
From the repo folder on a computer with Node installed:

```bash
npx supabase login
npx supabase functions deploy whatsapp --project-ref frifcmvkxuhnfimlhhbb --no-verify-jwt

npx supabase secrets set --project-ref frifcmvkxuhnfimlhhbb \
  WA_TOKEN="<permanent token>" \
  WA_PHONE_NUMBER_ID="<phone number id>" \
  WA_APP_SECRET="<app secret>" \
  WA_VERIFY_TOKEN="<any phrase you choose>" \
  OWNER_WHATSAPP="91XXXXXXXXXX" \
  NOTIFY_SECRET="<another long phrase>"
```

`--no-verify-jwt` is needed because Meta doesn't send a Supabase login. Meta's messages are checked with the app secret instead. You can also set the secrets in the Supabase dashboard under **Edge Functions → Secrets**.

### 4. Connect Meta to the bot
1. Go to **WhatsApp → Configuration → Webhook → Edit**.
2. Enter:
   - **Callback URL:** `https://frifcmvkxuhnfimlhhbb.supabase.co/functions/v1/whatsapp`
   - **Verify token:** the same phrase as `WA_VERIFY_TOKEN`
3. Click **Verify and save**.
4. Under webhook fields, **Subscribe** to `messages`.
5. Switch the Meta app to **Live** mode, so anyone (not just test numbers) can message it.

### 5. Status updates to customers
1. In Supabase, go to **Database → Webhooks → Create a new hook**.
2. Set:
   - **Table:** `orders`
   - **Events:** Update
   - **Type:** Supabase Edge Functions, choosing `whatsapp`, method POST
   - **HTTP header:** `x-star-eggs-notify` = the `NOTIFY_SECRET` value

### 6. Try it
Message the bot number "hi" from your own phone and place a test order. Check that it appears in the app's Orders tab, then cancel it there.

## Good to know

- **Cost:** under Meta's current pricing, replies within 24 hours of a customer's message are free. Messages outside that window need paid, pre-approved templates. Check Meta's WhatsApp pricing page for India.
- **24-hour window:** status updates and owner alerts are normal messages, so they only send within 24 hours of the other person's last message. Customers' updates are normally well inside that. The owner should message the bot once a day ("hi") to keep receiving alerts, or rely on the app's Orders tab.
- **Logs:** see Supabase → Edge Functions → whatsapp → Logs.
