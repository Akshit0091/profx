# ProfX — Product Image Saver

A Chrome extension that copies the product photos out of the Meesho supplier
panel into ProfX, so that scanning the barcode on a printed shipping label
brings up a picture of the book.

The photo is the one thing neither the label sheet nor the supplier manifest
contains. Everything else — AWB, sub-order ID, SKU — comes from the label PDF
you already download, uploaded once on the **Scan Label** page in ProfX.

## Installing it

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this `extension` folder.
4. Click the ProfX icon in the toolbar and sign in:
   - **ProfX address** — your API, ending in `/api`
     (`http://localhost:5000/api` while developing, otherwise your live API URL).
   - The same email and password you use on the ProfX website.

Chrome will ask for permission to reach that address. It is asked for at sign-in
rather than at install so the install prompt only ever mentions Meesho.

## Using it

1. Open the Meesho supplier panel → **Orders → Ready to Ship**.
2. A small ProfX panel appears at the bottom-right of the page.
3. Press **Save product images**.

It scrolls the list to the end, collects every order with a photo, and sends
them to ProfX in batches. Photos are fetched and resized server-side, one per
SKU rather than one per order, so a run over 340 orders of 150 different books
downloads 150 pictures. Running it again only picks up SKUs that are new.

## Order of operations

The two feeds meet on the sub-order ID and can arrive in either order:

- **Extension first** — orders become scannable by sub-order ID straight away,
  but have no AWB until the sheet is uploaded.
- **Label sheet first** — every label is scannable by any of its keys, but shows
  "no photo saved yet" until the extension has run.

Doing both is what makes a scan show a picture.

## When it stops working

The scraper does not depend on Meesho's class names, which change on every
deploy. It finds the orders table by looking for a "Sub-order ID" column, reads
the column positions from that table's own header, and picks the product photo
as the row's first real image. Moving or renaming a column is handled.

What would break it is Meesho dropping the HTML table altogether. If the panel
reports *"No orders table on this page"* while you are on Ready to Ship, that is
what has happened, and `content.js` needs its row-finding updated.

## Files

| File | What it does |
|---|---|
| `manifest.json` | Permissions and where the content script runs |
| `content.js` | Reads the orders table, draws the on-page panel |
| `content.css` | Styling for that panel |
| `background.js` | Holds the login token, makes every API call |
| `popup.html` / `popup.js` | Sign-in and coverage stats |

The token lives in the service worker's storage and is never exposed to the
Meesho page, so nothing running on supplier.meesho.com can read it.
