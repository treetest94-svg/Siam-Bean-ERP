# Siam Bean Co. scenario

Reference: CU FDE3 Workshop worksheet, https://mercury-plutonium-be5.notion.site/CU-FDE3-Workshop-worksheet-3fabcb52c6278106abebefb8b1b92426

Siam Bean is a Bangkok coffee-bean distributor serving about 80 cafés. Five staff work from one office and warehouse. Orders arrive by phone and LINE, while inventory and sales are maintained separately and invoices are manually prepared. The project replaces this fragmented process with a shared relational system.

## Users
Admin owns pricing and administration; Sales manages customers and orders; Warehouse receives stock; Accountant records invoice payments. Everyone has a dashboard. Sales may view invoices but cannot enter Accounting. Warehouse cannot confirm orders.

## Required sample products

| SKU | Product | Unit | Cost | Price | Reorder | Opening |
|---|---|---|---:|---:|---:|---:|
| ARB-1KG | Arabica, 1 kg bag | kg | 320 | 450 | 50 | 170 |
| ROB-1KG | Robusta, 1 kg bag | kg | 220 | 320 | 40 | 35 |
| BLD-1KG | House Blend, 1 kg bag | kg | 260 | 380 | 30 | 90 |
| DRP-10 | Drip bags, box of 10 | box | 90 | 150 | 100 | 240 |

## Required sample customers

| Customer | Fictional tax ID | Terms |
|---|---|---|
| Café Lune | 0105561000011 | 30 days |
| Brew Lab Ari | 0105562000022 | Cash |
| Sukhumvit Corner Café | 0105563000033 | 15 days |

Contact addresses/emails in the app are synthetic classroom placeholders. Purchasing/suppliers, delivery notes, HR, multiple warehouses and multiple companies are outside minimum scope.

The defining demo is a Café Lune order for 20 kg of ARB-1KG: 170 → 150 kg, THB9000 subtotal + THB630 VAT = THB9630. Invoice IDs remain sequential and are not reset after tests.
