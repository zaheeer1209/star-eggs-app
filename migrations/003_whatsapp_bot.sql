-- Star Eggs WhatsApp ordering bot. Run after 002_online_store.sql, in Supabase → SQL Editor → Run.
-- Safe to run again.

-- Where each chat is in the conversation (one row per customer phone).
create table if not exists wa_sessions (
  phone text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- WhatsApp can deliver the same message twice; remember what we've handled.
create table if not exists wa_seen (
  id text primary key,
  at timestamptz not null default now()
);

-- Where an order came from: 'shop' (website) or 'whatsapp'.
alter table orders add column if not exists source text not null default 'shop';

-- Only the bot (service role) touches these tables; nobody else can read them.
alter table wa_sessions enable row level security;
alter table wa_seen enable row level security;

-- Keep the de-dup list small.
create or replace function wa_prune() returns void language sql security definer set search_path = public as $$
  delete from wa_seen where at < now() - interval '3 days';
$$;
revoke all on function wa_prune() from public;
