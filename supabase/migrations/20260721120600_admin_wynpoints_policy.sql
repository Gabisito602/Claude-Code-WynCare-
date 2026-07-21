-- El panel admin necesita ver los movimientos de WynPoints de TODOS los
-- clientes (sección "WynPoints" y el total de puntos que se muestra en
-- "Clientes"), no solo los suyos propios como permitía la política anterior.
drop policy if exists "admins ven todas las transacciones de wynpoints" on public.wynpoints_transactions;
create policy "admins ven todas las transacciones de wynpoints" on public.wynpoints_transactions
  for select using (public.is_admin());
