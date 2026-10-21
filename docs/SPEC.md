# Specification and acceptance criteria

Source: assignment screenshot dated 21 October 2026 and the CU FDE3 course reference. Target: a deployed, single-company Mini ERP for Siam Bean Co. This document records the implemented scope; it is not a claim of a real stakeholder interview.

## US-1 — Order to invoice
As Sales, I want to confirm a customer order so inventory and invoicing stay consistent.
- Given Café Lune and ARB-1KG with 170 kg at THB450/kg, an order for 20 kg confirms to 150 kg stock.
- A single invoice receives a sequential INV number, identical line snapshots, subtotal 9000, VAT 630, total 9630.
- Insufficient stock returns 409 without stock, invoice or movement changes.
- Repeated confirmation creates no second invoice and does not deduct twice.
- Concurrent orders lock product rows in ID order and cannot oversell.

## US-2 — Stock
As Warehouse, I want to record deliveries and identify low stock.
- Positive stock-in creates a movement and adds to the product balance.
- Zero/negative quantity and missing reason are rejected.
- Products at or below reorder level display a badge and affect dashboard count.

## US-3 — Roles
As the owner, I want each department to have appropriate permissions.
- Admin, Sales, Warehouse and Accountant sign in with separate accounts.
- Backend and database enforce the README matrix; disallowed roles receive 403.
- No session returns 401; logout revokes the session.
- A supplied client role has no authority.

## US-4 — Payment
As Accountant, I want to record a full payment so the invoice is settled.
- The exact invoice total is required.
- Recording it creates one payment and changes Unpaid to Paid atomically.
- A duplicate payment is rejected; dashboard receivables update.

## Master data
Products: SKU, name, unit, nonnegative price, nonnegative reorder level. Customers: name, required 13-digit tax ID, valid email, billing address, payment terms. Both support create, list, edit, deactivate. No destructive deletion of master records.

## Dashboard and deployment
Sales today (Bangkok), receivables, open invoices, low-stock count, and collected payments are database aggregates. Public HTTPS application, no localhost dependencies, responsive CSS, environment configuration outside source control.

## Scope decisions
One company; full payments; manual stock-in; no delivery stage. Draft price snapshots freeze at creation. Historical invoices retain the old price and customer billing details. Application accounts are provisioned by the operator, as permitted by the course reference.

## US-5 — Customer search
Partial-name search filters immediately in the browser; pages contain at most 20 customers. Previous/Next controls navigate the results.

Sales entering Accounting receives an access-denied screen and HTTP 403 from `/api/accounting`. Everyone may view aggregate dashboard values; Warehouse receives no customer/order/invoice/payment records.
