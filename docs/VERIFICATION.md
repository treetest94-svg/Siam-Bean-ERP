# Verification record — 21 October 2026

## Completed before production deployment

- React/TypeScript production build passed.
- Root FastAPI entry point served the HTML page and favicon successfully.
- **42 integration assertions passed against the real Supabase PostgreSQL database through FastAPI.**
- All four real role accounts authenticated; tokens remained outside JSON; cookie was HttpOnly.
- Missing session and bad password rejected; logout revoked access.
- Sales Accounting access and Warehouse confirmation returned 403.
- Products/customers created, edited where tested, deactivated; required fields and positive stock-in validated.
- Confirmation: 170 → 150 units; THB9000 subtotal, THB630 VAT, THB9630 total.
- Duplicate confirmation did not deduct twice.
- Invoice line price stayed unchanged after the catalogue price changed.
- Insufficient-stock confirmation left stock, movements and invoice count unchanged.
- Partial payment and duplicate payment rejected; full payment marked Paid.
- Concurrent orders competing for insufficient stock yielded one success and one conflict.
- Separate SQL reconciliation confirmed stock equals the sum of movements, including sample opening balances.

The integration script uses identifiable synthetic QA records, separate from the course sample products/customers. Test invoice numbers are never reused. The synthetic QA records were removed before production verification; course samples were preserved.

## Public production verification

- Public URL: https://siam-bean-erp-kohl.vercel.app/
- **19 production assertions passed** using HTTP requests against the deployed FastAPI service and real database.
- Public HTML and health endpoint returned 200 without Vercel authentication.
- All four role accounts signed in; production cookies were Secure and HttpOnly.
- Sales Accounting access and Warehouse order confirmation returned 403.
- A Café Lune order for 20 kg ARB-1KG produced subtotal 9000, VAT 630, total 9630 and stock 170 → 150.
- Full classroom payment changed the invoice to Paid and updated dashboard collections and receivables.
- The completed sample invoice/payment were retained. An audited Warehouse stock-in restored ARB-1KG to 170 kg for the group's next demonstration.
- The public login screen was visually inspected in a browser. Authenticated workflows were tested through HTTP, not through a complete browser click-through; a real phone check remains part of the group rehearsal.

## Honest process notes
Tests were added after the initial implementation. This repository does not fabricate test-first commits, member contributions or execution of unavailable third-party skills. Every group member still needs to review the work, make their own genuine contribution and rehearse the live demo.

## Admin user management update — 27 October 2026

- Added Admin-only account creation and deletion on the existing production URL.
- Username, password length and role validation run in the database gateway.
- User listings contain only id, username, role and active status.
- Deletion revokes sessions immediately and preserves historical creator references.
- The current account and last active Admin cannot be deleted. Account mutations use a transaction-scoped advisory lock.
- A rollback-only database check verified that deleting an account preserves its historical order.
- 31 targeted live API assertions passed, including creation, role restrictions, validation and immediate session revocation.
- Targeted live API checks are in `tests/user_management.py`; credentials must be supplied through an external private JSON file.
