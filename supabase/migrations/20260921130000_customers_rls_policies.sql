-- customers: RLS was enabled but no policies existed, so every request failed with
-- "new row violates row-level security policy for table customers".
--
-- Table has no user_id column (id text, data jsonb): garage data is shared by all
-- signed-in staff. Grant full CRUD to the `authenticated` role only. `anon` gets nothing.
-- The app upserts (POST + Prefer: resolution=merge-duplicates), which needs
-- INSERT + UPDATE (+ SELECT); it also lists and deletes, so all four are required.

alter table public.customers enable row level security;

drop policy if exists customers_select_authenticated on public.customers;
drop policy if exists customers_insert_authenticated on public.customers;
drop policy if exists customers_update_authenticated on public.customers;
drop policy if exists customers_delete_authenticated on public.customers;

create policy customers_select_authenticated on public.customers
  for select to authenticated
  using (true);

create policy customers_insert_authenticated on public.customers
  for insert to authenticated
  with check (true);

create policy customers_update_authenticated on public.customers
  for update to authenticated
  using (true)
  with check (true);

create policy customers_delete_authenticated on public.customers
  for delete to authenticated
  using (true);
