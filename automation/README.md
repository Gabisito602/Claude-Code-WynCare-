# Worker de tarificación real

Automatiza el paso de "cliente registrado sube su documentación → precio
real de la aseguradora", para sustituir la estimación de la calculadora
por la tarifa de verdad una vez el cliente se registra.

## Estado actual

- **`extract_document.py`** — funcional y probado. Lee un PDF con texto
  (no una foto/escaneo todavía) y extrae matrícula, marca, modelo,
  potencia, código postal, etc. Ver `requirements.txt`.
- **`rating_worker.js`** — esqueleto funcional en la parte de
  orquestación (lee `rating_jobs` pendientes, marca su estado, guarda el
  resultado en `quotes`), pero **la parte que entra en el portal real de
  la aseguradora está sin terminar a propósito** (`loginToInsurerPortal`
  y `rateOnInsurerPortal` tienen TODOs) porque depende de un portal
  concreto que no se ha indicado todavía.
- La tabla `rating_jobs` (migración `20260723100000_rating_jobs.sql`) ya
  existe en Supabase con sus políticas RLS.

## Por qué esto NO puede correr en una sesión de Claude Code

Tiene que ser un proceso persistente en un servidor propio (VPS,
contenedor con cron, etc.), porque:
- Cada sesión de Claude Code se destruye al terminar — no hay "always on".
- Las credenciales del portal viven como variables de entorno de ESE
  servidor (ver `.env.example`), nunca en un chat ni en este repo.

## Qué falta para que funcione de verdad

1. **URL y credenciales del portal del agente** de la aseguradora (en
   `.env`, nunca en el repo — `.env` ya está en `.gitignore`).
2. **Rellenar los TODOs de `rating_worker.js`**: los selectores reales del
   formulario de login, el flujo de navegación hasta el formulario de
   tarificación, el mapeo de cada campo de `extracted_data` a su campo
   real del formulario, y el selector de la página donde aparece el
   precio final. Esto requiere ver el portal real (aunque sea con una
   grabación de pantalla o acceso de prueba) para escribir los selectores
   correctos.
3. **Dónde vive el worker**: un VPS pequeño, un contenedor con cron, o un
   servicio gestionado — pendiente de decidir según el volumen esperado.
4. **Disparo**: hoy hay que ejecutar `node rating_worker.js` a mano; en
   producción necesita un cron (revisa `rating_jobs` pendientes cada
   X minutos) o un webhook desde Supabase cuando se crea un job nuevo.

## Cómo probarlo hoy (sin portal real)

```bash
cd automation
pip install -r requirements.txt   # o usa un venv si tu Python del sistema
                                   # tiene conflictos (ver más abajo)
python3 extract_document.py ruta/a/un/documento.pdf

npm install
cp .env.example .env   # rellena SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
node rating_worker.js  # leerá jobs pendientes; fallará en rateOnInsurerPortal
                        # hasta que se rellenen los TODOs con el portal real
```

Si tu Python del sistema da un error de `cffi`/`cryptography` al instalar
`pdfplumber`, usa un entorno virtual:
```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
venv/bin/python3 extract_document.py ruta/a/un/documento.pdf
```
