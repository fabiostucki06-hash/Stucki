-- Parts / positions entered per Wartungsplan item (WartungTeile,
-- src/lib/wartung-teile.ts). When an Offerte made from the Wartungsplan is
-- saved, the lines assigned to each item (parts, quantities, prices, ZE) are
-- stored here and pre-filled into the next Offerte from the Wartungsplan.
-- Only lines actually entered are stored; nothing is generated.
--
-- id = 'fz:<vehicleId>:<item key>'      parts of one vehicle
--    | 'konfig:<konfig>:<item key>'     same Marke / Modell / Motorcode
--                                       (+ Getriebe / Antrieb), reused on
--                                       another vehicle only after confirmation.
--
-- Same shape/RLS pattern as the other garage tables (id text, data jsonb,
-- shared by all signed-in staff).

create table if not exists public.maintenance_parts (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table public.maintenance_parts enable row level security;

drop policy if exists maintenance_parts_select_authenticated on public.maintenance_parts;
drop policy if exists maintenance_parts_insert_authenticated on public.maintenance_parts;
drop policy if exists maintenance_parts_update_authenticated on public.maintenance_parts;
drop policy if exists maintenance_parts_delete_authenticated on public.maintenance_parts;

create policy maintenance_parts_select_authenticated on public.maintenance_parts
  for select to authenticated
  using (true);

create policy maintenance_parts_insert_authenticated on public.maintenance_parts
  for insert to authenticated
  with check (true);

create policy maintenance_parts_update_authenticated on public.maintenance_parts
  for update to authenticated
  using (true)
  with check (true);

create policy maintenance_parts_delete_authenticated on public.maintenance_parts
  for delete to authenticated
  using (true);
