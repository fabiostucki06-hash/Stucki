-- Researched manufacturer intervals (api/wartung-lookup), shared by every
-- vehicle with the same configuration. One row per configuration + item:
-- schluessel = marke|modell|baujahr|motor|MOTORCODE|antrieb|achsantrieb|getriebe|steuertrieb
-- (same fields as konfigSchluessel in src/lib/wartung.ts), vorlage = item key.
-- A repeated lookup for identical specs is answered from here without calling
-- the AI provider again. Rows with a found source ('belegt') stay; rows without
-- one are asked again only after 30 days (checked in the API function).
--
-- Written and read by api/wartung-lookup with the signed-in user's token.

create table if not exists public.wartung_lookup_cache (
  schluessel text not null,
  vorlage text not null,
  data jsonb not null,
  belegt boolean not null default false,
  updated_at timestamptz default now(),
  primary key (schluessel, vorlage)
);

alter table public.wartung_lookup_cache enable row level security;

drop policy if exists wartung_lookup_cache_select_authenticated on public.wartung_lookup_cache;
drop policy if exists wartung_lookup_cache_insert_authenticated on public.wartung_lookup_cache;
drop policy if exists wartung_lookup_cache_update_authenticated on public.wartung_lookup_cache;

create policy wartung_lookup_cache_select_authenticated on public.wartung_lookup_cache
  for select to authenticated
  using (true);

create policy wartung_lookup_cache_insert_authenticated on public.wartung_lookup_cache
  for insert to authenticated
  with check (true);

create policy wartung_lookup_cache_update_authenticated on public.wartung_lookup_cache
  for update to authenticated
  using (true)
  with check (true);
