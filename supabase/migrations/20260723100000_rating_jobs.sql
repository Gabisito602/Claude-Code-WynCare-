-- Cola de tarificación real: cuando un cliente registrado sube su
-- documentación (o la rellena a mano) para que le calculemos el precio de
-- verdad con la aseguradora, se crea una fila aquí. Un worker externo
-- (Playwright automatizando el portal del agente en la aseguradora, fuera
-- de este repo — no puede vivir en una sesión de Claude Code, tiene que
-- ser un proceso persistente) la recoge, la procesa, y escribe el
-- resultado. Sustituye la estimación de la calculadora por el precio real.
create table if not exists public.rating_jobs (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  insurer text not null,
  status text not null default 'pending', -- pending | processing | done | failed
  extracted_data jsonb,
  real_premium numeric,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rating_jobs enable row level security;

-- El usuario ve el estado de sus propios jobs (a través de su propia
-- cotización), pero no puede crearlos ni editarlos directamente: los crea
-- el backend (Edge Function) al procesar su documentación, con la
-- service_role key, que se salta RLS.
drop policy if exists "usuarios ven sus propios rating_jobs" on public.rating_jobs;
create policy "usuarios ven sus propios rating_jobs" on public.rating_jobs
  for select using (
    exists (
      select 1 from public.quotes
      where quotes.id = rating_jobs.quote_id
        and quotes.user_id = auth.uid()
    )
  );

drop policy if exists "admins gestionan rating_jobs" on public.rating_jobs;
create policy "admins gestionan rating_jobs" on public.rating_jobs
  for all using (public.is_admin()) with check (public.is_admin());
