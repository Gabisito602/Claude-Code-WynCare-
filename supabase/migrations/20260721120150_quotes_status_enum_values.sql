-- Descubrimos al aplicar la migración anterior que "quotes.status" en tu
-- proyecto real ya es un tipo enum (quote_status), no texto libre como
-- asumimos al escribir la migración base. Un enum no admite valores nuevos
-- con un simple "check constraint": hay que añadirlos al propio tipo.
--
-- Esto solo AÑADE valores nuevos al enum que ya tenías — no toca ni elimina
-- ninguno de los que ya existan (por ejemplo "pending", si ese era el
-- inicial). "add value if not exists" hace que sea seguro reaplicar esto.
--
-- Importante: estos valores no se pueden USAR (en un WHERE, un UPDATE, etc.)
-- dentro de esta misma migración/transacción — por eso el UPDATE que migra
-- filas antiguas va en el siguiente archivo, no en este.
alter type public.quote_status add value if not exists 'pending_docs';
alter type public.quote_status add value if not exists 'in_review';
alter type public.quote_status add value if not exists 'validated';
alter type public.quote_status add value if not exists 'rejected';
