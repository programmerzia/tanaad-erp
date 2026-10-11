# Known gaps and simulations (v0.2 demo, 11 October 2026)

## Simulated
- **Scale readings** settle on the physical sum of what was scanned or declared, with small noise. The manual path requires a "photo".
- **Label printing** is an animation; `printer.print` resolves after 900 ms.
- **WhatsApp** messages are rendered previews; nothing is sent.
- **Camera captures** (ID card, face, receipts, lorry photos) are tiles that toggle to "captured".
- **Sync**: the offline toggle holds events in the outbox and reconnecting marks them synced. There is no server yet.
- **Sign-in** accepts any password and the PIN 1234. Real authentication arrives with the API.
- **PDF**: "Print / PDF" uses the browser's print dialog.

## Shown honestly as not yet real
- **URA EFRIS**: invoices carry a fiscal block that reads "Pending · EFRIS not yet connected". No fiscal number or QR is ever generated.
- **Company details** (address, TIN, bank, mobile money, VAT rate) are blank until entered in Settings; documents print "to be provided by Tanaad".
- **Morning brief schedule** reads "To be set"; there is no stored send time.

## Example values awaiting the client (flagged "example" in Settings)
Standard bundle and pack weights, bag size names, roll type 2, downtime reasons, breakdown causes, sub-categories, daily rates, vehicles, pellet grades, intake deductions and prices, sack size, credit terms, the one imported-resin purchase, raw material cost per kg, overtime and monthly bases. Client, collector and worker names in the seed are invented demo records.

## Not yet master data
Engagement types, process stages and shifts (set with Vivacom at commissioning), suppliers and purchase cost types (typed, with suggestions), gate override reasons (typed), payment-method "needs a reference" flag, zone purpose, stage-to-sector mapping, credit warning level (80%) and margin bands.

## Session-local state
Settlement approval and paid marks, finishing calibration samples and loose pieces, brief alert switches, the tagging campaign estimate (kept on the device).
