-- Descubrimos al aplicar la migración anterior que "quotes.status" en tu
-- proyecto real ya es un tipo enum (quote_status), no texto libre como
-- asumimos al escribir la migración base. Un enum no admite valores nuevos
-- con un simple "check constraint": hay que añadirlos al propio tipo.
--
-- Esto solo AÑADE valores nuevos al enum que ya tenías — no toca ni elimina
-- ninguno de los que ya existan (por ejemplo "pending", si ese era el
-- inicial). "add value if not exists" hace que sea seguro reaplicar esto.
--
-- Envuelto en un "if exists": en un proyecto nuevo donde nadie hubiera
-- creado antes el tipo "quote_status", la migración base (que sí puede
-- correr aquí) crea "status" como texto plano, y este archivo no tendría
-- nada que hacer — sin esto, fallaría con "el tipo no existe".
--
-- Importante: estos valores no se pueden USAR (en un WHERE, un UPDATE, etc.)
-- dentro de esta misma migración/transacción — por eso el UPDATE que migra
-- filas antiguas va en el siguiente archivo, no en este.
do $$
begin
  if exists (select 1 from pg_type where typname = 'quote_status' and typnamespace = 'public'::regnamespace) then
    execute 'alter type public.quote_status add value if not exists ''pending_docs''';
    execute 'alter type public.quote_status add value if not exists ''in_review''';
    execute 'alter type public.quote_status add value if not exists ''validated''';
    execute 'alter type public.quote_status add value if not exists ''rejected''';
  end if;
end $$;
