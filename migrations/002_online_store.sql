-- Star Eggs online store. Run once in Supabase → SQL Editor → New query → Run.
-- Safe to run again: it only adds what is missing.
--
-- Customers never touch the tables directly. The shop calls three functions:
--   store_info()      public shop details and prices
--   place_order(...)  checks the order, prices it from the database, saves it
--   track_order(...)  status for an order number + phone
--   report_payment()  customer says "I've paid" and gives the UPI reference
-- Prices and totals are always worked out here, so nobody can change them from the browser.

-- 1. Shop settings live on the existing business-details row.
alter table settings add column if not exists store_open boolean not null default true;
alter table settings add column if not exists price_12 numeric not null default 240;
alter table settings add column if not exists price_30 numeric not null default 600;
alter table settings add column if not exists stock_12 boolean not null default true;
alter table settings add column if not exists stock_30 boolean not null default true;
alter table settings add column if not exists min_order numeric not null default 0;
alter table settings add column if not exists delivery_pincodes text not null default '';
alter table settings add column if not exists delivery_note text not null default 'Delivered across Hyderabad within 24 hours.';
alter table settings add column if not exists whatsapp text not null default '';
alter table settings add column if not exists email text not null default '';
alter table settings add column if not exists cod_enabled boolean not null default true;

-- 2. Online orders.
create sequence if not exists order_no_seq start 1001;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_no text not null unique,
  name text not null,
  phone text not null,
  address text not null,
  area text not null default '',
  pincode text not null default '',
  items jsonb not null,               -- [{pack:'12'|'30', qty, rate, amount}]
  total numeric not null,
  payment_method text not null check (payment_method in ('upi','cod')),
  payment_status text not null default 'pending' check (payment_status in ('pending','claimed','paid')),
  utr text not null default '',
  status text not null default 'new' check (status in ('new','confirmed','out_for_delivery','delivered','cancelled')),
  note text not null default '',
  sale_ids jsonb not null default '[]'::jsonb,
  invoice_no text,
  updated_at timestamptz not null default now()
);
create index if not exists orders_phone_created on orders (phone, created_at desc);

alter table sales add column if not exists order_no text;

alter table orders enable row level security;
drop policy if exists "team only" on orders;
create policy "team only" on orders for all to authenticated using (is_member()) with check (is_member());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'orders') then
    alter publication supabase_realtime add table orders;
  end if;
end $$;

-- 3. Public shop details (no private business data).
create or replace function store_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', coalesce(nullif(name,''), 'Star Eggs'),
    'phone', phone, 'whatsapp', whatsapp, 'email', email, 'addr', addr,
    'fssai', fssai, 'gstin', gstin, 'upi', upi,
    'open', store_open, 'cod', cod_enabled,
    'price_12', price_12, 'price_30', price_30,
    'stock_12', stock_12, 'stock_30', stock_30,
    'min_order', min_order, 'pincodes', delivery_pincodes, 'delivery_note', delivery_note
  ) from settings where id = 1;
$$;

-- 4. Place an order. p_items: [{"pack":"12","qty":2},{"pack":"30","qty":1}]
create or replace function place_order(
  p_name text, p_phone text, p_address text, p_area text, p_pincode text,
  p_items jsonb, p_payment text, p_note text default ''
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s settings%rowtype;
  phone_d text := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  pin text := regexp_replace(coalesce(p_pincode,''), '\D', '', 'g');
  it jsonb;
  lines jsonb := '[]'::jsonb;
  q int; pk text; rate numeric; tot numeric := 0;
  q12 int := 0; q30 int := 0;
  recent int;
  ono text;
begin
  select * into s from settings where id = 1;
  if not s.store_open then raise exception 'STORE_CLOSED' using errcode = 'P0001'; end if;

  if length(phone_d) = 12 and left(phone_d, 2) = '91' then phone_d := right(phone_d, 10); end if;
  if length(phone_d) = 11 and left(phone_d, 1) = '0' then phone_d := right(phone_d, 10); end if;
  if phone_d !~ '^[6-9][0-9]{9}$' then raise exception 'BAD_PHONE' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_name,''))) < 2 or length(p_name) > 80 then raise exception 'BAD_NAME' using errcode = 'P0001'; end if;
  if length(trim(coalesce(p_address,''))) < 8 or length(p_address) > 400 then raise exception 'BAD_ADDRESS' using errcode = 'P0001'; end if;
  if pin !~ '^[1-9][0-9]{5}$' then raise exception 'BAD_PINCODE' using errcode = 'P0001'; end if;
  if trim(s.delivery_pincodes) <> '' and not (pin = any (regexp_split_to_array(regexp_replace(s.delivery_pincodes, '[^0-9,]', '', 'g'), ','))) then
    raise exception 'NO_DELIVERY' using errcode = 'P0001';
  end if;
  if p_payment not in ('upi','cod') or (p_payment = 'cod' and not s.cod_enabled) then raise exception 'BAD_PAYMENT' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'EMPTY' using errcode = 'P0001'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    pk := it->>'pack';
    q := coalesce((it->>'qty')::int, 0);
    if q <= 0 then continue; end if;
    if pk = '12' then q12 := q12 + q; elsif pk = '30' then q30 := q30 + q; else raise exception 'BAD_ITEM' using errcode = 'P0001'; end if;
  end loop;
  if q12 + q30 = 0 then raise exception 'EMPTY' using errcode = 'P0001'; end if;
  if q12 > 50 or q30 > 50 then raise exception 'TOO_MANY' using errcode = 'P0001'; end if;
  if (q12 > 0 and not s.stock_12) or (q30 > 0 and not s.stock_30) then raise exception 'OUT_OF_STOCK' using errcode = 'P0001'; end if;

  if q12 > 0 then rate := s.price_12; lines := lines || jsonb_build_object('pack','12','qty',q12,'rate',rate,'amount',rate*q12); tot := tot + rate*q12; end if;
  if q30 > 0 then rate := s.price_30; lines := lines || jsonb_build_object('pack','30','qty',q30,'rate',rate,'amount',rate*q30); tot := tot + rate*q30; end if;
  if tot < s.min_order then raise exception 'BELOW_MIN' using errcode = 'P0001'; end if;

  -- Simple abuse guard: at most 3 orders per phone in 10 minutes, 60 orders in total per 10 minutes.
  select count(*) into recent from orders where phone = phone_d and created_at > now() - interval '10 minutes';
  if recent >= 3 then raise exception 'TOO_FAST' using errcode = 'P0001'; end if;
  select count(*) into recent from orders where created_at > now() - interval '10 minutes';
  if recent >= 60 then raise exception 'BUSY' using errcode = 'P0001'; end if;

  ono := 'ORD-' || nextval('order_no_seq');
  insert into orders (order_no, name, phone, address, area, pincode, items, total, payment_method, note)
  values (ono, trim(p_name), phone_d, trim(p_address), left(trim(coalesce(p_area,'')),80), pin, lines, tot, p_payment, left(trim(coalesce(p_note,'')),300));

  return jsonb_build_object('order_no', ono, 'total', tot, 'items', lines, 'payment', p_payment,
    'upi', s.upi, 'name', coalesce(nullif(s.name,''),'Star Eggs'), 'whatsapp', s.whatsapp);
end;
$$;

-- 5. Customer checks an order (needs the same phone number, so nobody can browse other orders).
create or replace function track_order(p_order_no text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  phone_d text := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 10);
  o orders%rowtype;
begin
  select * into o from orders where order_no = upper(trim(p_order_no)) and phone = phone_d;
  if not found then return null; end if;
  return jsonb_build_object('order_no', o.order_no, 'status', o.status, 'payment_method', o.payment_method,
    'payment_status', o.payment_status, 'total', o.total, 'items', o.items, 'created_at', o.created_at);
end;
$$;

-- 6. Customer reports a UPI payment. The owner checks it in the app before marking it paid.
create or replace function report_payment(p_order_no text, p_phone text, p_utr text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  phone_d text := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 10);
  ref text := left(regexp_replace(coalesce(p_utr,''), '[^A-Za-z0-9]', '', 'g'), 30);
begin
  update orders set payment_status = 'claimed', utr = ref, updated_at = now()
   where order_no = upper(trim(p_order_no)) and phone = phone_d
     and payment_method = 'upi' and payment_status = 'pending' and status <> 'cancelled';
  return found;
end;
$$;

revoke all on function store_info() from public;
revoke all on function place_order(text,text,text,text,text,jsonb,text,text) from public;
revoke all on function track_order(text,text) from public;
revoke all on function report_payment(text,text,text) from public;
grant execute on function store_info() to anon, authenticated;
grant execute on function place_order(text,text,text,text,text,jsonb,text,text) to anon, authenticated;
grant execute on function track_order(text,text) to anon, authenticated;
grant execute on function report_payment(text,text,text) to anon, authenticated;
