# Domain glossary

- **ERP:** one operational system with shared master and transaction data.
- **Master data:** reusable products and customers; deactivate instead of deleting historical references.
- **SKU:** unique product code such as ARB-1KG.
- **Stock movement:** signed quantity; receipt is positive, confirmed sale is negative. Opening balances are movements too.
- **Stock on hand:** opening movements plus receipts minus sales. A trigger maintains the cached product balance.
- **Reorder level:** threshold used for a low-stock badge.
- **Draft:** editable business intent; no stock is reserved or deducted yet in this minimum version.
- **Confirmation:** one database transaction checking availability, creating stock movements and issuing an invoice.
- **Price snapshot:** unit price copied to an order line, independent of future catalogue changes.
- **VAT:** 7% of the rounded invoice subtotal, rounded to two decimal places.
- **Receivables:** total value of unpaid invoices.
- **Full payment:** exact invoice total, recorded once; it changes the invoice to Paid.
- **Role:** server-controlled permission set; Admin, Sales, Warehouse or Accountant.
- **Atomic:** all changes succeed together or none do.
- **Row lock:** prevents competing confirmations from spending the same stock.
- **Idempotent confirmation:** repeating the operation does not create a second invoice or deduct again.
