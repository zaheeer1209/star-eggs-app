// Star Eggs WhatsApp ordering conversation.
// Pure logic: takes what the customer sent plus the saved chat state, returns replies and the new state.
// Database work is passed in as `deps`, so the whole conversation can be tested without WhatsApp.

export type Pack = "12" | "30";

export interface ShopInfo {
  name: string;
  phone?: string;
  whatsapp?: string;
  upi?: string;
  open: boolean;
  cod: boolean;
  price_12: number;
  price_30: number;
  stock_12: boolean;
  stock_30: boolean;
  min_order: number;
  pincodes: string;
  delivery_note?: string;
}

export interface Customer { name?: string; address?: string; area?: string; pincode?: string }

export interface Session {
  step?: Step;
  cart?: Partial<Record<Pack, number>>;
  pack?: Pack;              // pack waiting for a quantity
  customer?: Customer;      // remembered between orders
  draft?: Customer;         // address being typed for this order
  pay?: "upi" | "cod";
  lastOrder?: string;       // last order number, for UPI reference messages
  at?: number;              // last activity, ms
}

export type Step =
  | "menu" | "pack" | "qty" | "cart" | "same_addr" | "name" | "address" | "pincode" | "pay" | "confirm" | "utr";

/** What the customer sent, already reduced to text or a button/list id. */
export interface Input {
  text?: string;          // typed text
  id?: string;            // button or list reply id
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  name?: string;          // WhatsApp profile name
}

export type Reply =
  | { kind: "text"; text: string }
  | { kind: "buttons"; text: string; buttons: { id: string; title: string }[] }
  | { kind: "list"; text: string; button: string; rows: { id: string; title: string; description?: string }[] };

export interface PlacedOrder { order_no: string; total: number; items: { pack: string; qty: number; rate: number; amount: number }[]; payment: string; upi?: string }
export interface OrderStatus { order_no: string; status: string; payment_method: string; payment_status: string; total: number; created_at: string }

export interface Deps {
  placeOrder(o: { name: string; phone: string; address: string; area: string; pincode: string; items: { pack: Pack; qty: number }[]; payment: "upi" | "cod"; note: string }): Promise<PlacedOrder>;
  recentOrders(phone: string): Promise<OrderStatus[]>;
  reportPayment(orderNo: string, phone: string, ref: string): Promise<boolean>;
  alertOwner(text: string): Promise<void>;
}

const SESSION_MINUTES = 120;
const PACK_NAME: Record<Pack, string> = { "12": "Box of 12", "30": "Tray of 30" };
export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const price = (info: ShopInfo, p: Pack) => Number(p === "12" ? info.price_12 : info.price_30) || 0;
const inStock = (info: ShopInfo, p: Pack) => (p === "12" ? info.stock_12 : info.stock_30) !== false;
const cartTotal = (info: ShopInfo, cart: Session["cart"] = {}) =>
  (["12", "30"] as Pack[]).reduce((s, p) => s + (cart[p] || 0) * price(info, p), 0);
const cartLines = (info: ShopInfo, cart: Session["cart"] = {}) =>
  (["12", "30"] as Pack[]).filter((p) => cart[p]).map((p) => `• ${PACK_NAME[p]} × ${cart[p]} = ${inr(cart[p]! * price(info, p))}`).join("\n");
const pincodeList = (info: ShopInfo) => String(info.pincodes || "").split(/[^0-9]+/).filter((x) => /^\d{6}$/.test(x));
const MENU_BUTTONS = [
  { id: "order", title: "Order eggs" },
  { id: "my_orders", title: "My orders" },
  { id: "help", title: "Talk to us" },
];

function norm(s?: string) { return (s || "").trim().toLowerCase(); }

export async function handle(session: Session, input: Input, phone: string, info: ShopInfo, deps: Deps, now = Date.now()):
  Promise<{ session: Session; replies: Reply[] }> {
  const s: Session = structuredClone(session || {});
  const replies: Reply[] = [];
  const say = (text: string) => replies.push({ kind: "text", text });
  const buttons = (text: string, b: { id: string; title: string }[]) => replies.push({ kind: "buttons", text, buttons: b.slice(0, 3) });

  // Old conversations start fresh, but we keep the saved address.
  if (s.at && now - s.at > SESSION_MINUTES * 60_000) { s.step = "menu"; s.cart = {}; s.pack = undefined; s.draft = undefined; s.pay = undefined; }
  s.at = now;

  const t = norm(input.text), id = input.id || "";
  // While typing a name or address, only exact commands count, so "call before coming" stays part of the address.
  const typing = s.step === "name" || s.step === "address";
  const word = (re: RegExp) => !typing && re.test(t);
  const exact = (...w: string[]) => w.includes(t);

  // ---- things that work from anywhere ----
  if (id === "menu" || exact("menu") || word(/^(hi+|hello|hey|hai|helo|menu|start|namaste|salaam|salam|assalamu.*|hii+)\b/)) {
    s.step = "menu";
    return { session: s, replies: [welcome(info, input.name)] };
  }
  if (id === "cancel" || exact("cancel", "stop", "start over", "reset")) {
    s.step = "menu"; s.cart = {}; s.pack = undefined; s.draft = undefined; s.pay = undefined;
    buttons("No problem, I've cleared that. What would you like to do?", MENU_BUTTONS);
    return { session: s, replies };
  }
  if (id === "help" || exact("help") || word(/^(help|talk|call|human|agent|support)\b/)) {
    const num = info.phone || info.whatsapp;
    say(`Sure. ${num ? `Call us on ${num}, or ` : ""}send your question here and the ${info.name} team will reply soon.`);
    await deps.alertOwner(`${phone} asked to talk to someone on the WhatsApp bot.`).catch(() => {});
    s.step = "menu";
    return { session: s, replies };
  }
  if (id === "my_orders" || word(/^(my orders?|track|status|where.*order)/)) {
    const list = await deps.recentOrders(phone);
    if (!list.length) buttons("You don't have any orders with us yet.", [{ id: "order", title: "Order eggs" }]);
    else {
      const STATUS: Record<string, string> = { new: "Received", confirmed: "Confirmed", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled" };
      const PAY: Record<string, string> = { pending: "not paid yet", claimed: "payment being checked", paid: "paid" };
      say("Your recent orders:\n\n" + list.slice(0, 3).map((o) =>
        `*${o.order_no}* · ${inr(o.total)}\n${STATUS[o.status] || o.status} · ${o.payment_method === "cod" ? "Cash on delivery" : "UPI"}, ${PAY[o.payment_status] || o.payment_status}`).join("\n\n"));
      buttons("Anything else?", [{ id: "order", title: "Order eggs" }, { id: "help", title: "Talk to us" }]);
    }
    s.step = "menu";
    return { session: s, replies };
  }
  // A 12-digit number after an order is almost always a UPI reference.
  const utr = (input.text || "").replace(/\s/g, "");
  if (s.lastOrder && /^\d{12}$/.test(utr) && (s.step === "utr" || s.step === "menu" || !s.step)) {
    const ok = await deps.reportPayment(s.lastOrder, phone, utr);
    say(ok ? `Thank you! We've noted UPI reference ${utr} for ${s.lastOrder}. We'll check it and confirm.` : `We already have a payment note for ${s.lastOrder}. If something's wrong, tap Talk to us.`);
    if (ok) await deps.alertOwner(`${s.lastOrder}: customer ${phone} says they paid by UPI, ref ${utr}. Check before marking paid.`).catch(() => {});
    s.step = "menu";
    return { session: s, replies };
  }
  if (id === "order" || (s.step !== "pincode" && word(/^(order|buy|eggs?|i want|need)\b/))) {
    return startOrder(s, info, replies);
  }

  // ---- the order flow ----
  switch (s.step) {
    case "pack": {
      const p = (id === "pack_12" || /\b12\b|box/.test(t)) ? "12" : (id === "pack_30" || /\b30\b|tray/.test(t)) ? "30" : null;
      if (!p) return startOrder(s, info, replies, "Please pick a pack from the list.", true);
      if (!inStock(info, p)) { say(`Sorry, the ${PACK_NAME[p]} is sold out today.`); return startOrder(s, info, replies, undefined, true); }
      s.pack = p; s.step = "qty";
      buttons(`How many ${p === "12" ? "boxes of 12" : "trays of 30"}? (${inr(price(info, p))} each)\nTap a number or type one up to 50.`,
        [{ id: "qty_1", title: "1" }, { id: "qty_2", title: "2" }, { id: "qty_3", title: "3" }]);
      return { session: s, replies };
    }
    case "qty": {
      const q = id.startsWith("qty_") ? Number(id.slice(4)) : Number((t.match(/\d+/) || [])[0]);
      if (!Number.isInteger(q) || q < 1 || q > 50) { say("Please send a number from 1 to 50."); return { session: s, replies }; }
      const p = s.pack || "12";
      s.cart = s.cart || {};
      s.cart[p] = Math.min(50, (s.cart[p] || 0) + q);
      s.pack = undefined; s.step = "cart";
      return { session: s, replies: [cartReply(info, s)] };
    }
    case "cart": {
      if (id === "add_more" || word(/^(add|more)/)) return startOrder(s, info, replies, undefined, true);
      if (id === "checkout" || word(/^(checkout|done|next|ok|okay|yes)\b/)) return checkout(s, info, replies);
      replies.push(cartReply(info, s));
      return { session: s, replies };
    }
    case "same_addr": {
      if (id === "addr_same" || word(/^(yes|same)/)) { s.draft = { ...s.customer }; return askPay(s, info, replies); }
      if (id === "addr_new" || word(/^(no|new|change)/)) { s.draft = { name: s.customer?.name }; s.step = "address"; say("Please send the full delivery address: house/flat number, street, area and a landmark.\nYou can also share your location 📍."); return { session: s, replies }; }
      return checkout(s, info, replies);
    }
    case "name": {
      const name = (input.text || "").trim();
      if (name.length < 2 || name.length > 60) { say("Please send your name."); return { session: s, replies }; }
      s.draft = { ...(s.draft || {}), name };
      s.step = "address";
      say(`Thanks, ${name.split(" ")[0]}! Now send the full delivery address: house/flat number, street, area and a landmark.\nYou can also share your location 📍.`);
      return { session: s, replies };
    }
    case "address": {
      let addr = (input.text || "").trim();
      if (input.location) {
        const l = input.location;
        addr = [l.name, l.address, `Map: https://maps.google.com/?q=${l.latitude},${l.longitude}`].filter(Boolean).join(", ");
      }
      if (addr.length < 8) { say("That address looks short. Please include house/flat number, street and area."); return { session: s, replies }; }
      s.draft = { ...(s.draft || {}), address: addr.slice(0, 380) };
      const pin = addr.match(/\b[1-9]\d{5}\b/);
      if (pin) return takePincode(s, info, replies, pin[0]);
      s.step = "pincode";
      say("What's the 6-digit pincode?");
      return { session: s, replies };
    }
    case "pincode": {
      const pin = (t.match(/\b[1-9]\d{5}\b/) || [])[0];
      if (!pin) { say("Please send a 6-digit pincode, like 500008."); return { session: s, replies }; }
      return takePincode(s, info, replies, pin);
    }
    case "pay": {
      const pay = id === "pay_upi" || word(/upi|gpay|phonepe|paytm|online/) ? "upi" : id === "pay_cod" || word(/cash|cod|delivery/) ? "cod" : null;
      if (!pay || (pay === "cod" && !info.cod)) return askPay(s, info, replies);
      s.pay = pay;
      return confirmReply(s, info, replies);
    }
    case "confirm": {
      if (id === "place" || word(/^(yes|confirm|place|ok|okay)\b/)) return place(s, info, phone, deps, replies);
      if (id === "change") { s.step = "cart"; replies.push(cartReply(info, s)); return { session: s, replies }; }
      return confirmReply(s, info, replies);
    }
    default:
      return { session: { ...s, step: "menu" }, replies: [welcome(info, input.name)] };
  }
}

function welcome(info: ShopInfo, profileName?: string): Reply {
  const first = (profileName || "").trim().split(/\s+/)[0];
  const lines = [`Hi${first ? " " + first : ""}! 👋 Welcome to *${info.name || "Star Eggs"}*.`];
  if (info.open === false) {
    lines.push("We're not taking orders on WhatsApp right now. Tap Talk to us and we'll help you.");
    return { kind: "buttons", text: lines.join("\n"), buttons: [{ id: "help", title: "Talk to us" }, { id: "my_orders", title: "My orders" }] };
  }
  lines.push(`Fresh brown eggs, delivered in Hyderabad.\n\n🥚 Box of 12 · ${inr(info.price_12)}\n🥚 Tray of 30 · ${inr(info.price_30)}`);
  if (info.delivery_note) lines.push(info.delivery_note);
  return { kind: "buttons", text: lines.join("\n"), buttons: MENU_BUTTONS };
}

function startOrder(s: Session, info: ShopInfo, replies: Reply[], note?: string, keepCart = false) {
  if (info.open === false) { replies.push(welcome(info)); s.step = "menu"; return { session: s, replies }; }
  const rows = (["12", "30"] as Pack[]).filter((p) => inStock(info, p)).map((p) => ({
    id: "pack_" + p, title: `${PACK_NAME[p]} · ${inr(price(info, p))}`,
    description: p === "12" ? "Brown eggs in a carton" : "A full tray for families and bakers",
  }));
  if (!rows.length) {
    replies.push({ kind: "buttons", text: "Sorry, we're sold out today. Please check again tomorrow.", buttons: [{ id: "help", title: "Talk to us" }] });
    s.step = "menu"; return { session: s, replies };
  }
  if (!keepCart) s.cart = {};
  s.step = "pack";
  replies.push({ kind: "list", text: (note ? note + "\n" : "") + "Which pack would you like?", button: "Choose pack", rows });
  return { session: s, replies };
}

function cartReply(info: ShopInfo, s: Session): Reply {
  return {
    kind: "buttons",
    text: `Your basket:\n${cartLines(info, s.cart)}\n\n*Total ${inr(cartTotal(info, s.cart))}*`,
    buttons: [{ id: "checkout", title: "Checkout" }, { id: "add_more", title: "Add more" }, { id: "cancel", title: "Start over" }],
  };
}

function checkout(s: Session, info: ShopInfo, replies: Reply[]) {
  const total = cartTotal(info, s.cart);
  if (!total) return startOrder(s, info, replies, "Your basket is empty.", true);
  if (info.min_order && total < info.min_order) {
    replies.push({ kind: "buttons", text: `Our minimum order is ${inr(info.min_order)}. Add ${inr(info.min_order - total)} more to check out.`, buttons: [{ id: "add_more", title: "Add more" }, { id: "cancel", title: "Start over" }] });
    s.step = "cart"; return { session: s, replies };
  }
  const c = s.customer;
  if (c?.name && c.address && c.pincode) {
    s.step = "same_addr";
    replies.push({ kind: "buttons", text: `Deliver to the same address?\n\n*${c.name}*\n${c.address}${c.address.includes(c.pincode) ? "" : " " + c.pincode}`, buttons: [{ id: "addr_same", title: "Yes, same" }, { id: "addr_new", title: "New address" }] });
    return { session: s, replies };
  }
  s.draft = {}; s.step = "name";
  replies.push({ kind: "text", text: "Great! What name should we deliver to?" });
  return { session: s, replies };
}

function takePincode(s: Session, info: ShopInfo, replies: Reply[], pin: string) {
  const list = pincodeList(info);
  if (list.length && !list.includes(pin)) {
    replies.push({ kind: "buttons", text: `Sorry, we don't deliver to ${pin} yet. We deliver to: ${list.join(", ")}.\nSend another address, or tap Talk to us.`, buttons: [{ id: "addr_new", title: "Other address" }, { id: "help", title: "Talk to us" }] });
    s.step = "same_addr"; s.customer = { ...(s.customer || {}), name: s.draft?.name || s.customer?.name };
    return { session: s, replies };
  }
  s.draft = { ...(s.draft || {}), pincode: pin };
  return askPay(s, info, replies);
}

function askPay(s: Session, info: ShopInfo, replies: Reply[]) {
  if (!info.cod) { s.pay = "upi"; return confirmReply(s, info, replies); }
  s.step = "pay";
  replies.push({ kind: "buttons", text: "How would you like to pay?", buttons: [{ id: "pay_upi", title: "UPI" }, { id: "pay_cod", title: "Cash on delivery" }] });
  return { session: s, replies };
}

function confirmReply(s: Session, info: ShopInfo, replies: Reply[]) {
  const d = s.draft || {};
  s.step = "confirm";
  replies.push({
    kind: "buttons",
    text: `Please check your order:\n\n${cartLines(info, s.cart)}\n*Total ${inr(cartTotal(info, s.cart))}*\n\nDeliver to: *${d.name}*\n${d.address}${d.address?.includes(d.pincode || "") ? "" : " " + d.pincode}\nPay by: ${s.pay === "cod" ? "Cash on delivery" : "UPI"}`,
    buttons: [{ id: "place", title: "Place order" }, { id: "change", title: "Change" }, { id: "cancel", title: "Cancel" }],
  });
  return { session: s, replies };
}

const ERR: Record<string, string> = {
  STORE_CLOSED: "Sorry, we've just stopped taking orders for now.",
  NO_DELIVERY: "Sorry, we don't deliver to that pincode yet.",
  OUT_OF_STOCK: "Sorry, a pack in your basket just sold out.",
  BELOW_MIN: "Your order is below our minimum.",
  TOO_FAST: "You've placed a few orders just now. Please wait 10 minutes or tap Talk to us.",
  BUSY: "We're getting a lot of orders. Please try again in a few minutes.",
  BAD_ADDRESS: "The address looks incomplete. Please start again with the full address.",
  BAD_NAME: "Please start again and send your name.",
  TOO_MANY: "For more than 50 packs, please tap Talk to us.",
};

async function place(s: Session, info: ShopInfo, phone: string, deps: Deps, replies: Reply[]) {
  const d = s.draft || {};
  const items = (["12", "30"] as Pack[]).filter((p) => s.cart?.[p]).map((p) => ({ pack: p, qty: s.cart![p]! }));
  try {
    const o = await deps.placeOrder({ name: d.name || "", phone, address: d.address || "", area: d.area || "", pincode: d.pincode || "", items, payment: s.pay || "upi", note: "Ordered on WhatsApp" });
    s.customer = { name: d.name, address: d.address, pincode: d.pincode, area: d.area };
    s.lastOrder = o.order_no; s.cart = {}; s.draft = undefined;
    const vpa = o.upi || info.upi;
    let text = `✅ Order *${o.order_no}* placed!\n\n${o.items.map((i) => `• ${PACK_NAME[i.pack as Pack] || i.pack} × ${i.qty} = ${inr(i.amount)}`).join("\n")}\n*Total ${inr(o.total)}*\n\n`;
    if (s.pay === "upi" && vpa) {
      text += `Please pay *${inr(o.total)}* by UPI to:\n*${vpa}*\nAdd ${o.order_no} in the note.\n\nAfter paying, send the 12-digit UPI reference number here so we can match it.`;
      s.step = "utr";
    } else if (s.pay === "upi") {
      text += "We'll send our UPI details shortly to pay.";
      s.step = "menu";
    } else {
      text += `Please keep *${inr(o.total)}* ready in cash or UPI when the eggs arrive.`;
      s.step = "menu";
    }
    text += `\n\nWe'll message you here when it's confirmed${info.delivery_note ? ". " + info.delivery_note : "."}`;
    replies.push({ kind: "text", text });
    const items2 = o.items.map((i) => `${i.qty} × ${PACK_NAME[i.pack as Pack] || i.pack}`).join(", ");
    await deps.alertOwner(`🛒 New WhatsApp order ${o.order_no}\n${items2} · ${inr(o.total)} · ${s.pay === "cod" ? "COD" : "UPI"}\n${d.name}, ${phone}\n${d.address} ${d.pincode || ""}`).catch(() => {});
  } catch (e) {
    const code = String((e as Error)?.message || "").match(/[A-Z_]{4,}/)?.[0] || "";
    replies.push({ kind: "buttons", text: (ERR[code] || "Sorry, something went wrong placing your order. Please try again.") , buttons: [{ id: "order", title: "Order eggs" }, { id: "help", title: "Talk to us" }] });
    s.step = "menu";
  }
  return { session: s, replies };
}

/** Message sent to a WhatsApp customer when the team changes the order in the app. */
export function statusMessage(o: { order_no: string; status: string; payment_method: string; payment_status: string; total: number; name?: string }, info: Pick<ShopInfo, "name" | "upi" | "delivery_note">): string | null {
  const first = (o.name || "").split(" ")[0];
  const hi = first ? `Hi ${first}, ` : "";
  const shop = info.name || "Star Eggs";
  const payLine = o.payment_status === "paid" ? "" : o.payment_method === "upi" && info.upi ? `\nTo pay ${inr(o.total)} by UPI: ${info.upi}` : `\nPlease keep ${inr(o.total)} ready (cash or UPI).`;
  switch (o.status) {
    case "confirmed": return `${hi}your ${shop} order *${o.order_no}* is confirmed ✅${info.delivery_note ? "\n" + info.delivery_note : ""}${payLine}`;
    case "out_for_delivery": return `${hi}your ${shop} order *${o.order_no}* is out for delivery 🛵${payLine}`;
    case "delivered": return `${hi}your ${shop} order *${o.order_no}* has been delivered. Thank you! 🥚\nReply *order* any time to order again.`;
    case "cancelled": return `${hi}your ${shop} order *${o.order_no}* has been cancelled. Reply *help* if you have a question.`;
    default: return null;
  }
}
export function paidMessage(o: { order_no: string; total: number; name?: string }, info: Pick<ShopInfo, "name">): string {
  const first = (o.name || "").split(" ")[0];
  return `${first ? `Hi ${first}, ` : ""}we've received your payment of ${inr(o.total)} for *${o.order_no}*. Thank you!`;
}
