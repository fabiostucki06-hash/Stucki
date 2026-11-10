-- Fixed-price service bundles (Pauschalen, e.g. Radwechsel CHF 60) managed in
-- Einstellungen → Werkstatt → Pauschalen. jsonb array of {id, name, preis};
-- null = never set on any device (the app's defaults apply).
alter table public.user_settings add column if not exists pauschalen jsonb;
