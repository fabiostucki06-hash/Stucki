-- Wartungsplan intervals checked against the OEM schedule (Herstellervorgabe),
-- one row per manufacturer + Motorkennbuchstabe + item (WartungSpec,
-- src/lib/wartung.ts). Once a mechanic has checked an interval for an engine,
-- every vehicle with that Motorkennbuchstabe gets it (quelle 'geprueft')
-- instead of the generic Standard- / Richtwert.
--
-- The per-vehicle plan itself stays in vehicles.data.service; each item records
-- where its interval comes from (quelle, quelleText, geprueftAm).
--
-- Same shape/RLS pattern as the other garage tables (id text, data jsonb,
-- shared by all signed-in staff). id = '<hersteller>|<MOTORCODE>|<vorlage>'.

create table if not exists public.maintenance_specs (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table public.maintenance_specs enable row level security;

drop policy if exists maintenance_specs_select_authenticated on public.maintenance_specs;
drop policy if exists maintenance_specs_insert_authenticated on public.maintenance_specs;
drop policy if exists maintenance_specs_update_authenticated on public.maintenance_specs;
drop policy if exists maintenance_specs_delete_authenticated on public.maintenance_specs;

create policy maintenance_specs_select_authenticated on public.maintenance_specs
  for select to authenticated
  using (true);

create policy maintenance_specs_insert_authenticated on public.maintenance_specs
  for insert to authenticated
  with check (true);

create policy maintenance_specs_update_authenticated on public.maintenance_specs
  for update to authenticated
  using (true)
  with check (true);

create policy maintenance_specs_delete_authenticated on public.maintenance_specs
  for delete to authenticated
  using (true);
