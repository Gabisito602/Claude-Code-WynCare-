-- Amplía "quotes" para el ciclo de validación de "Mis presupuestos":
-- el PDF final y el motivo si se rechaza. Los valores de estado en sí
-- (pending_docs / in_review / validated / rejected) ya se añadieron al
-- tipo enum "quote_status" en 20260721120150_quotes_status_enum_values.sql
-- — un enum ya restringe qué valores son válidos, así que aquí no hace
-- falta (ni se puede) un "check constraint" aparte para lo mismo.

alter table public.quotes
  add column if not exists document_url text,
  add column if not exists rejection_reason text;

-- Migra filas antiguas que se guardaron con el status genérico "pending"
-- de antes de este cambio.
update public.quotes set status = 'pending_docs' where status = 'pending';
