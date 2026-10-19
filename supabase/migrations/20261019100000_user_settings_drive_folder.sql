-- Google Drive target folder for the automatic PDF archive (Einstellungen →
-- Integrationen & Cloud). '' / null = server default (GOOGLE_DRIVE_FOLDER_ID
-- or "GarageOS" in My Drive).
alter table public.user_settings add column if not exists drive_folder_id text;
