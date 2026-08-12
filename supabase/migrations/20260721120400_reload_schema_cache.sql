-- Las migraciones anteriores se aplicaron directo por SQL ("supabase db
-- push" vía el Action), sin pasar por el dashboard de Supabase — así que
-- PostgREST (la capa que usa el cliente JS de la web para hablar con la
-- base de datos) se quedó con una caché del esquema desactualizada. Por
-- eso la app decía "no encuentro la columna form_data" aunque sí existe:
-- no es que falte, es que PostgREST no se había enterado todavía.
--
-- Esto le pide que la recargue. Es solo una señal, no cambia ningún dato
-- ni estructura — seguro reaplicarlo si hiciera falta.
notify pgrst, 'reload schema';
