// Star Eggs WhatsApp bot — Supabase Edge Function.
//
// 1. Meta's WhatsApp Cloud API calls this URL for every customer message (GET = one-time verify, POST = messages).
// 2. Supabase calls it with the header x-star-eggs-notify when an order changes in the app,
//    so WhatsApp customers hear "confirmed", "out for delivery", "delivered" and "payment received".
//
// Secrets (Supabase → Edge Functions → Secrets):
//   WA_TOKEN            permanent access token for the WhatsApp Business account
//   WA_PHONE_NUMBER_ID  the bot number's Phone number ID (from Meta's WhatsApp → API Setup page)
//   WA_VERIFY_TOKEN     any phrase you choose; type the same phrase into Meta's webhook settings
//   WA_APP_SECRET       Meta app secret, used to check messages really come from Meta
//   OWNER_WHATSAPP      owner numbers for new-order alerts, comma separated, e.g. 919876500000
//   NOTIFY_SECRET       any long phrase; the database webhook sends it as x-star-eggs-notify
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handle, paidMessage, statusMessage, type Deps, type Input, type Reply, type Session, type ShopInfo } from "./bot.ts";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const GRAPH = `https://graph.facebook.com/${env("GRAPH_VERSION", "v21.0")}`;
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

// ---------- WhatsApp Cloud API ----------
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
function toPayload(r: Reply): Record<string, unknown> {
  if (r.kind === "text") return { type: "text", text: { body: clip(r.text, 4096), preview_url: false } };
  if (r.kind === "buttons") {
    return {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: clip(r.text, 1024) },
        action: { buttons: r.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: clip(b.title, 20) } })) },
      },
    };
  }
  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: clip(r.text, 1024) },
      action: {
        button: clip(r.button, 20),
        sections: [{ title: "Packs", rows: r.rows.slice(0, 10).map((x) => ({ id: x.id, title: clip(x.title, 24), description: x.description ? clip(x.description, 72) : undefined })) }],
      },
    },
  };
}
async function graph(body: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${env("WA_PHONE_NUMBER_ID")}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("WA_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
  return res.json();
}
const sendTo = (to: string, r: Reply) => graph({ recipient_type: "individual", to, ...toPayload(r) });
const markRead = (id: string) => graph({ status: "read", message_id: id }).catch(() => {});
async function alertOwner(text: string) {
  for (const n of env("OWNER_WHATSAPP").split(/[,\s]+/).filter(Boolean)) {
    // Works when the owner has messaged the bot in the last 24 hours (WhatsApp's rule for free-form messages).
    await sendTo(n.replace(/\D/g, ""), { kind: "text", text }).catch((e) => console.warn("owner alert failed", n, String(e)));
  }
}

// ---------- security ----------
async function validSignature(raw: string, header: string | null): Promise<boolean> {
  const secret = env("WA_APP_SECRET");
  if (!secret) { console.warn("WA_APP_SECRET not set: accepting unsigned webhook"); return true; }
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const hex = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice(7);
  if (given.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// ---------- data ----------
async function shopInfo(): Promise<ShopInfo> {
  const { data, error } = await sb.rpc("store_info");
  if (error || !data) throw new Error("store_info failed: " + (error?.message || "no settings row"));
  return data as ShopInfo;
}
const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);
const deps: Deps = {
  async placeOrder(o) {
    const { data, error } = await sb.rpc("place_order", {
      p_name: o.name, p_phone: o.phone, p_address: o.address, p_area: o.area, p_pincode: o.pincode,
      p_items: o.items, p_payment: o.payment, p_note: o.note,
    });
    if (error) throw new Error(error.message);
    await sb.from("orders").update({ source: "whatsapp" }).eq("order_no", data.order_no);
    return data;
  },
  async recentOrders(phone) {
    const { data } = await sb.from("orders").select("order_no,status,payment_method,payment_status,total,created_at")
      .eq("phone", last10(phone)).order("created_at", { ascending: false }).limit(3);
    return data || [];
  },
  async reportPayment(orderNo, phone, ref) {
    const { data, error } = await sb.rpc("report_payment", { p_order_no: orderNo, p_phone: phone, p_utr: ref });
    if (error) throw new Error(error.message);
    return !!data;
  },
  alertOwner,
};

// ---------- incoming message ----------
// deno-lint-ignore no-explicit-any
function toInput(m: any, profileName?: string): Input | null {
  switch (m.type) {
    case "text": return { text: m.text?.body, name: profileName };
    case "interactive": return { id: m.interactive?.button_reply?.id || m.interactive?.list_reply?.id, name: profileName };
    case "button": return { text: m.button?.text, id: m.button?.payload, name: profileName };
    case "location": return { location: m.location, name: profileName };
    default: return null; // image, voice note, sticker…
  }
}
// deno-lint-ignore no-explicit-any
async function onMessage(m: any, profileName?: string) {
  const { error: dup } = await sb.from("wa_seen").insert({ id: m.id });
  if (dup) { if (dup.code === "23505") return; console.warn("wa_seen", dup.message); }
  const from: string = m.from;
  markRead(m.id);
  const input = toInput(m, profileName);
  if (!input) {
    await sendTo(from, { kind: "text", text: "I can read text messages and button taps. Type *menu* to see options, or *help* to reach the team." });
    return;
  }
  const { data: row } = await sb.from("wa_sessions").select("state").eq("phone", from).maybeSingle();
  const info = await shopInfo();
  const { session, replies } = await handle((row?.state || {}) as Session, input, from, info, deps);
  await sb.from("wa_sessions").upsert({ phone: from, state: session, updated_at: new Date().toISOString() });
  for (const r of replies) await sendTo(from, r);
  if (Math.random() < 0.02) await sb.rpc("wa_prune");
}

// ---------- order changed in the app ----------
// deno-lint-ignore no-explicit-any
async function onOrderChange(p: any) {
  const o = p?.record, old = p?.old_record;
  if (p?.type !== "UPDATE" || !o || o.source !== "whatsapp") return;
  const info = await shopInfo();
  let text: string | null = null;
  if (old && o.status !== old.status) text = statusMessage(o, info);
  else if (old && o.payment_status === "paid" && old.payment_status !== "paid") text = paidMessage(o, info);
  if (!text) return;
  await sendTo("91" + last10(o.phone), { kind: "text", text }).catch((e) => console.warn("status message failed", o.order_no, String(e)));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env("WA_VERIFY_TOKEN") && env("WA_VERIFY_TOKEN") !== "";
    return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await req.text();

  const notify = req.headers.get("x-star-eggs-notify");
  if (notify !== null) {
    if (!env("NOTIFY_SECRET") || notify !== env("NOTIFY_SECRET")) return new Response("Forbidden", { status: 403 });
    try { await onOrderChange(JSON.parse(raw)); } catch (e) { console.error("notify", e); }
    return new Response("ok");
  }

  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) return new Response("Bad signature", { status: 401 });
  try {
    const body = JSON.parse(raw);
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        const names: Record<string, string> = {};
        for (const c of v.contacts || []) names[c.wa_id] = c.profile?.name;
        for (const m of v.messages || []) {
          try { await onMessage(m, names[m.from]); } catch (e) {
            console.error("message", m?.id, e);
            await sendTo(m.from, { kind: "text", text: "Sorry, something went wrong on our side. Please try again in a minute, or type *help*." }).catch(() => {});
          }
        }
      }
    }
  } catch (e) { console.error("webhook", e); }
  // Always 200 so Meta doesn't keep re-sending; duplicates are ignored anyway.
  return new Response("ok");
});
