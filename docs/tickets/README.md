# Implementation tickets and traceability

These tickets record implemented scope and validation evidence; they do not claim a pre-existing TDD process or team contributions.

| Ticket | User story | Implementation | Validation |
|---|---|---|---|
| ERP-01 | US-3 roles | Password login, session hashes, role matrix, denied Accounting page | Login, logout, 401, 403 tests |
| ERP-02 | Master data / US-5 | Products, customers, tax IDs, deactivation, customer search and 20-row pages | CRUD, invalid fields, inactive customer tests; UI check |
| ERP-03 | US-2 | Seed opening movements, stock-in, balance trigger, low-stock badges | Positive/negative receipt tests and balance reconciliation |
| ERP-04 | US-1 | Multi-line orders, locking, atomic confirmation, frozen invoices | 170→150, VAT, duplicate, shortage, concurrency tests |
| ERP-05 | US-4 | Full payments, Paid flag, dashboard aggregates | Partial/duplicate rejection and paid-state tests |
| ERP-06 | Deployment | Vercel, same-origin API, environment config, public source | Production build, public HTTP and browser checks |

Team follow-up: members choose a real improvement, branch, implement, test and review it under their own accounts.
