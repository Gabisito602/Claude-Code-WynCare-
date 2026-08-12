-- Bucket de Storage para los PDFs que sube el admin: presupuestos
-- validados y documentos de pólizas. Convención de rutas:
--   quotes/{quote_id}/archivo.pdf
--   policies/{policy_id}/archivo.pdf
-- privado (public=false): todo el acceso pasa por las políticas de abajo,
-- nunca por URL pública sin más.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- El equipo (profiles.role = 'admin') puede subir, leer y borrar cualquier
-- archivo del bucket.
drop policy if exists "admins gestionan documentos en storage" on storage.objects;
create policy "admins gestionan documentos en storage" on storage.objects
  for all using (bucket_id = 'documents' and public.is_admin())
  with check (bucket_id = 'documents' and public.is_admin());

-- El cliente puede leer los archivos de sus propios presupuestos...
drop policy if exists "usuarios leen sus documentos de presupuestos" on storage.objects;
create policy "usuarios leen sus documentos de presupuestos" on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'quotes'
    and exists (
      select 1 from public.quotes
      where quotes.id::text = (storage.foldername(name))[2]
        and quotes.user_id = auth.uid()
    )
  );

-- ...y los de sus propias pólizas.
drop policy if exists "usuarios leen sus documentos de pólizas" on storage.objects;
create policy "usuarios leen sus documentos de pólizas" on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'policies'
    and exists (
      select 1 from public.policies
      where policies.id::text = (storage.foldername(name))[2]
        and policies.user_id = auth.uid()
    )
  );
