-- Habilita "Siniestros" y "Documentos" en el Área Cliente.
-- (Antes era supabase/01_claims_and_documents.sql, movido aquí y con
-- "drop policy if exists" delante de cada policy para poder reaplicarse
-- sin error si ya se hubiera ejecutado a mano.)

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

drop policy if exists "usuarios ven sus propios siniestros" on public.claims;
create policy "usuarios ven sus propios siniestros" on public.claims
  for select using (auth.uid() = user_id);

drop policy if exists "usuarios declaran sus propios siniestros" on public.claims;
create policy "usuarios declaran sus propios siniestros" on public.claims
  for insert with check (auth.uid() = user_id);

-- Los documentos los sube el equipo (admin), los clientes solo leen los de
-- sus propias pólizas.
create table if not exists public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);

alter table public.policy_documents enable row level security;

drop policy if exists "usuarios ven documentos de sus propias pólizas" on public.policy_documents;
create policy "usuarios ven documentos de sus propias pólizas" on public.policy_documents
  for select using (
    exists (
      select 1 from public.policies
      where policies.id = policy_documents.policy_id
        and policies.user_id = auth.uid()
    )
  );
