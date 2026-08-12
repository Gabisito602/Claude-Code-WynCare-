-- Amplía "quotes" para el ciclo de validación de "Mis presupuestos":
-- el PDF final y el motivo si se rechaza. Los valores de estado en sí
-- (pending_docs / in_review / validated / rejected) ya se añadieron al
-- tipo enum "quote_status" en 20260721120150_quotes_status_enum_values.sql
-- — un enum ya restringe qué valores son válidos, así que aquí no hace
-- falta (ni se puede) un "check constraint" aparte para lo mismo.
--
-- Nota: quitamos de aquí el UPDATE que migraba filas antiguas con el status
-- "pending" genérico — resultó que ese valor tampoco existía en tu enum
-- real (el error nos lo confirmó), así que probablemente no haya filas que
-- migrar con ese nombre. Si más adelante aparecen presupuestos con un
-- estado antiguo que haya que mapear a los nuevos, lo hacemos con el valor
-- real una vez lo confirmemos.

alter table public.quotes
  add column if not exists document_url text,
  add column if not exists rejection_reason text;
