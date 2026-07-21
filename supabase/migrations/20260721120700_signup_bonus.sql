-- Dos cosas en cuanto alguien se registra, automáticas y sin depender de que
-- el navegador del cliente llegue a ejecutar el código correspondiente
-- (cubre también altas futuras desde otro cliente, no solo la web actual):
--   1. Sincroniza email/nombre en "profiles" (antes decidimos no duplicar el
--      email ahí, pero el panel admin lo necesita para identificar clientes
--      sin usar la service_role key en el navegador).
--   2. Da un bono de bienvenida de 200 WynPoints.
--
-- Se dispara en auth.users porque ahí es donde Supabase Auth crea la fila
-- real en cuanto alguien completa el registro.

alter table public.profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  amount_col text;
  desc_col text;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do update set email = excluded.email;

  -- "wynpoints_transactions" es una tabla que ya existía en tu proyecto antes
  -- de que empezáramos: no sabemos con certeza si la columna de puntos se
  -- llama "amount" o "points" (la migración base fue defensiva porque nunca
  -- pudimos confirmarlo del todo), así que se detecta en tiempo de ejecución
  -- en vez de asumir un nombre fijo.
  select column_name into amount_col
  from information_schema.columns
  where table_schema = 'public' and table_name = 'wynpoints_transactions'
    and column_name in ('amount', 'points')
  order by (column_name = 'amount') desc
  limit 1;

  select column_name into desc_col
  from information_schema.columns
  where table_schema = 'public' and table_name = 'wynpoints_transactions'
    and column_name in ('description', 'transaction_type', 'reason')
  limit 1;

  if amount_col is not null then
    if desc_col is not null then
      execute format(
        'insert into public.wynpoints_transactions (user_id, %I, %I) values ($1, $2, $3)',
        amount_col, desc_col
      ) using new.id, 200, 'Bono de bienvenida';
    else
      execute format(
        'insert into public.wynpoints_transactions (user_id, %I) values ($1, $2)',
        amount_col
      ) using new.id, 200;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
