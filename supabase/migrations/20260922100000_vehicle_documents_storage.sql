-- vehicle-documents: private Storage bucket for customer "Fahrzeugpapiere" uploads
-- (registration docs, etc). Garage data is shared by all signed-in staff (same
-- model as the customers/orders tables), so grant full SELECT/INSERT/DELETE on
-- this bucket's objects to `authenticated`. No public access, no `anon`.

insert into storage.buckets (id, name, public)
values ('vehicle-documents', 'vehicle-documents', false)
on conflict (id) do nothing;

drop policy if exists vehicle_documents_select_authenticated on storage.objects;
drop policy if exists vehicle_documents_insert_authenticated on storage.objects;
drop policy if exists vehicle_documents_delete_authenticated on storage.objects;

create policy vehicle_documents_select_authenticated on storage.objects
  for select to authenticated
  using (bucket_id = 'vehicle-documents');

create policy vehicle_documents_insert_authenticated on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vehicle-documents');

create policy vehicle_documents_delete_authenticated on storage.objects
  for delete to authenticated
  using (bucket_id = 'vehicle-documents');
