-- Ejecuta esto en el SQL Editor de Supabase cuando retomemos la conexión real
-- para "Mis presupuestos". Amplía la tabla "quotes" (ya existe y ya recibe
-- inserts desde saveQuote() en app.js) con lo que le falta para el ciclo de
-- validación completo: estado con más pasos, el PDF final y el motivo si se
-- rechaza.
--
-- Antes de correrlo, confirma con 00_inspect_schema.sql que "quotes" existe
-- y qué columnas tiene ya.

alter table public.quotes
  add column if not exists document_url text,
  add column if not exists rejection_reason text;

-- Valores válidos para "status" a partir de ahora:
--   pending_docs  -> Pendiente de validar documentación (estado inicial, el
--                    que ya pone saveQuote() al guardar la cotización)
--   in_review     -> Verificación en curso
--   validated     -> Validado (document_url debería tener el PDF)
--   rejected      -> Rechazado (rejection_reason con el motivo)
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('pending_docs', 'in_review', 'validated', 'rejected'));

-- Migra filas antiguas que se guardaron con el status genérico "pending"
-- de antes de este cambio.
update public.quotes set status = 'pending_docs' where status = 'pending';

-- RLS: el cliente necesita poder LEER sus propios presupuestos para la
-- pestaña "Mis presupuestos" (hasta ahora solo se insertaban, nunca se leían).
alter table public.quotes enable row level security;

create policy "usuarios ven sus propios presupuestos" on public.quotes
  for select using (auth.uid() = user_id);

-- El cambio de estado, el motivo de rechazo y la subida del PDF los hace el
-- equipo desde el panel admin (service_role / Edge Function), no el cliente
-- directamente — por eso no hace falta una policy de "update" para el
-- usuario aquí.
