-- FFP Passport — Supabase Schema
-- Paste this into Supabase > SQL Editor > New query > Run

-- MEMBERS
create table if not exists public.members (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  full_name     text,
  passport_no   text unique,
  access_code   text not null,
  role          text default 'member',
  city          text,
  country       text default 'UAE',
  status        text default 'active',
  joined_at     timestamptz default now(),
  last_login    timestamptz,
  points        int default 0,
  visit_count   int default 0
);

-- PROVIDERS
create table if not exists public.providers (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid references public.members(id),
  venue_name    text not null,
  category      text,
  city          text,
  description   text,
  deal_terms    text,
  booking_url   text,
  status        text default 'pending',
  created_at    timestamptz default now()
);

-- DEALS
create table if not exists public.deals (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid references public.providers(id),
  title         text not null,
  description   text,
  deal_type     text default '2-for-1',
  highlights    jsonb default '[]',
  active        boolean default true,
  created_at    timestamptz default now()
);

-- VISIT LOGS
create table if not exists public.visit_logs (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid references public.members(id),
  provider_id   uuid references public.providers(id),
  deal_id       uuid references public.deals(id),
  visit_type    text default 'checkin',
  logged_at     timestamptz default now()
);

-- CALORIE LOGS
create table if not exists public.calorie_logs (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid references public.members(id),
  log_date      date not null,
  meals         jsonb default '[]',
  exercise      jsonb default '[]',
  cal_target    int default 2500,
  total_in      int default 0,
  total_burned  int default 0,
  updated_at    timestamptz default now(),
  unique (member_id, log_date)
);

-- ROW LEVEL SECURITY
alter table public.members      enable row level security;
alter table public.calorie_logs enable row level security;
alter table public.visit_logs   enable row level security;
alter table public.providers    enable row level security;
alter table public.deals        enable row level security;

-- Members: own data only
create policy "member_own_data" on public.members
  for all using (id = auth.uid());

create policy "calorie_own_data" on public.calorie_logs
  for all using (member_id = auth.uid());

create policy "visits_read_own" on public.visit_logs
  for select using (member_id = auth.uid());

-- Providers & deals: public read
create policy "providers_public" on public.providers
  for select using (status = 'live');

create policy "deals_public" on public.deals
  for select using (active = true);
