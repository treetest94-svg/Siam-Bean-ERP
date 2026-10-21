# Ten-minute demo script — 22 October 2026

## Before presenting
Open the live app on a phone and laptop. Use the private account sheet. Keep this README, the ER diagram, `database/schema.sql`, and `tests/integration.py` ready. Verify ARB-1KG stock; if already used for a rehearsal, Warehouse can receive the exact amount needed to restore 170 kg. Do not claim a starting number without checking it.

## 0:00–1:00 — Problem
“Siam Bean sells coffee beans to cafés. Separate sales, inventory and accounting spreadsheets make people retype orders, promise unavailable stock, and lose track of unpaid invoices. We built one shared system so a confirmed sale updates all three departments.”

## 1:00–4:00 — US-1
Sign in as Sales. Show Café Lune and ARB-1KG. New sales order → Café Lune → ARB-1KG → quantity 20 → Create draft. Open the order. Explain that a draft has not reduced stock. Confirm order. Open invoice: 20 × 450 = 9000; 7% VAT = 630; total 9630. Show stock 170 → 150 and the negative movement.

## 4:00–5:00 — US-4
Sign out and sign in as Accountant. Open that invoice → Record payment → bank transfer → reference DEMO → Record full payment. Show Paid and dashboard receivables/collected amounts changing. This records a classroom payment, not a real money transfer.

## 5:00–7:00 — US-2 and US-3
Sign in as Warehouse. Show low-stock badges and receive 5 units on a different product. Open Demo & help → Test blocked sales action (403). Explain that hidden buttons are a convenience; the backend permission check is the actual control. If time permits, as Sales create an order larger than available stock, confirm, and show the 409 and unchanged inventory.

## 7:00–10:00 — Questions
- Why relational? Foreign keys connect customers, orders, lines, products, invoices and payments.
- Why a transaction? Stock and invoice changes must all commit or all fail.
- Two users confirm at once? Row locks serialize the affected product balances.
- Price changes later? Order lines snapshot unit price; invoices use those frozen lines.
- Who sets a role? Database provisioning; users cannot submit or edit their role.
- Where are credentials? Ignored environment configuration and private account sheet; never GitHub.
- Why no signup? The course permits directly created users; login and roles are the scored minimum.
- Limitations? One company, no purchasing or partial payments, classroom-level account management.

## Team rehearsal
Assign each person a real part: business problem/demo, sales transaction, inventory/master data, authentication/payments/tests. Each should explain one code path and answer a question. Do not claim contributions that did not happen.
