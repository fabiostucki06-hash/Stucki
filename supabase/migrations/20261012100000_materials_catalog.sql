-- Materials catalog: reusable parts (e.g. imported via the part-import feature)
-- that staff can look up again instead of re-entering EK/VK every time.
-- Same shape/RLS pattern as customers/orders/offerten/rechnungen (id text, data jsonb,
-- shared by all signed-in staff, no user_id column).

create table if not exists public.materials (
  id text primary key,
  data jsonb not null
);

alter table public.materials enable row level security;

drop policy if exists materials_select_authenticated on public.materials;
drop policy if exists materials_insert_authenticated on public.materials;
drop policy if exists materials_update_authenticated on public.materials;
drop policy if exists materials_delete_authenticated on public.materials;

create policy materials_select_authenticated on public.materials
  for select to authenticated
  using (true);

create policy materials_insert_authenticated on public.materials
  for insert to authenticated
  with check (true);

create policy materials_update_authenticated on public.materials
  for update to authenticated
  using (true)
  with check (true);

create policy materials_delete_authenticated on public.materials
  for delete to authenticated
  using (true);
