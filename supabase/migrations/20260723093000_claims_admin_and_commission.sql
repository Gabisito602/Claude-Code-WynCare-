-- Dos columnas pequeñas para dos huecos detectados en la auditoría de
-- producto: "Siniestros" no tenía forma de guardar un motivo de rechazo
-- desde el admin (la RLS ya dejaba a los admins actualizar "claims", solo
-- faltaba dónde guardar el motivo), y "policies" no registraba ninguna
-- comisión, así que la pestaña "Comisiones" del admin era pura maqueta.

alter table public.claims add column if not exists resolution_note text;

-- Tasa provisional por tipo de seguro (configurada a mano por ahora, no
-- automatizada con ninguna aseguradora todavía) — ver comentario junto a
-- COMMISSION_RATE en wyncare-admin.html para el valor exacto por tipo.
alter table public.policies add column if not exists commission_amount numeric;
