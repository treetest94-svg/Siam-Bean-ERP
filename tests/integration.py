"""Run against the real Supabase database via FastAPI or a deployed URL.
Usage: ERP_TEST_CREDENTIALS=/private/accounts.json python tests/integration.py
Optional ERP_BASE_URL=https://your-deployment.vercel.app
Creates isolated QA product/customer records and leaves them inactive after testing.
"""

import os, sys, json, uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
import httpx
from backend.main import app

creds = json.loads(Path(os.environ["ERP_TEST_CREDENTIALS"]).read_text())
base = os.environ.get("ERP_BASE_URL")
clients = {
    r: (httpx.Client(base_url=base, timeout=40) if base else TestClient(app))
    for r in creds
}
count = 0


def check(v, label):
    global count
    assert v, label
    count += 1
    print("PASS", label, flush=True)


def call(role, action, data=None):
    return clients[role].post("/api/" + action, json=data or {})


check(call("admin", "state").status_code == 401, "Unauthenticated requests rejected")
check(
    call("admin", "login", {"username": "admin", "password": "wrong"}).status_code
    == 401,
    "Incorrect password rejected",
)
for r, p in creds.items():
    res = call(r, "login", {"username": r, "password": p})
    check(
        res.status_code == 200 and res.json()["user"]["role"] == r,
        "Login and server role: " + r,
    )
    check("token" not in res.json(), "Token is not exposed in JSON: " + r)
check("HttpOnly" in res.headers.get("set-cookie", ""), "HttpOnly session cookie")
check(
    call("warehouse", "order_confirm", {"id": 0}).status_code == 403,
    "Warehouse cannot confirm orders",
)
check(call("sales", "accounting").status_code == 403, "Sales Accounting access denied")
check(call("admin", "accounting").status_code == 200, "Admin Accounting access allowed")
check(call("sales", "stock_in", {}).status_code == 403, "Sales cannot receive stock")
check(
    call("sales", "payment_create", {}).status_code == 403,
    "Sales cannot record payments",
)
check(
    call("accountant", "product_save", {}).status_code == 403,
    "Accountant cannot edit products",
)
check(
    call(
        "admin", "product_save", {"sku": "", "name": "", "price": 0, "reorder_level": 0}
    ).status_code
    == 422,
    "Required product fields validated",
)
check(
    clients["admin"]
    .post("/api/state", json={}, headers={"Origin": "https://untrusted.example"})
    .status_code
    == 403,
    "Cross-origin write blocked",
)
suffix = uuid.uuid4().hex[:8]
p = call(
    "admin",
    "product_save",
    {
        "sku": "QA-" + suffix,
        "name": "QA transaction test",
        "unit": "kg",
        "price": 450,
        "reorder_level": 10,
    },
).json()
pid = p["id"]
c = call(
    "sales",
    "customer_save",
    {
        "name": "QA customer " + suffix,
        "email": "qa@example.test",
        "address": "Synthetic test record",
        "tax_id": "9999999999999",
        "payment_terms": 30,
    },
).json()
cid = c["id"]
check(pid > 0 and cid > 0, "Product and customer creation")
check(
    call(
        "warehouse", "stock_in", {"product_id": pid, "quantity": -1, "reason": "bad"}
    ).status_code
    == 422,
    "Negative stock-in rejected",
)
check(
    call(
        "warehouse",
        "stock_in",
        {"product_id": pid, "quantity": 170, "reason": "Automated acceptance test"},
    ).status_code
    == 200,
    "Warehouse receives 170 units",
)


def state():
    return call("admin", "state").json()


def stock():
    return next(p["stock"] for p in state()["products"] if p["id"] == pid)


order = call(
    "sales",
    "order_create",
    {"customer_id": cid, "lines": [{"product_id": pid, "quantity": 20}]},
).json()["id"]
check(stock() == 170, "Draft order does not reduce stock")
r = call("sales", "order_confirm", {"id": order})
print("Confirmation result:", r.status_code, r.json(), flush=True)
check(r.status_code == 200 and r.json()["total"] == 9630, "20 × 450 + 7% VAT = 9630")
invoice = r.json()["invoice_id"]
check(stock() == 150, "Confirmed stock falls from 170 to 150")
call("sales", "order_confirm", {"id": order})
check(stock() == 150, "Duplicate confirmation is idempotent")
s = state()
inv = next(i for i in s["invoices"] if i["id"] == invoice)
check(
    inv["number"].startswith("INV-") and inv["subtotal"] == 9000 and inv["vat"] == 630,
    "Invoice number and stored VAT",
)
check(inv["lines"][0]["quantity"] == 20, "Invoice retains matching order lines")
check(
    call(
        "admin",
        "product_save",
        {
            "id": pid,
            "sku": "QA-" + suffix,
            "name": "QA price changed",
            "unit": "kg",
            "price": 500,
            "reorder_level": 10,
        },
    ).status_code
    == 200,
    "Product can be edited",
)
check(
    next(i for i in state()["invoices"] if i["id"] == invoice)["lines"][0]["unit_price"]
    == 450,
    "Invoice price snapshot remains unchanged",
)
big = call(
    "sales",
    "order_create",
    {"customer_id": cid, "lines": [{"product_id": pid, "quantity": 10000}]},
).json()["id"]
before = state()
check(
    call("sales", "order_confirm", {"id": big}).status_code == 409,
    "Insufficient stock returns conflict",
)
after = state()
check(
    stock() == 150
    and len(after["invoices"]) == len(before["invoices"])
    and len(after["movements"]) == len(before["movements"]),
    "Failed confirmation changes no stock, invoice or movement",
)
check(
    call(
        "accountant",
        "payment_create",
        {"invoice_id": invoice, "amount": 1, "method": "cash"},
    ).status_code
    == 422,
    "Partial payment rejected",
)
check(
    call(
        "accountant",
        "payment_create",
        {
            "invoice_id": invoice,
            "amount": 9630,
            "method": "bank_transfer",
            "reference": "QA",
        },
    ).status_code
    == 200,
    "Full payment accepted",
)
check(
    next(i for i in state()["invoices"] if i["id"] == invoice)["status"] == "paid",
    "Invoice becomes Paid",
)
check(
    call(
        "accountant",
        "payment_create",
        {"invoice_id": invoice, "amount": 9630, "method": "cash"},
    ).status_code
    == 409,
    "Duplicate payment rejected",
)
check(len(state()["metrics"]) >= 3, "Dashboard metrics returned from database")
# Competing orders: exactly one may consume the remaining stock.
orders = [
    call(
        "sales",
        "order_create",
        {"customer_id": cid, "lines": [{"product_id": pid, "quantity": 100}]},
    ).json()["id"]
    for _ in range(2)
]
with ThreadPoolExecutor(2) as pool:
    results = list(
        pool.map(
            lambda oid: call("sales", "order_confirm", {"id": oid}).status_code, orders
        )
    )
check(
    sorted(results) == [200, 409] and stock() == 50, "Concurrent orders cannot oversell"
)
call("admin", "product_active", {"id": pid, "active": False})
call("sales", "customer_active", {"id": cid, "active": False})
check(
    not next(p for p in state()["products"] if p["id"] == pid)["active"],
    "Product deactivation persists",
)
check(
    not next(c for c in state()["customers"] if c["id"] == cid)["active"],
    "Customer deactivation persists",
)
check(
    call(
        "sales",
        "order_create",
        {"customer_id": cid, "lines": [{"product_id": pid, "quantity": 1}]},
    ).status_code
    == 422,
    "Inactive customer cannot place orders",
)
call("admin", "logout")
check(call("admin", "state").status_code == 401, "Logout invalidates session")
print(f"ALL {count} CHECKS PASSED")
