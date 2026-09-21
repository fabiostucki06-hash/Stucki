-- whitelist must not be writable from the client. Drop write policies and revoke
-- write privileges from the API roles (defense in depth). SELECT for `authenticated` stays.
-- Manage entries via the Supabase dashboard / service role only.

drop policy if exists whitelist_insert_authenticated on public.whitelist;
drop policy if exists whitelist_update_authenticated on public.whitelist;
drop policy if exists whitelist_delete_authenticated on public.whitelist;

revoke insert, update, delete, truncate on public.whitelist from anon, authenticated;
