-- "Batterie prüfen" is no longer part of the Standard-Wartungsplan
-- (src/lib/vehicles.ts STANDARD_SERVICE); purge it from every existing
-- vehicle's Wartungsplan as well.

update public.vehicles v
set data = jsonb_set(v.data, '{service}', coalesce((
  select jsonb_agg(item order by ord)
  from jsonb_array_elements(v.data->'service') with ordinality as t(item, ord)
  where item->>'name' <> 'Batterie prüfen'
), '[]'::jsonb))
where jsonb_typeof(v.data->'service') = 'array';
