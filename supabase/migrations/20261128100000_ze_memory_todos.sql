-- ZE learned from the workshop's own entries (ZeEintrag, src/lib/ze-memory.ts):
-- every ZE entered on an Offerte / Rechnung line, an Inspektion's ZE in the
-- Wartungsplan and the ZE of material entered on a vehicle, stored with the
-- vehicle configuration (Marke, Modell, Motorkennbuchstabe, Jahrgang,
-- Getriebe, Antrieb, Antriebsart) and the normalized task. Offered again for
-- the same task on a matching vehicle; nothing is estimated or generated.
--
-- id = 'ze|<arbeit|material>|<task>|<marke>|<modell>|<motorcode>|<jahr>|<getriebe>|<antrieb>|<achsantrieb>'
--
-- Same shape/RLS pattern as the other garage tables (id text, data jsonb,
-- shared by all signed-in staff).

create table if not exists public.ze_memory (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter table public.ze_memory enable row level security;

drop policy if exists ze_memory_select_authenticated on public.ze_memory;
drop policy if exists ze_memory_insert_authenticated on public.ze_memory;
drop policy if exists ze_memory_update_authenticated on public.ze_memory;
drop policy if exists ze_memory_delete_authenticated on public.ze_memory;

create policy ze_memory_select_authenticated on public.ze_memory
  for select to authenticated using (true);
create policy ze_memory_insert_authenticated on public.ze_memory
  for insert to authenticated with check (true);
create policy ze_memory_update_authenticated on public.ze_memory
  for update to authenticated using (true) with check (true);
create policy ze_memory_delete_authenticated on public.ze_memory
  for delete to authenticated using (true);

-- To-Do list of the Übersicht (Settings.todos): [{id, text, erledigt, createdAt}],
-- synced across the user's devices like the other settings.
alter table public.user_settings add column if not exists todos jsonb;
