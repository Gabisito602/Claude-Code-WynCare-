# Claude-Code-WynCare-
WynCare AI

Código fuente de wyncare.es (SPA estática servida vía Apache/.htaccess):

- `index.html` — landing page + app principal (SPA con routing por hash).
- `app.js` — lógica de la app: auth, pólizas, WynPoints, panel de admin, integración con Supabase.
- `wyncare-admin.html` — vista/panel de administración.
- `.htaccess` — reglas de reescritura (SPA routing) y cache-control.

> ⚠️ **Pendiente de seguridad**: `app.js` contiene la clave `SUPABASE_SERVICE_ROLE` embebida en cliente, usada como fallback en `adminFetch()`. Esa clave salta las reglas RLS de Supabase y debe rotarse en el panel de Supabase y moverse a una función servidora (no en JS de cliente) antes de seguir desplegando.

