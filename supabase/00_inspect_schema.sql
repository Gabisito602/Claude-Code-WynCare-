-- Ejecuta esto en el SQL Editor de Supabase (Project > SQL Editor > New query)
-- y pásame el resultado (cópialo y pégalo aquí en el chat).
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
