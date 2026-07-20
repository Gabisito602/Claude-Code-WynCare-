# Claude-Code-WynCare-
WynCare AI

Código fuente de wyncare.es (SPA estática servida vía Apache/.htaccess):

- `styles.css` — **sistema de diseño compartido** (tokens de marca, reset, botones, badges, utilidades premium). Lo cargan las dos páginas con `styles.css?v=N`; cualquier cambio de marca (colores, radios, tipografías) se hace SOLO aquí. Cada HTML conserva un `<style>` con lo específico de esa página.
- `index.html` — landing page + app principal (SPA con routing por hash).
- `app.js` — lógica de la app: auth, pólizas, WynPoints, panel de admin, integración con Supabase. Cargado con `?v=N` para cache busting: **al modificarlo, sube la versión en el `<script>` de index.html**.
- `wyncare-admin.html` — panel de administración standalone (accesible como `/admin`, con `noindex`). Datos mock en el objeto `D` al final del script.
- `.htaccess` — SPA routing, cache-control y cabeceras de seguridad.
- `og.png` / `apple-touch-icon.png` — imagen para compartir en redes/WhatsApp e icono iOS.
- `robots.txt` / `sitemap.xml` — SEO; `/admin` excluido del rastreo.

Notas de seguridad:
- La clave `service_role` de Supabase **nunca** debe estar en el código de cliente (se eliminó y la clave expuesta fue rotada). Las operaciones que la necesiten van en una Edge Function.
- Todo dato de Supabase/usuario que se pinte con `innerHTML` debe pasar por el helper `esc()` (ya aplicado en `app.js` y en el renderer de tablas del admin).

