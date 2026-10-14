-- Background part import for iOS Shortcuts ("Inhalte von URL abrufen" ->
-- POST /api/import-shortcut). A Shortcut can't hold a login session, so each
-- user generates a long random Kurzbefehl key in Settings; only its SHA-256 hash
-- is stored here. The serverless function scrapes the part and calls
-- shortcut_add_part() with the anon key: the function itself checks the key, so
-- no service-role secret is needed on Vercel.

alter table public.user_settings add column if not exists import_token_hash text;
create unique index if not exists user_settings_import_token_hash_key
  on public.user_settings (import_token_hash) where import_token_hash is not null;

-- Lenient numeric read of a position's text price ('' / junk -> 0), like the client's parseFloat(… || '0') || 0.
create or replace function public._shortcut_num(v text) returns numeric
language sql immutable as $$
  select coalesce((substring(replace(coalesce(v, ''), ',', '.') from '^\s*(-?[0-9]+(?:\.[0-9]+)?)'))::numeric, 0)
$$;

create or replace function public.shortcut_add_part(
  p_token text,
  p_offerte_id text,
  p_beschreibung text,
  p_ek numeric,
  p_artikelnummer text default null,
  p_link text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.user_settings%rowtype;
  target text;
  off jsonb;
  pos jsonb;
  vk text;
  positions jsonb;
  t_arbeit numeric;
  t_material numeric;
begin
  if coalesce(length(p_token), 0) < 32 then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;
  select * into s from public.user_settings
   where import_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  target := coalesce(nullif(p_offerte_id, ''), nullif(s.active_offerte_id, ''));
  if target is null then
    return jsonb_build_object('ok', false, 'code', 'no_active_offerte');
  end if;

  -- Row lock: two imports in quick succession must both land, not overwrite each other.
  select data into off from public.offerten where id::text = target for update;
  if off is null then
    return jsonb_build_object('ok', false, 'code', 'offerte_not_found');
  end if;
  if coalesce(off->>'status', '') not in ('entwurf', 'versendet') then
    return jsonb_build_object('ok', false, 'code', 'offerte_closed', 'offertNumber', off->'offertNumber');
  end if;
  if coalesce(trim(p_beschreibung), '') = '' or p_ek is null or p_ek <= 0 then
    return jsonb_build_object('ok', false, 'code', 'incomplete_part');
  end if;

  vk := to_char(round(p_ek * (1 + coalesce(s.margin, 30) / 100), 2), 'FM9999999990.00');
  pos := jsonb_strip_nulls(jsonb_build_object(
    'typ', 'material',
    'beschreibung', trim(p_beschreibung),
    'menge', '1',
    'stueckpreis', vk,
    'preis', vk,
    'link', nullif(p_link, ''),
    'ek', to_char(p_ek, 'FM9999999990.00'),
    'artikelnummer', nullif(p_artikelnummer, '')
  ));
  positions := coalesce(off->'positionen', '[]'::jsonb) || jsonb_build_array(pos);

  select coalesce(sum(public._shortcut_num(e.v->>'preis')) filter (where e.v->>'typ' = 'arbeit'), 0),
         coalesce(sum(public._shortcut_num(e.v->>'preis')) filter (where e.v->>'typ' = 'material'), 0)
    into t_arbeit, t_material
    from jsonb_array_elements(positions) as e(v);

  off := off || jsonb_build_object(
    'positionen', positions,
    'totalArbeit', to_char(t_arbeit, 'FM9999999990.00'),
    'totalMaterial', to_char(t_material, 'FM9999999990.00'),
    'totalBetrag', to_char(t_arbeit + t_material, 'FM9999999990.00')
  );
  update public.offerten set data = off where id::text = target;

  return jsonb_build_object('ok', true, 'offertNumber', off->'offertNumber', 'offerteId', target,
                            'beschreibung', pos->>'beschreibung', 'vk', vk);
end
$$;

revoke all on function public.shortcut_add_part(text, text, text, numeric, text, text) from public;
grant execute on function public.shortcut_add_part(text, text, text, numeric, text, text) to anon, authenticated;
revoke all on function public._shortcut_num(text) from public, anon, authenticated;
