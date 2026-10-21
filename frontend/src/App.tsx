import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Leaf,
  LayoutDashboard,
  Package,
  Users,
  Warehouse,
  ShoppingBag,
  Receipt,
  LogOut,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Search,
  ChevronRight,
  X,
  Check,
  ShieldCheck,
  BookOpen,
  RefreshCw,
  Printer,
  AlertTriangle,
  Menu,
} from "lucide-react";
type Row = Record<string, any>;
const money = (n: any) =>
  new Intl.NumberFormat("en-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  }).format(Number(n || 0));
const day = (s: string) =>
  new Date(s).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
async function api(action: string, data: Row = {}) {
  const r = await fetch("/api/" + action, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${r.status} · ${j.error || "Request failed"}`);
  return j;
}
const nav = [
  { id: "dashboard", name: "Overview", icon: LayoutDashboard },
  { id: "orders", name: "Sales orders", icon: ShoppingBag },
  { id: "inventory", name: "Inventory", icon: Warehouse },
  { id: "products", name: "Products", icon: Package },
  { id: "customers", name: "Customers", icon: Users },
  { id: "invoices", name: "Invoices", icon: Receipt },
  { id: "accounting", name: "Accounting", icon: ShieldCheck },
];
const empty = {
  products: [],
  customers: [],
  orders: [],
  invoices: [],
  payments: [],
  movements: [],
  metrics: {},
};
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export default function App() {
  const [user, setUser] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [data, setData] = useState<Row>(empty),
    [page, setPage] = useState("dashboard"),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState<Row | null>(null),
    [form, setForm] = useState<Row>({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false),
    [customerPage, setCustomerPage] = useState(0),
    [accountingAllowed, setAccountingAllowed] = useState(false);
  useEffect(() => {
    setCustomerPage(0);
  }, [search, page]);
  useEffect(() => {
    if (!modal) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setModal(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [modal, busy]);
  const roles = (...r: string[]) => !!user && r.includes(user.role);
  async function refresh() {
    setData(await api("state"));
  }
  useEffect(() => {
    api("me")
      .then(async (u) => {
        setUser(u);
        setData(await api("state"));
      })
      .catch((e) => {
        if (!e.message.startsWith("401")) setError(e.message);
      })
      .finally(() => setLoading(false));
  }, []);
  function open(kind: string, row: Row = {}) {
    setError("");
    setModal({ kind, ...row });
    setForm(
      kind === "order"
        ? { customer_id: "", lines: [{ product_id: "", quantity: 1 }] }
        : kind === "stock"
          ? { product_id: row.id || "", quantity: "", reason: "" }
          : kind === "payment"
            ? {
                invoice_id: row.id,
                amount: row.total,
                method: "bank_transfer",
                reference: "",
              }
            : kind === "product"
              ? {
                  sku: "",
                  name: "",
                  unit: "kg",
                  price: "",
                  cost: 0,
                  reorder_level: 20,
                  ...row,
                }
              : kind === "customer"
                ? {
                    name: "",
                    email: "",
                    address: "",
                    tax_id: "",
                    payment_terms: 0,
                    ...row,
                  }
                : row,
    );
  }
  function change(key: string, value: any) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  async function run(
    action: string,
    payload: Row,
    success: string,
    close = true,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(action, payload);
      await refresh();
      setNotice(success);
      if (close) setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const a = modal?.kind;
    await run(
      a === "product"
        ? "product_save"
        : a === "customer"
          ? "customer_save"
          : a === "stock"
            ? "stock_in"
            : a === "payment"
              ? "payment_create"
              : "order_create",
      form,
      a === "order"
        ? "Draft order created. Review it before confirming."
        : a === "payment"
          ? "Payment recorded. Invoice marked Paid."
          : "Changes saved successfully.",
    );
  }
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const j = await api("login", form);
      setUser(j.user);
      await refresh();
      setForm({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = (key: string) =>
    data[key].filter((r: Row) =>
      JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
    );
  const low = data.products.filter(
    (p: Row) => p.active && Number(p.stock) <= Number(p.reorder_level),
  );
  const metrics = data.metrics;
  if (loading)
    return (
      <div className="loading">
        <Leaf size={40} />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!user)
    return (
      <div className="login">
        <section className="login-story">
          <div className="brand">
            <span className="logo">
              <Leaf />
            </span>
            <div>
              Siam Bean Co.<small>GROWING TOGETHER</small>
            </div>
          </div>
          <div className="login-copy">
            <span className="eyebrow">GOOD COFFEE. CLEAR OPERATIONS.</span>
            <h1>
              From the first bean
              <br />
              to the final invoice.
            </h1>
            <p>
              One shared workspace for your sales, stock, and accounts. A little
              less admin. A lot more clarity.
            </p>
            <div className="bean-art">
              <span />
              <span />
              <span />
            </div>
          </div>
          <p className="login-foot">
            SIAM BEAN CO. <span>MINI ERP · CLASSROOM PROJECT</span>
          </p>
        </section>
        <section className="login-panel">
          <span className="eyebrow">YOUR DAILY WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p>Sign in with your team account to get started.</p>
          <form onSubmit={login}>
            <Field label="Username">
              <input
                autoComplete="username"
                required
                value={form.username || ""}
                onChange={(e) => change("username", e.target.value)}
                placeholder="Your assigned username"
              />
            </Field>
            <Field label="Password">
              <input
                autoComplete="current-password"
                type="password"
                required
                value={form.password || ""}
                onChange={(e) => change("password", e.target.value)}
              />
            </Field>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <button className="primary wide" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to workspace"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <div className="secure">
            <ShieldCheck size={19} />
            <span>
              Role-based access for Admin, Sales,
              <br />
              Warehouse, and Accountant.
            </span>
          </div>
          <p className="small">
            Classroom sample data only. Account details are supplied separately
            by your team.
          </p>
        </section>
      </div>
    );
  function table(headers: string[], rows: ReactNode[]) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows
            ) : (
              <tr>
                <td colSpan={headers.length}>
                  <div className="empty">
                    <Package />
                    <h3>Nothing here yet</h3>
                    <p>Add your first record or adjust your search.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="app">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("dashboard");
          }}
        >
          <span className="logo">
            <Leaf />
          </span>
          <div>
            Siam Bean Co.<small>OPERATIONS WORKSPACE</small>
          </div>
        </a>
        <div className="workspace">
          <span className="workspace-icon">SB</span>
          <div>
            Siam Bean Co.<small>Classroom workspace</small>
          </div>
          <ChevronRight size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav
            .filter(
              (n) =>
                user.role !== "warehouse" ||
                !["orders", "customers", "invoices"].includes(n.id),
            )
            .map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "selected" : ""}
                onClick={async () => {
                  setPage(n.id);
                  setSearch("");
                  setMobile(false);
                  setError("");
                  if (n.id === "accounting") {
                    setAccountingAllowed(false);
                    try {
                      await api("accounting");
                      setAccountingAllowed(true);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }
                }}
              >
                <n.icon size={19} />
                {n.name}
                {n.id === "inventory" && low.length > 0 && (
                  <span className="nav-count">{low.length}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-note">
            <span className="mini-leaf">
              <Leaf size={18} />
            </span>
            <strong>Everything, connected.</strong>
            <p>
              Sales, stock, and accounts.
              <br />
              One source of truth.
            </p>
          </div>
          <button
            className={"help " + (page === "help" ? "selected" : "")}
            onClick={() => {
              setPage("help");
              setMobile(false);
            }}
          >
            <BookOpen size={18} />
            Demo & help
          </button>
          <div className="profile">
            <span className="avatar">
              {user.username.slice(0, 2).toUpperCase()}
            </span>
            <div>
              {user.username}
              <small>{user.role}</small>
            </div>
            <button
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await api("logout");
                setUser(null);
                setData(empty);
                setForm({});
                setPage("dashboard");
                setNotice("");
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="scrim"
          aria-label="Close menu"
          onClick={() => setMobile(false)}
        />
      )}
      <main>
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-btn"
              aria-label="Open menu"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {nav.find((n) => n.id === page)?.name || "Demo & help"}
            </strong>
          </div>
          <div>
            <span className="status-dot" />
            Shared database<Badge tone="green">{user.role}</Badge>
          </div>
        </header>
        <div className="content">
          <div className="page-head">
            <div>
              <span className="eyebrow">SIAM BEAN CO. / OPERATIONS</span>
              <h1>
                {page === "dashboard"
                  ? "A clear view of your business."
                  : page === "help"
                    ? "Ready for the demo."
                    : nav.find((n) => n.id === page)?.name}
              </h1>
              <p>
                {
                  (
                    {
                      dashboard:
                        "Your sales, stock, and payments — all in one place.",
                      orders:
                        "Create, review, and confirm orders with confidence.",
                      inventory: "Keep the right beans on your shelves.",
                      products:
                        "Your coffee catalogue, thoughtfully organised.",
                      customers: "Good relationships start with the details.",
                      invoices: "Every confirmed sale, documented clearly.",
                      accounting:
                        "Record full payments and follow your receivables.",
                      help: "A practical walkthrough of the four user stories.",
                    } as Row
                  )[page]
                }
              </p>
            </div>
            <div className="head-actions">
              {page === "dashboard" && roles("admin", "sales") && (
                <button className="primary" onClick={() => open("order")}>
                  <Plus size={18} />
                  New sales order
                </button>
              )}
              {page === "products" && roles("admin") && (
                <button className="primary" onClick={() => open("product")}>
                  <Plus size={18} />
                  Add product
                </button>
              )}
              {page === "customers" && roles("admin", "sales") && (
                <button className="primary" onClick={() => open("customer")}>
                  <Plus size={18} />
                  Add customer
                </button>
              )}
              {page === "inventory" && roles("admin", "warehouse") && (
                <button className="primary" onClick={() => open("stock")}>
                  <Plus size={18} />
                  Stock in
                </button>
              )}
              {page === "orders" && roles("admin", "sales") && (
                <button className="primary" onClick={() => open("order")}>
                  <Plus size={18} />
                  New order
                </button>
              )}
            </div>
          </div>
          {notice && (
            <div className="notice" role="status">
              <Check size={18} />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {error && !modal && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {page === "dashboard" ? (
            <>
              <div className="metrics">
                {[
                  {
                    label: "Sales today",
                    value: money(metrics.sales_today),
                    sub: "Confirmed invoices · Bangkok time",
                    icon: ArrowUpRight,
                    tone: "sage",
                  },
                  {
                    label: "Outstanding balance",
                    value: money(metrics.receivables),
                    sub: `${metrics.open_invoices || 0} invoices awaiting payment`,
                    icon: Receipt,
                    tone: "cream",
                  },
                  {
                    label: "Low-stock products",
                    value: metrics.low_stock || 0,
                    sub: "At or below reorder level",
                    icon: Package,
                    tone: "peach",
                  },
                  {
                    label: "Payments collected",
                    value: money(metrics.collected),
                    sub: "All recorded payments",
                    icon: Check,
                    tone: "blue",
                  },
                ].map((m) => (
                  <section className="metric" key={m.label}>
                    <div>
                      <span>{m.label}</span>
                      <span className={"metric-icon " + m.tone}>
                        <m.icon size={19} />
                      </span>
                    </div>
                    <strong>{m.value}</strong>
                    <small>{m.sub}</small>
                  </section>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <h2>Recent sales orders</h2>
                      <p>From your customers to your warehouse.</p>
                    </div>
                    <button
                      className="text-btn"
                      onClick={() => setPage("orders")}
                    >
                      View all
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  {table(
                    ["ORDER / CUSTOMER", "TOTAL INCL. VAT", "STATUS"],
                    data.orders.slice(0, 5).map((o: Row) => (
                      <tr
                        key={o.id}
                        onClick={() => open("orderView", o)}
                        className="click-row"
                      >
                        <td>
                          <strong>SO-{String(o.id).padStart(4, "0")}</strong>
                          <small>{o.customer_name}</small>
                        </td>
                        <td>
                          {money(
                            o.lines.reduce(
                              (s: number, l: Row) =>
                                s + Number(l.quantity) * Number(l.unit_price),
                              0,
                            ) * 1.07,
                          )}
                        </td>
                        <td>
                          <Badge
                            tone={o.status === "confirmed" ? "green" : "amber"}
                          >
                            {o.status}
                          </Badge>
                        </td>
                      </tr>
                    )),
                  )}
                </section>
                <section className="panel stock-panel">
                  <div className="panel-head">
                    <div>
                      <h2>Needs a little attention</h2>
                      <p>Keep your shelves ready for tomorrow.</p>
                    </div>
                    <span className="warm-icon">
                      <AlertTriangle size={19} />
                    </span>
                  </div>
                  {low.length ? (
                    low.map((p: Row) => (
                      <div className="stock-item" key={p.id}>
                        <div className="product-symbol">
                          <Leaf size={20} />
                        </div>
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.sku}</small>
                        </div>
                        <div>
                          <strong>
                            {p.stock} {p.unit}
                          </strong>
                          <Badge tone="amber">Low stock</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty">
                      <Check />
                      <p>All products are above their reorder level.</p>
                    </div>
                  )}
                  <button
                    className="secondary wide"
                    onClick={() => setPage("inventory")}
                  >
                    Manage inventory
                    <ArrowUpRight size={16} />
                  </button>
                </section>
              </div>
              <section className="journey">
                <div className="journey-copy">
                  <span className="eyebrow">ONE CONNECTED WORKFLOW</span>
                  <h2>Good things flow together.</h2>
                  <p>
                    Every confirmed order updates stock, creates an invoice,
                    <br />
                    and keeps your dashboard in step.
                  </p>
                </div>
                <div className="flow">
                  <span>
                    <ShoppingBag />
                    Sales order
                  </span>
                  <ChevronRight />
                  <span>
                    <Warehouse />
                    Stock updated
                  </span>
                  <ChevronRight />
                  <span>
                    <Receipt />
                    Invoice & payment
                  </span>
                </div>
              </section>
            </>
          ) : page === "accounting" && !accountingAllowed ? (
            <section className="panel help-content">
              <ShieldCheck size={30} />
              <h2>Accounting access restricted</h2>
              <p>
                This screen is available to Admin and Accountant. The API
                enforces this permission.
              </p>
            </section>
          ) : page === "help" ? (
            <div className="help-grid">
              <section className="panel help-content">
                <h2>Your 10-minute demonstration</h2>
                <ol>
                  <li>
                    <strong>Minute 0–1 · The problem</strong>
                    <p>
                      Disconnected spreadsheets cause stock mistakes and unpaid
                      invoices. Siam Bean brings every step into one shared
                      database.
                    </p>
                  </li>
                  <li>
                    <strong>Minute 1–4 · Order to invoice</strong>
                    <p>
                      As Admin or Sales, create an order for Café Lune: 20 kg of
                      ARB-1KG at ฿450/kg. Confirm it. Stock decreases by 20 kg
                      and the invoice is ฿9,630 (฿9,000 + ฿630 VAT).
                    </p>
                  </li>
                  <li>
                    <strong>Minute 4–5 · Record payment</strong>
                    <p>
                      Sign in as Accountant or Admin. Open the invoice and
                      record the full payment. Check the Paid badge and updated
                      dashboard.
                    </p>
                  </li>
                  <li>
                    <strong>Minute 5–7 · Roles and failure</strong>
                    <p>
                      Sign in as Warehouse. Receive stock, then use the
                      permission check below. Also try confirming an order
                      larger than available stock as Sales: no stock or invoice
                      changes.
                    </p>
                  </li>
                  <li>
                    <strong>Minute 7–10 · Q&A</strong>
                    <p>
                      Explain database relationships, role checks, transaction
                      locks, and tests. Each member should be ready to explain a
                      user story.
                    </p>
                  </li>
                </ol>
              </section>
              <section className="panel help-content">
                <ShieldCheck size={28} />
                <h2>Permissions are enforced.</h2>
                <p>
                  The interface follows your role, and the server checks it
                  again on every request.
                </p>
                <div className="role-list">
                  <p>
                    <strong>Admin</strong>All workflows and product management
                  </p>
                  <p>
                    <strong>Sales</strong>Customers, draft orders, confirmation
                  </p>
                  <p>
                    <strong>Warehouse</strong>Stock-in and shared operational
                    reports
                  </p>
                  <p>
                    <strong>Accountant</strong>Invoice payments and shared
                    reports
                  </p>
                </div>
                {!roles("admin", "sales") && (
                  <button
                    className="secondary wide"
                    onClick={async () => {
                      try {
                        await api("order_confirm", { id: 0 });
                        setNotice("Unexpected success");
                      } catch (e) {
                        setNotice(
                          "Permission check passed: " + (e as Error).message,
                        );
                      }
                    }}
                  >
                    Test blocked sales action (403)
                  </button>
                )}
                <p className="small">
                  Sample business and customers. This is a classroom
                  demonstration; recording a payment does not transfer money.
                </p>
              </section>
            </div>
          ) : (
            <section className="panel">
              <div className="list-toolbar">
                <div className="search">
                  <Search size={18} />
                  <input
                    aria-label="Search records"
                    placeholder={`Search ${page === "invoices" ? "invoices" : page}…`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await refresh();
                      setNotice("Data refreshed.");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>
              {page === "products" &&
                table(
                  ["PRODUCT", "SKU", "UNIT PRICE", "STOCK", "STATUS", ""],
                  filtered("products").map((p: Row) => (
                    <tr key={p.id}>
                      <td>
                        <div className="product-name">
                          <span className="product-symbol">
                            <Leaf size={19} />
                          </span>
                          <strong>{p.name}</strong>
                        </div>
                      </td>
                      <td>
                        <code>{p.sku}</code>
                      </td>
                      <td>
                        {money(p.price)} / {p.unit}
                      </td>
                      <td>
                        {p.stock} {p.unit}
                        {p.active &&
                          Number(p.stock) <= Number(p.reorder_level) && (
                            <div>
                              <Badge tone="amber">Low stock</Badge>
                            </div>
                          )}
                      </td>
                      <td>
                        <Badge tone={p.active ? "green" : "neutral"}>
                          {p.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="actions">
                        {roles("admin") && (
                          <>
                            <button
                              className="text-btn"
                              onClick={() => open("product", p)}
                            >
                              Edit
                            </button>
                            <button
                              className="text-btn muted"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  "product_active",
                                  { id: p.id, active: !p.active },
                                  "Product status updated.",
                                  false,
                                )
                              }
                            >
                              {p.active ? "Deactivate" : "Activate"}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  )),
                )}
              {page === "customers" &&
                table(
                  ["CUSTOMER", "TAX ID / TERMS", "EMAIL", "STATUS", ""],
                  filtered("customers")
                    .slice(customerPage * 20, (customerPage + 1) * 20)
                    .map((c: Row) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                          <small>CUS-{String(c.id).padStart(3, "0")}</small>
                        </td>
                        <td>
                          <code>{c.tax_id}</code>
                          <small>
                            {c.payment_terms === 0
                              ? "Cash"
                              : c.payment_terms + " days"}
                          </small>
                        </td>
                        <td>{c.email}</td>
                        <td>
                          <Badge tone={c.active ? "green" : "neutral"}>
                            {c.active ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                        <td className="actions">
                          {roles("admin", "sales") && (
                            <>
                              <button
                                className="text-btn"
                                onClick={() => open("customer", c)}
                              >
                                Edit
                              </button>
                              <button
                                className="text-btn muted"
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    "customer_active",
                                    { id: c.id, active: !c.active },
                                    "Customer status updated.",
                                    false,
                                  )
                                }
                              >
                                {c.active ? "Deactivate" : "Activate"}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    )),
                )}
              {page === "customers" && (
                <div className="pagination">
                  <span>
                    {filtered("customers").length} customers · 20 per page
                  </span>
                  <button
                    className="secondary"
                    disabled={customerPage === 0}
                    onClick={() => setCustomerPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span>Page {customerPage + 1}</span>
                  <button
                    className="secondary"
                    disabled={
                      (customerPage + 1) * 20 >= filtered("customers").length
                    }
                    onClick={() => setCustomerPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
              {page === "inventory" && (
                <>
                  {table(
                    ["PRODUCT", "ON HAND", "REORDER LEVEL", "STOCK HEALTH", ""],
                    filtered("products").map((p: Row) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <small>{p.sku}</small>
                        </td>
                        <td>
                          <strong>{p.stock}</strong> {p.unit}
                        </td>
                        <td>
                          {p.reorder_level} {p.unit}
                        </td>
                        <td>
                          <Badge
                            tone={
                              !p.active
                                ? "neutral"
                                : Number(p.stock) <= Number(p.reorder_level)
                                  ? "amber"
                                  : "green"
                            }
                          >
                            {!p.active
                              ? "Inactive"
                              : Number(p.stock) <= Number(p.reorder_level)
                                ? "Low stock"
                                : "Healthy"}
                          </Badge>
                        </td>
                        <td>
                          {p.active && roles("admin", "warehouse") && (
                            <button
                              className="text-btn"
                              onClick={() => open("stock", p)}
                            >
                              <Plus size={16} />
                              Stock in
                            </button>
                          )}
                        </td>
                      </tr>
                    )),
                  )}
                  <div className="panel-head divider">
                    <div>
                      <h2>Stock movement history</h2>
                      <p>
                        A traceable record of every receipt and confirmed order.
                      </p>
                    </div>
                  </div>
                  {table(
                    ["DATE", "SKU", "CHANGE", "REASON"],
                    data.movements.map((m: Row) => (
                      <tr key={m.id}>
                        <td>{day(m.created_at)}</td>
                        <td>
                          <code>{m.sku}</code>
                        </td>
                        <td>
                          <Badge
                            tone={Number(m.quantity) > 0 ? "green" : "neutral"}
                          >
                            {Number(m.quantity) > 0 ? "+" : ""}
                            {m.quantity}
                          </Badge>
                        </td>
                        <td>
                          {m.reason}
                          {m.order_id &&
                            ` · SO-${String(m.order_id).padStart(4, "0")}`}
                        </td>
                      </tr>
                    )),
                  )}
                </>
              )}
              {page === "orders" &&
                table(
                  [
                    "ORDER",
                    "CUSTOMER",
                    "CREATED",
                    "TOTAL INCL. VAT",
                    "STATUS",
                    "",
                  ],
                  filtered("orders").map((o: Row) => (
                    <tr key={o.id}>
                      <td>
                        <strong>SO-{String(o.id).padStart(4, "0")}</strong>
                        <small>{o.lines.length} line items</small>
                      </td>
                      <td>{o.customer_name}</td>
                      <td>{day(o.created_at)}</td>
                      <td>
                        {money(
                          o.lines.reduce(
                            (s: number, l: Row) =>
                              s + Number(l.quantity) * Number(l.unit_price),
                            0,
                          ) * 1.07,
                        )}
                      </td>
                      <td>
                        <Badge
                          tone={o.status === "confirmed" ? "green" : "amber"}
                        >
                          {o.status}
                        </Badge>
                      </td>
                      <td>
                        <button
                          className="text-btn"
                          onClick={() => open("orderView", o)}
                        >
                          View order
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  )),
                )}
              {(page === "invoices" || page === "accounting") &&
                table(
                  ["INVOICE", "CUSTOMER", "ISSUED", "AMOUNT", "STATUS", ""],
                  filtered("invoices").map((i: Row) => (
                    <tr key={i.id}>
                      <td>
                        <strong>{i.number}</strong>
                        <small>SO-{String(i.order_id).padStart(4, "0")}</small>
                      </td>
                      <td>{i.customer_name}</td>
                      <td>{day(i.created_at)}</td>
                      <td>{money(i.total)}</td>
                      <td>
                        <Badge tone={i.status === "paid" ? "green" : "amber"}>
                          {i.status}
                        </Badge>
                      </td>
                      <td>
                        <button
                          className="text-btn"
                          onClick={() => open("invoice", i)}
                        >
                          Open invoice
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  )),
                )}
            </section>
          )}
          <footer>
            Siam Bean Co.{" "}
            <span>Built for better days, one bean at a time.</span>
            <span>All amounts in THB · VAT 7%</span>
          </footer>
        </div>
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className={
              "modal " +
              (["invoice", "orderView"].includes(modal.kind) ? "large" : "")
            }
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">SIAM BEAN CO.</span>
                <h2 id="dialog-title">
                  {
                    (
                      {
                        product: form.id ? "Edit product" : "Add a product",
                        customer: form.id ? "Edit customer" : "Add a customer",
                        stock: "Receive stock",
                        order: "New sales order",
                        payment: "Record full payment",
                        invoice: modal.number,
                        orderView: `Sales order SO-${String(modal.id).padStart(4, "0")}`,
                      } as Row
                    )[modal.kind]
                  }
                </h2>
              </div>
              <button
                className="icon-btn"
                aria-label="Close dialog"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                <X />
              </button>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {["invoice", "orderView"].includes(modal.kind) ? (
              <div className="document">
                <div className="document-info">
                  <div>
                    <small>BILL TO</small>
                    <h3>{modal.customer_name}</h3>
                    <p>
                      {modal.customer_address ||
                        data.customers.find(
                          (c: Row) => c.id === modal.customer_id,
                        )?.address}
                    </p>
                    <p>
                      Tax ID:{" "}
                      {modal.customer_tax_id ||
                        data.customers.find(
                          (c: Row) => c.id === modal.customer_id,
                        )?.tax_id}
                    </p>
                  </div>
                  <div>
                    <Badge
                      tone={
                        ["paid", "confirmed"].includes(modal.status)
                          ? "green"
                          : "amber"
                      }
                    >
                      {modal.status}
                    </Badge>
                    <p>Issued {day(modal.created_at)}</p>
                    {modal.due_date && <p>Due {day(modal.due_date)}</p>}
                  </div>
                </div>
                {table(
                  ["DESCRIPTION", "QUANTITY", "UNIT PRICE", "AMOUNT"],
                  modal.lines.map((l: Row) => (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.name}</strong>
                        <small>{l.sku}</small>
                      </td>
                      <td>{l.quantity}</td>
                      <td>{money(l.unit_price)}</td>
                      <td>
                        {money(Number(l.quantity) * Number(l.unit_price))}
                      </td>
                    </tr>
                  )),
                )}
                <div className="totals">
                  <p>
                    Subtotal
                    <strong>
                      {money(
                        modal.subtotal ??
                          modal.lines.reduce(
                            (s: number, l: Row) =>
                              s + Number(l.quantity) * Number(l.unit_price),
                            0,
                          ),
                      )}
                    </strong>
                  </p>
                  <p>
                    VAT (7%)
                    <strong>
                      {money(
                        modal.vat ??
                          modal.lines.reduce(
                            (s: number, l: Row) =>
                              s + Number(l.quantity) * Number(l.unit_price),
                            0,
                          ) * 0.07,
                      )}
                    </strong>
                  </p>
                  <p className="total">
                    Total due
                    <strong>
                      {money(
                        modal.total ??
                          modal.lines.reduce(
                            (s: number, l: Row) =>
                              s + Number(l.quantity) * Number(l.unit_price),
                            0,
                          ) * 1.07,
                      )}
                    </strong>
                  </p>
                </div>
                {modal.kind === "invoice" && modal.status === "paid" && (
                  <div className="notice">
                    <Check size={18} />
                    Paid in full ·{" "}
                    {data.payments
                      .find((p: Row) => p.invoice_id === modal.id)
                      ?.method?.replace("_", " ")}
                  </div>
                )}
                <div className="modal-actions">
                  {modal.kind === "orderView" &&
                    modal.status === "draft" &&
                    roles("admin", "sales") && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            "order_confirm",
                            { id: modal.id },
                            "Order confirmed. Stock updated and invoice created.",
                          )
                        }
                      >
                        {busy
                          ? "Confirming…"
                          : "Confirm order & create invoice"}
                        <Check size={17} />
                      </button>
                    )}
                  {modal.kind === "invoice" && (
                    <>
                      <button
                        className="secondary"
                        onClick={() => window.print()}
                      >
                        <Printer size={17} />
                        Print invoice
                      </button>
                      {modal.status === "unpaid" &&
                        roles("admin", "accountant") && (
                          <button
                            className="primary"
                            onClick={() => open("payment", modal)}
                          >
                            Record payment
                            <ArrowDownLeft size={17} />
                          </button>
                        )}
                    </>
                  )}
                  {modal.kind === "orderView" &&
                    modal.status === "confirmed" && (
                      <button
                        className="primary"
                        onClick={() =>
                          open(
                            "invoice",
                            data.invoices.find(
                              (i: Row) => i.order_id === modal.id,
                            ),
                          )
                        }
                      >
                        Open invoice
                        <Receipt size={16} />
                      </button>
                    )}
                </div>
              </div>
            ) : (
              <form onSubmit={submit}>
                {modal.kind === "product" && (
                  <>
                    <Field label="Product name">
                      <input
                        required
                        maxLength={120}
                        value={form.name}
                        onChange={(e) => change("name", e.target.value)}
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label="SKU">
                        <input
                          required
                          maxLength={40}
                          value={form.sku}
                          onChange={(e) => change("sku", e.target.value)}
                        />
                      </Field>
                      <Field label="Unit">
                        <select
                          value={form.unit}
                          onChange={(e) => change("unit", e.target.value)}
                        >
                          <option>kg</option>
                          <option>bag</option>
                          <option>box</option>
                        </select>
                      </Field>
                      <Field label="Unit price (THB)">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={form.price}
                          onChange={(e) => change("price", e.target.value)}
                        />
                      </Field>
                      <Field label="Cost (THB)">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={form.cost}
                          onChange={(e) => change("cost", e.target.value)}
                        />
                      </Field>
                      <Field label="Reorder level">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          required
                          value={form.reorder_level}
                          onChange={(e) =>
                            change("reorder_level", e.target.value)
                          }
                        />
                      </Field>
                    </div>
                    <p className="small">
                      New products start with zero stock. Receive stock from
                      Inventory.
                    </p>
                  </>
                )}
                {modal.kind === "customer" && (
                  <>
                    <div className="form-grid">
                      <Field label="Tax ID (13 digits)">
                        <input
                          required
                          pattern="[0-9]{13}"
                          maxLength={13}
                          value={form.tax_id}
                          onChange={(e) => change("tax_id", e.target.value)}
                        />
                      </Field>
                      <Field label="Payment terms (days)">
                        <input
                          required
                          type="number"
                          min="0"
                          max="365"
                          value={form.payment_terms}
                          onChange={(e) =>
                            change("payment_terms", e.target.value)
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Customer name">
                      <input
                        required
                        maxLength={120}
                        value={form.name}
                        onChange={(e) => change("name", e.target.value)}
                      />
                    </Field>
                    <Field label="Email">
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => change("email", e.target.value)}
                      />
                    </Field>
                    <Field label="Billing address">
                      <textarea
                        required
                        maxLength={300}
                        value={form.address}
                        onChange={(e) => change("address", e.target.value)}
                      />
                    </Field>
                  </>
                )}
                {modal.kind === "stock" && (
                  <>
                    <Field label="Product">
                      <select
                        required
                        value={form.product_id}
                        onChange={(e) => change("product_id", e.target.value)}
                      >
                        <option value="">Choose a product</option>
                        {data.products
                          .filter((p: Row) => p.active)
                          .map((p: Row) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} · {p.name} ({p.stock} {p.unit})
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Quantity received">
                      <input
                        type="number"
                        min="0.001"
                        max="100000"
                        step="0.001"
                        required
                        value={form.quantity}
                        onChange={(e) => change("quantity", e.target.value)}
                      />
                    </Field>
                    <Field label="Reason / delivery reference">
                      <input
                        required
                        maxLength={200}
                        value={form.reason}
                        onChange={(e) => change("reason", e.target.value)}
                        placeholder="e.g. Supplier delivery PO-001"
                      />
                    </Field>
                  </>
                )}
                {modal.kind === "order" && (
                  <>
                    <Field label="Customer">
                      <select
                        required
                        value={form.customer_id}
                        onChange={(e) => change("customer_id", e.target.value)}
                      >
                        <option value="">Choose a customer</option>
                        {data.customers
                          .filter((c: Row) => c.active)
                          .map((c: Row) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <span className="field-label">Order lines</span>
                    {form.lines.map((l: Row, index: number) => (
                      <div className="order-line" key={index}>
                        <select
                          aria-label={`Product ${index + 1}`}
                          required
                          value={l.product_id}
                          onChange={(e) =>
                            change(
                              "lines",
                              form.lines.map((v: Row, n: number) =>
                                n === index
                                  ? { ...v, product_id: e.target.value }
                                  : v,
                              ),
                            )
                          }
                        >
                          <option value="">Select product</option>
                          {data.products
                            .filter((p: Row) => p.active)
                            .map((p: Row) => (
                              <option key={p.id} value={p.id}>
                                {p.sku} · {money(p.price)}
                              </option>
                            ))}
                        </select>
                        <input
                          aria-label={`Quantity ${index + 1}`}
                          type="number"
                          min="0.001"
                          max="100000"
                          step="0.001"
                          required
                          value={l.quantity}
                          onChange={(e) =>
                            change(
                              "lines",
                              form.lines.map((v: Row, n: number) =>
                                n === index
                                  ? { ...v, quantity: e.target.value }
                                  : v,
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove line ${index + 1}`}
                          disabled={form.lines.length === 1}
                          onClick={() =>
                            change(
                              "lines",
                              form.lines.filter(
                                (_: Row, n: number) => n !== index,
                              ),
                            )
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() =>
                        change("lines", [
                          ...form.lines,
                          { product_id: "", quantity: 1 },
                        ])
                      }
                    >
                      <Plus size={16} />
                      Add another line
                    </button>
                    <div className="info">
                      A draft reserves no stock. Confirmation updates stock and
                      creates the invoice together.
                    </div>
                  </>
                )}
                {modal.kind === "payment" && (
                  <>
                    <div className="payment-total">
                      <small>FULL AMOUNT DUE</small>
                      <strong>{money(form.amount)}</strong>
                      <p>INV-{String(form.invoice_id).padStart(4, "0")}</p>
                    </div>
                    <Field label="Payment method">
                      <select
                        value={form.method}
                        onChange={(e) => change("method", e.target.value)}
                      >
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="cash">Cash</option>
                      </select>
                    </Field>
                    <Field label="Payment reference (optional)">
                      <input
                        maxLength={120}
                        value={form.reference}
                        onChange={(e) => change("reference", e.target.value)}
                      />
                    </Field>
                    <p className="small">
                      Record a received payment. This action does not transfer
                      money.
                    </p>
                  </>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy
                      ? "Saving…"
                      : modal.kind === "order"
                        ? "Create draft order"
                        : modal.kind === "payment"
                          ? "Record full payment"
                          : "Save changes"}
                    <Check size={17} />
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
