-- Slimmer Standard-Wartungsplan: MFK, Reifenwechsel, Wischerblätter,
-- Klimaservice, Kühlflüssigkeit and Bremsbeläge/-scheiben are no longer part
-- of the defaults (src/lib/vehicles.ts STANDARD_SERVICE).
--
-- They are purged from every existing vehicle's Wartungsplan as well.

update public.vehicles v
set data = jsonb_set(v.data, '{service}', coalesce((
  select jsonb_agg(item order by ord)
  from jsonb_array_elements(v.data->'service') with ordinality as t(item, ord)
  where item->>'name' not in (
    'MFK / Fahrzeugprüfung',
    'Reifenwechsel Sommer/Winter',
    'Wischerblätter',
    'Klimaservice',
    'Kühlflüssigkeit',
    'Bremsbeläge & -scheiben prüfen'
  )
), '[]'::jsonb))
where jsonb_typeof(v.data->'service') = 'array';
