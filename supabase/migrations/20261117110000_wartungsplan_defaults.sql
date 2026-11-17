-- Slimmer Standard-Wartungsplan: MFK, Reifenwechsel, Wischerblätter,
-- Klimaservice, Kühlflüssigkeit and Bremsbeläge/-scheiben are no longer part
-- of the defaults (src/lib/vehicles.ts STANDARD_SERVICE).
--
-- Vehicles that already got the old defaults lose these items too, but only
-- while untouched: never ticked off (no historie / letztesDatum), no due date
-- or mileage set by hand and no note. Anything the garage worked with stays.

update public.vehicles v
set data = jsonb_set(v.data, '{service}', coalesce((
  select jsonb_agg(item order by ord)
  from jsonb_array_elements(v.data->'service') with ordinality as t(item, ord)
  where not (
    item->>'name' in (
      'MFK / Fahrzeugprüfung',
      'Reifenwechsel Sommer/Winter',
      'Wischerblätter',
      'Klimaservice',
      'Kühlflüssigkeit',
      'Bremsbeläge & -scheiben prüfen'
    )
    and coalesce(jsonb_array_length(item->'historie'), 0) = 0
    and coalesce(item->>'letztesDatum', '') = ''
    and coalesce(item->>'faelligDatum', '') = ''
    and coalesce(item->>'faelligKm', '') = ''
    and coalesce(item->>'notiz', '') = ''
  )
), '[]'::jsonb))
where jsonb_typeof(v.data->'service') = 'array';
