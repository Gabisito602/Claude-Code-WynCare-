/*
 * Worker de tarificación real: recoge "rating_jobs" pendientes (creados
 * cuando un cliente registrado sube su documentación o rellena los datos
 * a mano), automatiza el portal del agente en la aseguradora con esos
 * datos, y escribe de vuelta el precio real.
 *
 * ESTO NO CORRE EN EL NAVEGADOR DEL CLIENTE NI EN UNA SESIÓN DE CLAUDE
 * CODE: es un proceso que tiene que vivir en un servidor propio (VPS,
 * contenedor programado, etc.), corriendo periódicamente (cron) o
 * disparado por un webhook cuando se crea un job nuevo.
 *
 * Las partes marcadas con TODO dependen del portal concreto de la
 * aseguradora (selectores, flujo, formato del formulario) — no se pueden
 * rellenar sin conocer ese portal real. El resto (leer jobs, marcar
 * estados, guardar el resultado) ya es funcional.
 *
 * Uso: node rating_worker.js   (lee las variables de .env, ver .env.example)
 */
require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INSURER_PORTAL_URL = process.env.INSURER_PORTAL_URL;
const INSURER_USER = process.env.INSURER_USER;
const INSURER_PASS = process.env.INSURER_PASS;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno (ver .env.example).');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Login en el portal del agente. TODO: sustituir los selectores por los
// reales del portal de la aseguradora (hoy son un placeholder).
async function loginToInsurerPortal(page) {
  if (!INSURER_PORTAL_URL || !INSURER_USER || !INSURER_PASS) {
    throw new Error('Faltan las credenciales del portal de la aseguradora (INSURER_PORTAL_URL/USER/PASS).');
  }
  await page.goto(INSURER_PORTAL_URL);
  // TODO: selectores reales de usuario/contraseña/botón de acceso.
  await page.fill('#usuario', INSURER_USER);
  await page.fill('#password', INSURER_PASS);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
}

// Rellena el formulario de tarificación con los datos extraídos del
// documento (o introducidos a mano) y devuelve el precio real.
// TODO: navegación al formulario correcto, mapeo de cada campo de
// job.extracted_data a su selector real, y selector del precio resultante.
async function rateOnInsurerPortal(page, job) {
  const data = job.extracted_data || {};
  // Ejemplo de mapeo (ajustar a los campos/selectores reales del portal):
  // await page.fill('#matricula', data.matricula || '');
  // await page.fill('#marca', data.marca || '');
  // await page.fill('#modelo', data.modelo || '');
  // await page.fill('#potencia', data.potencia_kw || '');
  // await page.fill('#cp', data.codigo_postal || '');
  // await page.click('#calcular');
  // await page.waitForSelector('#precio-resultado');
  // const priceText = await page.textContent('#precio-resultado');
  // return parseFloat(priceText.replace(/[^\d,.-]/g, '').replace(',', '.'));
  throw new Error('rateOnInsurerPortal: pendiente de implementar con el portal real de ' + job.insurer);
}

async function processJob(job) {
  console.log('Procesando job', job.id, '(' + job.insurer + ')');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await loginToInsurerPortal(page);
    const realPremium = await rateOnInsurerPortal(page, job);

    await sb.from('rating_jobs').update({
      status: 'done', real_premium: realPremium, updated_at: new Date().toISOString()
    }).eq('id', job.id);
    await sb.from('quotes').update({ premium: realPremium }).eq('id', job.quote_id);
    console.log('Job', job.id, 'completado. Precio real:', realPremium);
  } catch (err) {
    console.error('Job', job.id, 'ha fallado:', err.message);
    await sb.from('rating_jobs').update({
      status: 'failed', error_message: err.message, updated_at: new Date().toISOString()
    }).eq('id', job.id);
  } finally {
    await browser.close();
  }
}

async function main() {
  const { data: jobs, error } = await sb.from('rating_jobs').select('*').eq('status', 'pending').limit(5);
  if (error) { console.error('Error leyendo rating_jobs:', error.message); process.exit(1); }
  if (!jobs.length) { console.log('No hay jobs pendientes.'); return; }

  for (const job of jobs) {
    await sb.from('rating_jobs').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', job.id);
    await processJob(job);
  }
}

main().catch(function(err) { console.error('Fallo general del worker:', err); process.exit(1); });
