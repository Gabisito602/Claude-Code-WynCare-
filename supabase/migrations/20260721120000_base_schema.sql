-- Base de datos de WynCare: profiles, policies, quotes, wynpoints_transactions.
--
-- Todo con "if not exists" a propósito: no sabemos si ya tenías estas tablas
-- creadas de antes (dijiste que sí, pero no hemos podido confirmar columnas
-- exactas). Si ya existen, estas líneas no hacen nada; si no existen, las
-- crean con la forma que espera app.js. Nunca borra ni modifica columnas
-- existentes.
--
-- Si esta migración falla, lo más probable es un choque de tipos con una
-- tabla que ya tenías (por ejemplo "policies.id" no siendo uuid). Copia el
-- error exacto que te dé Supabase y lo ajustamos.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  wynpoints integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "usuarios ven su propio perfil" on public.profiles;
create policy "usuarios ven su propio perfil" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "usuarios actualizan su propio perfil" on public.profiles;
create policy "usuarios actualizan su propio perfil" on public.profiles
  for update using (auth.uid() = id);
drop policy if exists "usuarios crean su propio perfil" on public.profiles;
create policy "usuarios crean su propio perfil" on public.profiles
  for insert with check (auth.uid() = id);

create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text,
  reference text,
  premium numeric,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
alter table public.policies enable row level security;
drop policy if exists "usuarios ven sus propias pólizas" on public.policies;
create policy "usuarios ven sus propias pólizas" on public.policies
  for select using (auth.uid() = user_id);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_type text,
  premium numeric,
  coverage_description text,
  wynpoints integer default 0,
  reference text,
  status text not null default 'pending_docs',
  created_at timestamptz not null default now()
);
alter table public.quotes enable row level security;
drop policy if exists "usuarios ven sus propios presupuestos" on public.quotes;
create policy "usuarios ven sus propios presupuestos" on public.quotes
  for select using (auth.uid() = user_id);
drop policy if exists "usuarios crean sus propios presupuestos" on public.quotes;
create policy "usuarios crean sus propios presupuestos" on public.quotes
  for insert with check (auth.uid() = user_id);

create table if not exists public.wynpoints_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text,
  points integer not null default 0,
  description text,
  created_at timestamptz not null default now()
);
alter table public.wynpoints_transactions enable row level security;
drop policy if exists "usuarios ven sus propias transacciones" on public.wynpoints_transactions;
create policy "usuarios ven sus propias transacciones" on public.wynpoints_transactions
  for select using (auth.uid() = user_id);
