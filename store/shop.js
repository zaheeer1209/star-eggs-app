(function () {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const NS = 'http://www.w3.org/2000/svg';
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} }
};
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3200) }

/* ---------- drawings ---------- */
function egg(parent, cx, cy, rx, ry, fill) {
  const e = document.createElementNS(NS, 'ellipse');
  e.setAttribute('cx', cx); e.setAttribute('cy', cy); e.setAttribute('rx', rx); e.setAttribute('ry', ry);
  e.setAttribute('fill', 'url(#' + (fill || 'eggH') + ')'); parent.appendChild(e);
  const cup = document.createElementNS(NS, 'path');
  cup.setAttribute('d', `M${cx - rx * 1.05} ${cy + ry * .35} Q${cx} ${cy + ry * 1.25} ${cx + rx * 1.05} ${cy + ry * .35}`);
  cup.setAttribute('fill', 'none'); cup.setAttribute('stroke', 'var(--tray-line)'); cup.setAttribute('stroke-width', '2.2');
  parent.appendChild(cup);
}
function drawHero() {
  const g = $('#heroEggs');
  for (let r = 0; r < 4; r++) {
    const y = 128 + r * 32, s = .76 + r * .07, n = 5, w = 214 + r * 16;
    for (let i = 0; i < n; i++) egg(g, 180 - w / 2 + (w / (n - 1)) * i, y, 17 * s, 21 * s);
  }
}
function defs(svg, id) {
  svg.innerHTML = '<defs><radialGradient id="' + id + '" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="var(--egg-hi)"/><stop offset=".6" stop-color="var(--egg)"/><stop offset="1" stop-color="var(--egg-lo)"/></radialGradient></defs>';
}
function drawPacks() {
  const b = $('.box12'); defs(b, 'eggB');
  b.insertAdjacentHTML('beforeend', '<rect x="8" y="22" width="204" height="92" rx="10" fill="var(--tray)"/><path d="M8 22 L24 4 H196 L212 22" fill="var(--shell)" stroke="var(--tray-line)" stroke-width="2"/><g transform="translate(110 13)"><path d="M0 -6 1.6 -2.2 5.7 -1.8 2.6 .9 3.5 4.9 0 2.8 -3.5 4.9 -2.6 .9 -5.7 -1.8 -1.6 -2.2Z" fill="var(--yolk)"/></g>');
  const gb = document.createElementNS(NS, 'g'); b.appendChild(gb);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) egg(gb, 30 + i * 32, 52 + r * 38, 12, 15, 'eggB');
  const t = $('.tray30'); defs(t, 'eggT');
  t.insertAdjacentHTML('beforeend', '<rect x="22" y="4" width="176" height="112" rx="12" fill="var(--tray)"/>');
  const gt = document.createElementNS(NS, 'g'); t.appendChild(gt);
  for (let r = 0; r < 5; r++) for (let i = 0; i < 6; i++) egg(gt, 42 + i * 27.2, 18 + r * 21.5, 9.5, 10.5, 'eggT');
}

/* ---------- data ---------- */
const cfg = window.STAR_EGGS_CONFIG || {};
const sb = window.supabase && cfg.supabaseUrl ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } }) : null;
let INFO = { name: 'Star Eggs', open: true, cod: true, price_12: 240, price_30: 600, stock_12: true, stock_30: true, min_order: 0, pincodes: '', upi: '', whatsapp: '', fssai: '' };
const cart = { '12': 0, '30': 0 };
const PACK = { '12': { name: 'Box of 12', eggs: 12 }, '30': { name: 'Tray of 30', eggs: 30 } };
const price = p => +INFO['price_' + p] || 0;
const inStock = p => INFO['stock_' + p] !== false;
const total = () => cart['12'] * price('12') + cart['30'] * price('30');
const pincodes = () => String(INFO.pincodes || '').split(/[^0-9]+/).filter(x => /^\d{6}$/.test(x));
const digits = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length === 12 && d.startsWith('91')) d = d.slice(2); if (d.length === 11 && d[0] === '0') d = d.slice(1); return d };
const waNumber = () => { const d = digits(INFO.whatsapp || INFO.phone); return d.length === 10 ? '91' + d : '' };

async function loadInfo() {
  if (!sb) return;
  try {
    const { data, error } = await sb.rpc('store_info');
    if (error) throw error;
    if (data) INFO = Object.assign(INFO, data);
  } catch (e) { console.warn('store_info', e) }
  applyInfo();
}
function applyInfo() {
  $('#closed').hidden = INFO.open !== false;
  if (INFO.delivery_note) $('#deliveryNote').textContent = INFO.delivery_note;
  const fssai = String(INFO.fssai || '').trim(), realFssai = /^\d{14}$/.test(fssai.replace(/\s/g, ''));
  $('#fssaiFact').hidden = !realFssai; $('#fssaiTop').textContent = fssai;
  $('#fFssai').hidden = !realFssai; $('#fFssaiNo').textContent = fssai;
  $('#fGst').hidden = !INFO.gstin; $('#fGstNo').textContent = INFO.gstin || '';
  $('#fName').textContent = INFO.name || 'Star Eggs';
  $('#fAddr').textContent = INFO.addr || 'Hyderabad, Telangana';
  const contact = [INFO.phone && 'Call ' + INFO.phone, INFO.whatsapp && 'WhatsApp ' + INFO.whatsapp, INFO.email].filter(Boolean);
  $('#fContact').textContent = contact.join(' · ');
  $('#codOpt').hidden = INFO.cod === false;
  if (INFO.cod === false) $('input[name=pay][value=upi]').checked = true;
  $$('.pack').forEach(card => {
    const p = card.dataset.pack, out = !inStock(p);
    card.querySelector('[data-price]').textContent = inr(price(p));
    card.querySelector('[data-per]').textContent = '₹' + (price(p) / PACK[p].eggs).toFixed(price(p) % PACK[p].eggs ? 1 : 0) + ' an egg';
    card.classList.toggle('out', out); card.querySelector('.stock').hidden = !out;
    if (out) cart[p] = 0;
  });
  renderCart();
}

/* ---------- cart ---------- */
function renderCart() {
  const closed = INFO.open === false;
  $$('.pack').forEach(card => {
    const p = card.dataset.pack;
    card.querySelector('[data-qty]').textContent = cart[p];
    card.querySelector('[data-step="-1"]').disabled = cart[p] === 0;
    card.querySelector('[data-step="1"]').disabled = closed || !inStock(p) || cart[p] >= 50;
  });
  const n = cart['12'] + cart['30'], t = total();
  $('#cartCount').textContent = n;
  $('#cartbar').hidden = n === 0 || $('#v-shop').hidden || !$('#checkout').hidden;
  $('#cbTotal').textContent = inr(t);
  $('#cbItems').textContent = [cart['12'] && cart['12'] + ' × 12', cart['30'] && cart['30'] + ' × 30'].filter(Boolean).join(' · ');
  $('#lines').innerHTML = ['12', '30'].filter(p => cart[p]).map(p => `<div class="line"><div>${PACK[p].name} <span>× ${cart[p]}</span></div><b>${inr(cart[p] * price(p))}</b></div>`).join('') || '<div class="line"><span>Your basket is empty. Add a pack above.</span></div>';
  $('#total').textContent = inr(t);
  const min = +INFO.min_order || 0;
  $('#minNote').hidden = !(min && t > 0 && t < min);
  $('#minNote').textContent = `Minimum order is ${inr(min)}. Add ${inr(min - t)} more.`;
  if (n === 0 && !$('#checkout').hidden) $('#checkout').hidden = true;
  store.set('se_cart', cart);
}
$$('.pack').forEach(card => card.addEventListener('click', e => {
  const b = e.target.closest('[data-step]'); if (!b || b.disabled) return;
  const p = card.dataset.pack; cart[p] = Math.max(0, Math.min(50, cart[p] + +b.dataset.step)); renderCart();
}));
function openCheckout() {
  if (!(cart['12'] + cart['30'])) { toast('Add a pack first'); location.hash = 'packs'; return }
  $('#checkout').hidden = false; renderCart();
  $('#checkout').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#toCheckout').onclick = openCheckout;
$('#cartTop').onclick = () => { showView('shop'); cart['12'] + cart['30'] ? openCheckout() : document.getElementById('packs').scrollIntoView({ behavior: 'smooth' }) };

/* ---------- checkout ---------- */
const saved = store.get('se_customer', {});
['name', 'phone', 'addr', 'area', 'pin'].forEach(k => { if (saved[k]) $('#o_' + k).value = saved[k] });
function checkPin() {
  const pin = $('#o_pin').value.replace(/\D/g, ''), list = pincodes(), hint = $('#pinHint');
  hint.hidden = !(pin.length === 6 && list.length && !list.includes(pin));
  hint.textContent = 'Sorry, we don’t deliver to ' + pin + ' yet. Message us on WhatsApp and we’ll see what we can do.';
}
$('#o_pin').addEventListener('input', checkPin);
const ERR = {
  STORE_CLOSED: 'We’re not taking online orders right now.', BAD_PHONE: 'Enter a 10-digit Indian mobile number.',
  BAD_NAME: 'Enter your name.', BAD_ADDRESS: 'Add your full address with house number and street.',
  BAD_PINCODE: 'Enter a 6-digit pincode.', NO_DELIVERY: 'We don’t deliver to that pincode yet.',
  BAD_PAYMENT: 'Pick a way to pay.', EMPTY: 'Your basket is empty.', BAD_ITEM: 'Something in the basket isn’t available. Reload the page.',
  TOO_MANY: 'For more than 50 packs, message us on WhatsApp.', OUT_OF_STOCK: 'A pack in your basket just sold out. Reload the page.',
  BELOW_MIN: 'Your order is below the minimum.', TOO_FAST: 'You’ve placed a few orders just now. Wait 10 minutes or message us.',
  BUSY: 'We’re getting a lot of orders. Try again in a few minutes.'
};
function showErr(msg) { const e = $('#orderErr'); e.textContent = msg; e.hidden = !msg; if (msg) e.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
$('#fOrder').addEventListener('submit', async ev => {
  ev.preventDefault(); showErr('');
  const name = $('#o_name').value.trim(), phone = digits($('#o_phone').value), addr = $('#o_addr').value.trim(),
    area = $('#o_area').value.trim(), pin = $('#o_pin').value.replace(/\D/g, ''), note = $('#o_note').value.trim(),
    pay = ($('input[name=pay]:checked') || {}).value || 'upi';
  if (!(cart['12'] + cart['30'])) return showErr(ERR.EMPTY);
  if (name.length < 2) return showErr(ERR.BAD_NAME);
  if (!/^[6-9]\d{9}$/.test(phone)) return showErr(ERR.BAD_PHONE);
  if (addr.length < 8) return showErr(ERR.BAD_ADDRESS);
  if (!/^[1-9]\d{5}$/.test(pin)) return showErr(ERR.BAD_PINCODE);
  if (pincodes().length && !pincodes().includes(pin)) return showErr(ERR.NO_DELIVERY);
  if (+INFO.min_order && total() < +INFO.min_order) return showErr(`Minimum order is ${inr(INFO.min_order)}.`);
  if (!sb) return showErr('The shop isn’t connected yet. Please message us on WhatsApp.');
  const btn = $('#placeBtn'); btn.disabled = true; btn.textContent = 'Placing order…';
  try {
    const items = ['12', '30'].filter(p => cart[p]).map(p => ({ pack: p, qty: cart[p] }));
    const { data, error } = await sb.rpc('place_order', { p_name: name, p_phone: phone, p_address: addr, p_area: area, p_pincode: pin, p_items: items, p_payment: pay, p_note: note });
    if (error) { const code = (error.message || '').match(/[A-Z_]{4,}/); return showErr(ERR[code && code[0]] || 'Couldn’t place the order. Check your connection and try again.') }
    store.set('se_customer', { name, phone, addr, area, pin });
    const recent = store.get('se_orders', []).filter(o => o.no !== data.order_no);
    recent.unshift({ no: data.order_no, phone, total: data.total, at: Date.now() }); store.set('se_orders', recent.slice(0, 5));
    cart['12'] = cart['30'] = 0; renderCart();
    showDone(data, { name, phone, addr, area, pin, note });
  } catch (e) { showErr(navigator.onLine ? 'Couldn’t place the order. Try again.' : 'You’re offline. Connect to the internet and try again.') }
  finally { btn.disabled = false; btn.textContent = 'Place order' }
});

/* ---------- confirmation ---------- */
let current = null;
function upiUrl(o) {
  const q = new URLSearchParams({ pa: o.upi || INFO.upi, pn: o.name || INFO.name || 'Star Eggs', am: Number(o.total).toFixed(2), cu: 'INR', tn: 'Star Eggs ' + o.order_no });
  return 'upi://pay?' + q.toString().replace(/\+/g, '%20');
}
function showDone(o, c) {
  current = Object.assign({}, o, { phone: c.phone });
  $('#dNo').textContent = o.order_no;
  const items = (o.items || []).map(l => `${l.qty} × ${l.pack === '12' ? 'box of 12' : 'tray of 30'}`).join(', ');
  $('#dLine').textContent = `${items} · ${inr(o.total)}. We’ll confirm on WhatsApp or a call to ${c.phone}.`;
  const vpa = o.upi || INFO.upi, upi = o.payment === 'upi' && vpa;
  $('#dUpi').hidden = !upi; $('#dCod').hidden = !!upi;
  $('#dCodAmt').textContent = inr(o.total);
  if (o.payment === 'upi' && !vpa) $('#dCod').innerHTML = 'We’ll send you our UPI details on WhatsApp to pay <b>' + inr(o.total) + '</b>.';
  if (upi) {
    $('#dAmt').textContent = inr(o.total); $('#dVpa').textContent = vpa;
    const url = upiUrl(o); $('#upiLink').href = url;
    try { const q = qrcode(0, 'M'); q.addData(url); q.make(); $('#qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) } catch (e) { $('#qr').hidden = true }
    $('#paidOk').hidden = true; $('#p_utr').value = '';
  }
  const wa = waNumber();
  if (wa) {
    const lines = [`Hi ${INFO.name || 'Star Eggs'}, I placed order ${o.order_no}.`, items + ' · ' + inr(o.total), `Pay: ${o.payment === 'cod' ? 'Cash on delivery' : 'UPI'}`, `${c.name}, ${c.addr}${c.area ? ', ' + c.area : ''} ${c.pin}`];
    if (c.note) lines.push('Note: ' + c.note);
    $('#waOrder').href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent(lines.join('\n'));
  }
  $('#waOrder').hidden = !wa;
  showView('done');
}
$('#copyVpa').onclick = async () => { try { await navigator.clipboard.writeText($('#dVpa').textContent); toast('UPI ID copied') } catch (e) { toast('Copy it by hand: ' + $('#dVpa').textContent) } };
$('#fPaid').addEventListener('submit', async e => {
  e.preventDefault(); if (!current || !sb) return;
  const utr = $('#p_utr').value.replace(/[^A-Za-z0-9]/g, '');
  if (utr.length < 6) { toast('Enter the UPI reference number from your payment app'); return }
  const { data, error } = await sb.rpc('report_payment', { p_order_no: current.order_no, p_phone: current.phone, p_utr: utr });
  if (error) return toast('Couldn’t send that. Try again.');
  $('#paidOk').hidden = false;
  $('#paidOk').textContent = data ? 'Thanks. We’ll check the payment and confirm.' : 'We already have a payment note for this order.';
});
$('#again').onclick = () => { showView('shop'); window.scrollTo({ top: 0 }) };

/* ---------- tracking ---------- */
const STEPS = [['new', 'Order received'], ['confirmed', 'Confirmed'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered']];
const PAY = { pending: 'Not paid yet', claimed: 'Payment being checked', paid: 'Paid' };
function renderRecent() {
  const r = store.get('se_orders', []);
  $('#recent').innerHTML = r.map(o => `<button type="button" data-no="${esc(o.no)}" data-ph="${esc(o.phone)}">${esc(o.no)} · ${inr(o.total)}</button>`).join('');
}
$('#recent').addEventListener('click', e => { const b = e.target.closest('[data-no]'); if (!b) return; $('#t_no').value = b.dataset.no; $('#t_phone').value = b.dataset.ph; $('#fTrack').requestSubmit() });
$('#fTrack').addEventListener('submit', async e => {
  e.preventDefault();
  const no = $('#t_no').value.trim().toUpperCase(), phone = digits($('#t_phone').value), out = $('#trackOut');
  if (!/^ORD-\d+$/.test(no) || phone.length !== 10) { out.innerHTML = '<p class="err">Enter the order number (like ORD-1001) and the mobile number you used.</p>'; return }
  if (!sb) return;
  out.innerHTML = '<p class="fine">Checking…</p>';
  const { data, error } = await sb.rpc('track_order', { p_order_no: no, p_phone: phone });
  if (error) { out.innerHTML = '<p class="err">Couldn’t check right now. Try again.</p>'; return }
  if (!data) { out.innerHTML = '<p class="err">No order found with that number and mobile.</p>'; return }
  const idx = STEPS.findIndex(s => s[0] === data.status), cancelled = data.status === 'cancelled';
  out.innerHTML = `<div class="status"><b>${esc(data.order_no)} · ${inr(data.total)}</b><span>${data.payment_method === 'cod' ? 'Cash on delivery' : 'UPI'} · ${PAY[data.payment_status] || ''}</span></div>
    <ol class="steps">${cancelled ? '<li class="cancel"><i></i>Cancelled. Message us if this is a surprise.</li>' : STEPS.map((s, i) => `<li class="${i <= idx ? 'on' : ''}"><i></i>${s[1]}</li>`).join('')}</ol>`;
});

/* ---------- views ---------- */
function showView(v) {
  ['shop', 'done', 'track'].forEach(n => $('#v-' + n).hidden = n !== v);
  if (v === 'track') { renderRecent(); const r = store.get('se_orders', [])[0]; if (r && !$('#t_no').value) { $('#t_no').value = r.no; $('#t_phone').value = r.phone } }
  renderCart(); window.scrollTo({ top: 0 });
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-view]'); if (!a) return;
  e.preventDefault(); showView(a.dataset.view);
});

/* ---------- start ---------- */
const sc = store.get('se_cart', null); if (sc) { cart['12'] = +sc['12'] || 0; cart['30'] = +sc['30'] || 0 }
drawHero(); drawPacks(); applyInfo();
if (location.hash === '#track') showView('track');
loadInfo();
})();
