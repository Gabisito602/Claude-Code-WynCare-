-- Da al equipo de WynCare permiso para ver/editar los datos de CUALQUIER
-- cliente (necesario para el panel admin: validar presupuestos, subir
-- documentos de pólizas, etc.) sin usar la service_role key en el navegador.
--
-- Después de correr esto, para convertir tu propio usuario en admin:
--   update public.profiles set role = 'admin' where email = 'tu-email@dominio.com';
-- (sustituye por el email con el que inicias sesión en WynCare)

alter table public.profiles add column if not exists role text not null default 'client';

-- security definer: comprueba el rol saltándose la RLS de "profiles" para
-- evitar que la propia política de profiles dependa circularmente de esta
-- función.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "admins ven todas las pólizas" on public.policies;
create policy "admins ven todas las pólizas" on public.policies
  for select using (public.is_admin());
drop policy if exists "admins actualizan pólizas" on public.policies;
create policy "admins actualizan pólizas" on public.policies
  for update using (public.is_admin());

drop policy if exists "admins ven todos los presupuestos" on public.quotes;
create policy "admins ven todos los presupuestos" on public.quotes
  for select using (public.is_admin());
drop policy if exists "admins actualizan presupuestos" on public.quotes;
create policy "admins actualizan presupuestos" on public.quotes
  for update using (public.is_admin());

drop policy if exists "admins gestionan documentos de pólizas" on public.policy_documents;
create policy "admins gestionan documentos de pólizas" on public.policy_documents
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins ven todos los siniestros" on public.claims;
create policy "admins ven todos los siniestros" on public.claims
  for select using (public.is_admin());
drop policy if exists "admins actualizan siniestros" on public.claims;
create policy "admins actualizan siniestros" on public.claims
  for update using (public.is_admin());

drop policy if exists "admins ven todos los perfiles" on public.profiles;
create policy "admins ven todos los perfiles" on public.profiles
  for select using (public.is_admin());

