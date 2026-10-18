-- Own signature, stored once in the settings and placed on every
-- Auftragsbestätigung. PNG data URL (transparent background, 600x200 px).
alter table public.user_settings add column if not exists signature text;
