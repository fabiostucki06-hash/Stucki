-- Same fix as customers: RLS enabled, no policies -> every request rejected.
-- Full CRUD for the `authenticated` role on the remaining garage tables. `anon` gets nothing.
-- Tables have no user_id column, so data is shared by all signed-in staff.

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'offerten', 'rechnungen', 'counters', 'whitelist'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_authenticated', t);

    execute format('create policy %I on public.%I for select to authenticated using (true)',
                   t || '_select_authenticated', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)',
                   t || '_insert_authenticated', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)',
                   t || '_update_authenticated', t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)',
                   t || '_delete_authenticated', t);
  end loop;
end
$$;
