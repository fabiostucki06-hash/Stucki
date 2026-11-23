-- The yes/no field "allrad" becomes the driven axles "achsantrieb" (front, heck, allrad).
-- "ja" maps to allrad. "nein" says neither front nor rear, so it becomes unknown (unset).
update public.vehicles
set data = case
  when data->>'allrad' = 'ja' and not data ? 'achsantrieb'
    then (data - 'allrad') || '{"achsantrieb": "allrad"}'::jsonb
  else data - 'allrad'
end
where data ? 'allrad';
