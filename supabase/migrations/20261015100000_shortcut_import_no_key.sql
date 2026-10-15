-- Kurzbefehl key no longer required: GET /api/import-part?import_url=… imports
-- straight into the active Offerte. A key, if still sent and valid, picks that
-- user's settings; otherwise the most recently updated settings row with an
-- active Offerte is used (GarageOS is single-workshop). Never returns 'unauthorized'.

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
  if coalesce(length(p_token), 0) >= 32 then
    select * into s from public.user_settings
     where import_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  end if;
  if s.user_id is null then
    select * into s from public.user_settings
     order by (nullif(active_offerte_id, '') is null), updated_at desc
     limit 1;
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
