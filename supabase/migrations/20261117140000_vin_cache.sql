-- Decoded VIN patterns (Edge Function vin-decode). One row per pattern:
-- WMI + VDS (VIN chars 1–8) + model year (char 10), i.e. the VIN without the
-- check digit and the serial part. Every vehicle sharing that pattern is the
-- same make / model / year / VDS-coded variant, so a repeated lookup is served
-- from here without calling NHTSA, the commercial decoders or Claude again.
--
-- Written only by the Edge Function (service role); signed-in staff may read.

create table if not exists public.vin_cache (
  muster text primary key,
  vin text not null,
  data jsonb not null,
  quellen text[] not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.vin_cache enable row level security;

drop policy if exists vin_cache_select_authenticated on public.vin_cache;

create policy vin_cache_select_authenticated on public.vin_cache
  for select to authenticated
  using (true);
