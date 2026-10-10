// Run: deno test supabase/functions/whatsapp/bot_test.ts
import { handle, statusMessage, type Deps, type Input, type Reply, type Session, type ShopInfo } from "./bot.ts";

const INFO: ShopInfo = {
  name: "Star Eggs", phone: "9876500000", whatsapp: "9876500000", upi: "stareggs@okaxis", open: true, cod: true,
  price_12: 240, price_30: 600, stock_12: true, stock_30: true, min_order: 0, pincodes: "500008, 500028",
  delivery_note: "Delivered across Hyderabad within 24 hours.",
};
const PHONE = "919848012345";

function fakeDeps() {
  const orders: { order_no: string; phone: string; total: number; status: string; payment_method: string; payment_status: string; created_at: string; utr?: string; args?: unknown }[] = [];
  const alerts: string[] = [];
  let n = 1000;
  const deps: Deps = {
    async placeOrder(o) {
      const items = o.items.map((i) => ({ pack: i.pack, qty: i.qty, rate: i.pack === "12" ? 240 : 600, amount: (i.pack === "12" ? 240 : 600) * i.qty }));
      const total = items.reduce((s, i) => s + i.amount, 0);
      if (!["500008", "500028"].includes(o.pincode)) throw new Error("NO_DELIVERY");
      const order_no = "ORD-" + ++n;
      orders.unshift({ order_no, phone: o.phone.slice(-10), total, status: "new", payment_method: o.payment, payment_status: "pending", created_at: new Date().toISOString(), args: o });
      return { order_no, total, items, payment: o.payment, upi: INFO.upi };
    },
    async recentOrders(phone) { return orders.filter((o) => o.phone === phone.slice(-10)); },
    async reportPayment(no, _p, ref) { const o = orders.find((x) => x.order_no === no); if (!o || o.payment_status !== "pending") return false; o.payment_status = "claimed"; o.utr = ref; return true; },
    async alertOwner(t) { alerts.push(t); },
  };
  return { deps, orders, alerts };
}

function assert(c: unknown, msg: string) { if (!c) throw new Error(msg); }
const textOf = (r: Reply[]) => r.map((x) => x.text).join("\n---\n");
const ids = (r: Reply[]) => r.flatMap((x) => x.kind === "buttons" ? x.buttons.map((b) => b.id) : x.kind === "list" ? x.rows.map((b) => b.id) : []);

async function chat(steps: Input[], info = INFO, start: Session = {}, deps = fakeDeps(), log = false) {
  let s = start; let last: Reply[] = []; let t = Date.now();
  for (const i of steps) {
    const r = await handle(s, i, PHONE, info, deps.deps, (t += 1000));
    s = r.session; last = r.replies;
    if (log) console.log(`> ${i.text ?? i.id ?? "📍"}\n${textOf(r.replies)}\n   [${ids(r.replies).join(" | ")}]\n`);
  }
  return { s, last, deps };
}

Deno.test("full first order with UPI, then UPI reference", async () => {
  const d = fakeDeps();
  const { s, last } = await chat([
    { text: "Hi", name: "Asha Rao" }, { id: "order" }, { id: "pack_12" }, { id: "qty_2" }, { id: "add_more" }, { id: "pack_30" }, { text: "1" },
    { id: "checkout" }, { text: "Asha Rao" }, { text: "Flat 4, Road 2, near Masjid, Tolichowki" }, { text: "500008" }, { id: "pay_upi" }, { id: "place" },
  ], INFO, {}, d, true);
  assert(d.orders.length === 1, "one order");
  assert(d.orders[0].total === 1080, "total 1080, got " + d.orders[0].total);
  assert(textOf(last).includes("ORD-1001") && textOf(last).includes("stareggs@okaxis"), "UPI instructions");
  assert(s.step === "utr", "waiting for UPI ref");
  assert(d.alerts.some((a) => a.includes("New WhatsApp order ORD-1001")), "owner alerted");
  const r = await handle(s, { text: "4123 5678 9012" }, PHONE, INFO, d.deps);
  assert(d.orders[0].payment_status === "claimed" && d.orders[0].utr === "412356789012", "payment reported");
  assert(textOf(r.replies).includes("412356789012"), "thanks message");
});

Deno.test("repeat customer reuses address and pays cash", async () => {
  const d = fakeDeps();
  const first = await chat([{ id: "order" }, { id: "pack_30" }, { id: "qty_1" }, { id: "checkout" }, { text: "Ravi" }, { text: "H.No 12-3, Masab Tank 500028" }, { id: "pay_cod" }, { id: "place" }], INFO, {}, d);
  assert(d.orders.length === 1, "first order");
  const { last } = await chat([{ text: "order" }, { text: "box" }, { text: "3" }, { text: "checkout" }, { id: "addr_same" }, { text: "cash" }, { text: "yes" }], INFO, first.s, d, true);
  assert(d.orders.length === 2 && d.orders[0].total === 720, "second order 720");
  assert((d.orders[0].args as { address: string }).address.includes("Masab Tank"), "same address reused");
  assert(textOf(last).includes("ready in cash"), "COD message");
});

Deno.test("pincode outside delivery area is refused", async () => {
  const { s, last } = await chat([{ id: "order" }, { id: "pack_12" }, { id: "qty_1" }, { id: "checkout" }, { text: "Zara" }, { text: "Plot 9, Kondapur main road" }, { text: "500084" }], INFO, {}, fakeDeps(), true);
  assert(textOf(last).includes("don't deliver to 500084"), "refused");
  assert(ids(last).includes("addr_new"), "offers another address");
  const r = await handle(s, { id: "addr_new" }, PHONE, INFO, fakeDeps().deps);
  assert(r.session.step === "address", "asks for new address");
});

Deno.test("shared location is used as the address", async () => {
  const { s } = await chat([{ id: "order" }, { id: "pack_12" }, { id: "qty_1" }, { id: "checkout" }, { text: "Imran" },
    { location: { latitude: 17.39, longitude: 78.41, name: "Green Apartments", address: "Tolichowki, Hyderabad" } }]);
  assert(s.step === "pincode", "asks pincode after location");
  assert(s.draft?.address?.includes("maps.google.com/?q=17.39,78.41"), "map link saved");
});

Deno.test("words inside name/address don't trigger shortcuts", async () => {
  const { s } = await chat([{ id: "order" }, { id: "pack_12" }, { id: "qty_1" }, { id: "checkout" }, { text: "Hina" }, { text: "Call before coming, Flat 2, Road 5 500008" }]);
  assert(s.step === "pay", "went on to payment, step=" + s.step);
  assert(s.draft?.address?.startsWith("Call before coming"), "kept the address");
});

Deno.test("bad quantity, closed shop, sold out, minimum order", async () => {
  let r = await chat([{ id: "order" }, { id: "pack_12" }, { text: "lots" }]);
  assert(textOf(r.last).includes("1 to 50"), "asks for number");
  r = await chat([{ text: "hello" }], { ...INFO, open: false });
  assert(textOf(r.last).includes("not taking orders"), "closed message");
  r = await chat([{ id: "order" }], { ...INFO, stock_12: false, stock_30: false });
  assert(textOf(r.last).includes("sold out"), "sold out");
  r = await chat([{ id: "order" }], { ...INFO, stock_12: false });
  assert(ids(r.last).join() === "pack_30", "only trays offered");
  r = await chat([{ id: "order" }, { id: "pack_12" }, { id: "qty_1" }, { id: "checkout" }], { ...INFO, min_order: 500 });
  assert(textOf(r.last).includes("minimum order is ₹500"), "minimum enforced");
});

Deno.test("no cash on delivery skips the payment question", async () => {
  const { s, last } = await chat([{ id: "order" }, { id: "pack_12" }, { id: "qty_1" }, { id: "checkout" }, { text: "Asha" }, { text: "Flat 4, Road 2, Tolichowki 500008" }], { ...INFO, cod: false });
  assert(s.step === "confirm" && s.pay === "upi", "straight to confirm with UPI");
  assert(ids(last).includes("place"), "place button");
});

Deno.test("my orders, help, cancel, unsupported", async () => {
  const d = fakeDeps();
  const placed = await chat([{ id: "order" }, { id: "pack_12" }, { id: "qty_1" }, { id: "checkout" }, { text: "Asha" }, { text: "Flat 4, Road 2 500008" }, { id: "pay_cod" }, { id: "place" }], INFO, {}, d);
  let r = await handle(placed.s, { id: "my_orders" }, PHONE, INFO, d.deps);
  assert(textOf(r.replies).includes("ORD-1001") && textOf(r.replies).includes("Received"), "lists order");
  r = await handle(r.session, { text: "help" }, PHONE, INFO, d.deps);
  assert(textOf(r.replies).includes("9876500000") && d.alerts.some((a) => a.includes("talk to someone")), "help + owner alert");
  r = await handle({ step: "qty", pack: "12", cart: { "12": 2 } }, { text: "cancel" }, PHONE, INFO, d.deps);
  assert(r.session.step === "menu" && !r.session.cart?.["12"], "cancel clears basket");
});

Deno.test("old chats restart but keep the saved address", async () => {
  const s: Session = { step: "qty", pack: "12", cart: { "12": 1 }, customer: { name: "Asha", address: "Flat 4 500008", pincode: "500008" }, at: Date.now() - 5 * 3600_000 };
  const r = await handle(s, { text: "2" }, PHONE, INFO, fakeDeps().deps);
  assert(r.session.step === "menu" && r.session.customer?.name === "Asha", "reset to menu, kept address");
});

Deno.test("status messages", () => {
  const o = { order_no: "ORD-1001", status: "out_for_delivery", payment_method: "upi", payment_status: "pending", total: 1080, name: "Asha Rao" };
  const m = statusMessage(o, INFO)!;
  assert(m.includes("out for delivery") && m.includes("stareggs@okaxis"), m);
  assert(statusMessage({ ...o, status: "new" }, INFO) === null, "no message for new");
  assert(!statusMessage({ ...o, status: "confirmed", payment_status: "paid" }, INFO)!.includes("UPI"), "no pay line when paid");
});

Deno.test("WhatsApp limits: button titles ≤ 20, list titles ≤ 24", async () => {
  const all: Reply[] = [];
  for (const steps of [[{ text: "hi" }], [{ id: "order" }], [{ id: "order" }, { id: "pack_12" }], [{ id: "order" }, { id: "pack_12" }, { id: "qty_1" }],
    [{ id: "order" }, { id: "pack_12" }, { id: "qty_1" }, { id: "checkout" }, { text: "A B" }, { text: "Flat 4, Road 2 500008" }],
    [{ id: "order" }, { id: "pack_12" }, { id: "qty_1" }, { id: "checkout" }, { text: "A B" }, { text: "Flat 4, Road 2 500008" }, { id: "pay_upi" }]] as Input[][]) {
    all.push(...(await chat(steps, { ...INFO, price_30: 12000 })).last);
  }
  for (const r of all) {
    if (r.kind === "buttons") { assert(r.buttons.length <= 3, "≤3 buttons"); r.buttons.forEach((b) => assert(b.title.length <= 20, "button title too long: " + b.title)); }
    if (r.kind === "list") r.rows.forEach((x) => assert(x.title.length <= 24, "row title too long: " + x.title));
    assert(r.text.length <= 1024, "body too long");
  }
});
