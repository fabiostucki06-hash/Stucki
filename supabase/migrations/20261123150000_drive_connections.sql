-- Google Drive connection per user (Einstellungen → Integrationen & Cloud).
-- refresh_token_enc is AES-256-GCM ciphertext: the key is derived from
-- GOOGLE_CLIENT_SECRET and exists only on the server (api/_drive.ts), so the
-- row is useless without it. RLS limits every row to its owner.

create table if not exists public.drive_connections (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  refresh_token_enc text not null,
  account_email text,
  connected_at timestamptz not null default now()
);

alter table public.drive_connections enable row level security;

revoke all on public.drive_connections from anon;
grant select, insert, update, delete on public.drive_connections to authenticated;

drop policy if exists drive_connections_select_own on public.drive_connections;
drop policy if exists drive_connections_insert_own on public.drive_connections;
drop policy if exists drive_connections_update_own on public.drive_connections;
drop policy if exists drive_connections_delete_own on public.drive_connections;

create policy drive_connections_select_own on public.drive_connections
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy drive_connections_insert_own on public.drive_connections
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy drive_connections_update_own on public.drive_connections
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy drive_connections_delete_own on public.drive_connections
  for delete to authenticated
  using ((select auth.uid()) = user_id);
