-- Per-user UI settings (background, active Offerte, IBAN, import margin) that
-- used to live only in the browser's localStorage. One row per auth user, so
-- the same account sees the same settings on every device; published to
-- Supabase Realtime so a change on one device reaches the others live.
-- One column per setting (not a jsonb blob): a device only writes the columns
-- it changed, so two devices changing different settings don't clobber each other.

create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  wallpaper text,
  bg_mode text check (bg_mode in ('image', 'color')),
  bg_color text,
  active_offerte_id text,
  iban text,
  margin numeric,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

grant select, insert, update on public.user_settings to authenticated;

drop policy if exists user_settings_select_own on public.user_settings;
drop policy if exists user_settings_insert_own on public.user_settings;
drop policy if exists user_settings_update_own on public.user_settings;

create policy user_settings_select_own on public.user_settings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_settings_insert_own on public.user_settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_settings'
  ) then
    alter publication supabase_realtime add table public.user_settings;
  end if;
end $$;
