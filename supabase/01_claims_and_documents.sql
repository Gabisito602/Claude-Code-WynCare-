-- Ejecuta esto en el SQL Editor de Supabase para habilitar "Siniestros" y
-- "Documentos" en el Área Cliente. Antes de correrlo, confirma con
-- 00_inspect_schema.sql que "policies" tiene una columna "id" (uuid, PK) —
-- ambas tablas nuevas apuntan a ella con policy_id.

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid references public.policies(id) on delete set null,
  reference text not null,
  incident_type text,
  incident_date date,
  phone text,
  description text,
  status text not null default 'Enviado',
  created_at timestamptz not null default now()
);

alter table public.claims enable row level security;

create policy "usuarios ven sus propios siniestros" on public.claims
  for select using (auth.uid() = user_id);

create policy "usuarios declaran sus propios siniestros" on public.claims
  for insert with check (auth.uid() = user_id);

-- Los documentos los sube el equipo (admin/backend), los clientes solo leen
-- los de sus propias pólizas.
create table if not exists public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);

alter table public.policy_documents enable row level security;

create policy "usuarios ven documentos de sus propias pólizas" on public.policy_documents
  for select using (
    exists (
      select 1 from public.policies
      where policies.id = policy_documents.policy_id
        and policies.user_id = auth.uid()
    )
  );
