-- Amplía "quotes" para el ciclo de validación de "Mis presupuestos":
-- estado con más pasos, el PDF final y el motivo si se rechaza.
-- (Antes era supabase/02_quotes_status_and_documents.sql, movido aquí.)

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
