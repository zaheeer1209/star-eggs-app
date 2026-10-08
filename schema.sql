-- Star Eggs database. Run this once in Supabase → SQL Editor → New query → Run.
-- Then add every person who may use the app to the members list at the bottom.

create extension if not exists pgcrypto;

-- Who may open the books. Only emails listed here can read or change anything.
create table if not exists members (
  email text primary key,
  name  text,
  added_at timestamptz not null default now()
);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date date not null,
  supplier text not null,
  qty double precision,
  unit text check (unit in ('tray','egg')),
  rate double precision,
  eggs integer not null check (eggs >= 0),
  cost double precision not null check (cost >= 0),
  paid double precision not null default 0,
  note text default ''
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date date not null,
  seller text not null,
  pack text not null check (pack in ('12','30','loose')),
  qty double precision not null,
  rate double precision not null,
  eggs integer not null check (eggs >= 0),
  amount double precision not null,
  paid double precision not null default 0,
  note text default '',
  invoice_no text
);

create table if not exists investments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date date not null,
  partner text not null,
  kind text not null default 'in' check (kind in ('in','out')),
  amount double precision not null check (amount >= 0),
  note text default ''
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date date not null,
  category text not null,
  amount double precision not null default 0,
  eggs integer not null default 0,
  note text default ''
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  no text not null unique,
  date date not null,
  seller text not null,
  addr text default '',
  phone text default '',
  gstin text default '',
  note text default '',
  lines jsonb not null default '[]'::jsonb,
  total double precision not null,
  paid double precision not null default 0
);

-- One row of business details printed on invoices.
create table if not exists settings (
  id integer primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  name text default 'Star Eggs',
  addr text default '',
  phone text default '',
  gstin text default '',
  fssai text default 'Applied for',
  upi text default '',
  prefix text default 'SE-',
  next_no integer not null default 1,
  title text default 'Bill of Supply'
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- True when the signed-in person's email is on the members list.
create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where lower(email) = lower(auth.jwt() ->> 'email'));
$$;
grant execute on function is_member() to authenticated;

-- Lock every table to team members only.
alter table members enable row level security;
drop policy if exists "members can see list" on members;
create policy "members can see list" on members for select to authenticated using (is_member());

do $$
declare t text;
begin
  foreach t in array array['purchases','sales','investments','expenses','invoices','settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "team only" on %I', t);
    execute format('create policy "team only" on %I for all to authenticated using (is_member()) with check (is_member())', t);
  end loop;
end $$;

-- Live updates between phones.
do $$
declare t text;
begin
  foreach t in array array['purchases','sales','investments','expenses','invoices','settings'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ADD YOUR TEAM HERE (use the same emails you create logins for).
insert into members (email, name) values
  ('zaheeer1209@gmail.com', 'Zaheer')
  -- , ('relative@example.com', 'Owner')
on conflict (email) do nothing;
