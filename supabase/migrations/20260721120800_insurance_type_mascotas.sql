-- La calculadora ahora incluye "Mascotas" como vertical. En tu proyecto real
-- "quotes.type" es un enum (insurance_type) con los tipos que existían al
-- principio (coche/hogar/salud/vida/empresa/telemedicina), así que guardar un
-- presupuesto de mascotas desde el Área Cliente fallaría con "invalid input
-- value for enum" hasta añadir el valor al propio tipo.
--
-- Mismo patrón que ya validamos para los estados de presupuesto: "add value if
-- not exists" es idempotente, y va dentro de un "if exists" por si en algún
-- entorno "type" fuera texto plano (entonces no hay enum que tocar y acepta
-- cualquier valor igualmente). No se puede USAR el valor nuevo en la misma
-- transacción, pero aquí solo lo añadimos.
do $$
begin
  if exists (select 1 from pg_type where typname = 'insurance_type' and typnamespace = 'public'::regnamespace) then
    execute 'alter type public.insurance_type add value if not exists ''mascotas''';
  end if;
end $$;
