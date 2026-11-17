-- Multiple vehicles per customer (1:n). Until now the vehicle fields (marke,
-- modell, kennzeichen, km, chassisnummer, erstzulassung) lived inside
-- customers.data. They move into their own table with a real foreign key, so a
-- customer can have several vehicles, each with its own Service-Wartungsplan
-- (data.service, see the Vehicle type).
--
-- Same shape/RLS pattern as the other garage tables (id text, data jsonb, shared
-- by all signed-in staff). customer_id is a real column for the FK and the index;
-- data.customerId mirrors it for the app.

create table if not exists public.vehicles (
  id text primary key,
  customer_id text not null references public.customers(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz default now()
);

create index if not exists vehicles_customer_id_idx on public.vehicles (customer_id);

alter table public.vehicles enable row level security;

drop policy if exists vehicles_select_authenticated on public.vehicles;
drop policy if exists vehicles_insert_authenticated on public.vehicles;
drop policy if exists vehicles_update_authenticated on public.vehicles;
drop policy if exists vehicles_delete_authenticated on public.vehicles;

create policy vehicles_select_authenticated on public.vehicles
  for select to authenticated
  using (true);

create policy vehicles_insert_authenticated on public.vehicles
  for insert to authenticated
  with check (true);

create policy vehicles_update_authenticated on public.vehicles
  for update to authenticated
  using (true)
  with check (true);

create policy vehicles_delete_authenticated on public.vehicles
  for delete to authenticated
  using (true);

-- Backfill: every customer with vehicle data gets one vehicle 'v_<customer id>'.
insert into public.vehicles (id, customer_id, data)
select
  'v_' || c.id,
  c.id,
  jsonb_strip_nulls(jsonb_build_object(
    'id',            'v_' || c.id,
    'customerId',    c.id,
    'marke',         nullif(c.data->>'marke', ''),
    'modell',        nullif(c.data->>'modell', ''),
    'kennzeichen',   nullif(c.data->>'kennzeichen', ''),
    'km',            nullif(c.data->>'km', ''),
    'chassisnummer', nullif(c.data->>'chassisnummer', ''),
    'erstzulassung', nullif(c.data->>'erstzulassung', ''),
    'createdAt',     coalesce(c.data->>'createdAt', now()::text)
  ))
from public.customers c
where coalesce(c.data->>'marke', '') <> ''
   or coalesce(c.data->>'modell', '') <> ''
   or coalesce(c.data->>'kennzeichen', '') <> ''
   or coalesce(c.data->>'km', '') <> ''
   or coalesce(c.data->>'chassisnummer', '') <> ''
   or coalesce(c.data->>'erstzulassung', '') <> ''
on conflict (id) do nothing;

-- The vehicle now owns these fields.
update public.customers
set data = data - 'marke' - 'modell' - 'kennzeichen' - 'km' - 'chassisnummer' - 'erstzulassung'
where data ?| array['marke', 'modell', 'kennzeichen', 'km', 'chassisnummer', 'erstzulassung'];

-- Existing documents belong to the customer's (until now only) vehicle.
update public.orders d
set data = d.data || jsonb_build_object('vehicleId', v.id)
from public.vehicles v
where v.id = 'v_' || (d.data->>'customerId') and not (d.data ? 'vehicleId');

update public.offerten d
set data = d.data || jsonb_build_object('vehicleId', v.id)
from public.vehicles v
where v.id = 'v_' || (d.data->>'customerId') and not (d.data ? 'vehicleId');

update public.rechnungen d
set data = d.data || jsonb_build_object('vehicleId', v.id)
from public.vehicles v
where v.id = 'v_' || (d.data->>'customerId') and not (d.data ? 'vehicleId');
