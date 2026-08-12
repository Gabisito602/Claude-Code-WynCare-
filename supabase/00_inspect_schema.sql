-- Diagnóstico opcional (no es una migración, no hay que ponerlo en
-- supabase/migrations/). Las migraciones ya están escritas para no chocar
-- con lo que exista, pero si algo falla al aplicarse, corre esto en el SQL
-- Editor de Supabase (Project > SQL Editor > New query) y pásame el
-- resultado — así veo exactamente qué tienes y ajusto la migración.
-- Solo lee metadatos, no toca ningún dato.

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'policies', 'quotes', 'wynpoints_transactions')
order by table_name, ordinal_position;

-- Y esto para ver si RLS ya está activado y qué políticas existen:
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'policies', 'quotes', 'wynpoints_transactions');

select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public';
