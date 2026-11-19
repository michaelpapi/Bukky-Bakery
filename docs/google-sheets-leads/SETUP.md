# Save sign-ups, orders and date requests in a Google Sheet (free)

What you get, per client:

- A Google Sheet with three tabs: **Subscribers**, **Orders**, **Date requests**.
- The owner gets an **email with a PDF** for every order (a proper **invoice**: shop header, invoice number, customer, items, total) and every date request (a **booking request** sheet).
- Each PDF is also **saved in a Drive folder** and linked in the Sheet (column "Invoice PDF"), so the owner can open it any time or forward it on WhatsApp.
- Every evening (8pm by default) the owner gets a **daily summary email with a PDF**: how many people subscribed, how many orders, how many date requests.
- Costs nothing. Google's free limits are far above what a small shop needs.

Honest limits:

- **The PDF cannot be attached inside WhatsApp by the website.** WhatsApp links can only carry text. The customer's message arrives in the owner's WhatsApp as a neat invoice-style text; the PDF arrives by email and sits in Drive. Sending a PDF straight into WhatsApp automatically needs the paid WhatsApp Business API.
- The summary goes to **email**, not WhatsApp. Automatic WhatsApp messages need the paid WhatsApp Business API.
- An order is saved when the customer taps "Send order on WhatsApp". If they then do not press Send inside WhatsApp, the owner still sees it in the Sheet. The owner should confirm on WhatsApp.
- Free Gmail accounts can send about 100 emails a day. A shop with more than 100 orders a day should set `EMAIL_EACH_ORDER: false` and rely on the Sheet and the summary.

## One-time setup (about 10 minutes, once per client)

1. Sign in to the Google account that will own the data (the client's, or yours). Go to **sheets.google.com** and create a blank spreadsheet. Name it `Bukky Bakes leads`.
2. In the Sheet, open **Extensions > Apps Script**.
3. Delete the code that is there. Open `Code.gs` from this folder, copy everything, and paste it in.
4. At the top, change `CONFIG`:
   - `BUSINESS`: the shop name.
   - `ADDRESS_LINE` and `PHONE_LINE`: printed at the top of the invoice.
   - `OWNER_EMAIL`: where the invoices and the summary should arrive.
   - `BRAND_COLOR` and `PAYMENT_NOTE` (for example the shop's account number): shown on the invoice.
   - `DRIVE_FOLDER`: the Drive folder name for the PDFs (created for you).
   - `TOKEN`: type any word, for example `bb-2026-kite`. Remember it.
5. Click **Save** (the disk icon). In the function drop-down choose **setup** and click **Run**. Google asks for permission (spreadsheets, email and Drive, because the script saves the PDFs): choose your account, click **Advanced**, **Go to project (unsafe)**, **Allow**. This is your own script, so it is safe. `setup` creates the three tabs and the evening timer.
6. Choose **testEmail** and click **Run**. Check the owner's inbox for a test invoice with a PDF, and your Drive for the new folder. If the PDF shows a box where the naira sign should be, change `CURRENCY_SYMBOL` to `'NGN '`.
7. Click **Deploy > New deployment**. Click the gear icon and pick **Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.
8. Open `clients/bukky-bakes/client.json` and add this block next to `"contact"` (same level, with a comma after the block before it):

```json
"leads": {
  "url": "PASTE THE WEB APP URL HERE",
  "token": "bb-2026-kite",
  "logOrders": true
},
```

9. Run `npm run dev`, subscribe with a test email, and watch the **Subscribers** tab. Push to GitHub and Netlify redeploys.

If you ran an older version of this script first, delete the **Orders** and **Date requests** tabs (they have new columns) and run `setup` again.

## If you change Code.gs later

Changing the code does not change the live web app. Click **Deploy > Manage deployments**, the pencil icon, **Version: New version**, **Deploy**. The URL stays the same.

## Changing things

| I want to... | Change |
| --- | --- |
| Send the summary at another time | `SUMMARY_HOUR`, then run `setup` again |
| Stop the email for each order | `EMAIL_EACH_ORDER: false` |
| Stop saving PDFs in Drive | `SAVE_TO_DRIVE: false` |
| Only save subscribers, not orders | `"logOrders": false` in client.json |
| Skip the summary on quiet days | `SKIP_QUIET_SUMMARY: true` |
| Mark an order as done | Type in the **Status** column of the Sheet |

## Privacy (Nigeria)

The form asks people to tick a box agreeing to be contacted, and the script refuses records without it. Keep the Sheet private (do not share it publicly), and delete a person's row if they ask to be removed.

## For the next client

Make a new Sheet, paste the same `Code.gs` with that client's `CONFIG`, deploy, and put the new URL in that client's `client.json`. Each client's data stays in their own Sheet.
