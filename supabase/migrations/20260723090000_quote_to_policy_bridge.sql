-- Hasta ahora, cuando un admin marcaba un presupuesto como "Validado" en
-- wyncare-admin.html, solo se actualizaba la fila de "quotes" — no existía
-- ningún camino (ni manual ni automático) que creara la póliza real
-- correspondiente. "policies" solo se leía en toda la app, nunca se
-- escribía desde la UI. Esto cierra ese hueco:

-- 1) Traza qué cotización originó cada póliza, y sirve para no crear la
--    misma póliza dos veces si un admin repite la validación.
alter table public.policies add column if not exists quote_id uuid references public.quotes(id);

-- 2) RLS de "policies" solo tenía "select"/"update" para admins (ver
--    20260721120300_admin_role.sql) — faltaba el "insert" que ahora
--    necesita el panel admin para crear la póliza al validar.
drop policy if exists "admins crean pólizas" on public.policies;
create policy "admins crean pólizas" on public.policies
  for insert with check (public.is_admin());
