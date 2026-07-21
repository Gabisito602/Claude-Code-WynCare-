/* ============================================================
   WynCare app.js v1 — Rediseño completo con Supabase
   ============================================================ */

/* ---------- CONFIG ---------- */
const SUPABASE_URL = 'https://gpcavoymhsivyorkxbam.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwY2F2b3ltaHNpdnlvcmt4YmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxNDcwNTUsImV4cCI6MjA5OTcyMzA1NX0.XA5GglnK6gn82HvV3CL7J2xzkQsGqFuRbhvG-yFERDU';
// La clave service_role NUNCA debe estar en código de cliente: cualquier visitante
// puede leerla y saltarse las políticas RLS. Las operaciones de admin que la
// necesiten deben vivir en una Edge Function de Supabase.
const ADMIN_EMAILS = ['admin@wyncare.es', 'gabriiel.calvo88@gmail.com', 'alex@wyncare.com'];

/* ---------- SUPABASE CLIENT (con red de seguridad) ---------- */
// Si el CDN de Supabase no llega a cargar (red lenta, ad-blocker, firewall
// corporativo, jsdelivr caído...), esta línea lanzaba una excepción que
// paraba TODO el script justo aquí, al principio — incluido el código que
// más abajo hace visibles las secciones de la landing (.reveal) y activa
// el menú móvil, el conmutador de tema, etc. Resultado: página casi en
// blanco. Con el cliente de repuesto, cada llamada falla con un error
// normal (que el código ya captura con try/catch) en vez de reventar.
function offlineSupabaseClient() {
  var err = { message: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.' };
  var chain = {
    then: function(resolve) { return Promise.resolve(resolve({ data: null, error: err })); },
    catch: function() { return chain; },
    single: function() { return Promise.resolve({ data: null, error: err }); },
    eq: function() { return chain; },
    select: function() { return chain; },
    limit: function() { return chain; },
    upsert: function() { return Promise.resolve({ data: null, error: err }); },
    update: function() { return chain; },
    // Encadenable (igual que "chain") para que ".insert(x).select().single()"
    // funcione igual que con el cliente real, no solo ".insert(x)" a secas.
    insert: function() { return chain; }
  };
  return {
    auth: {
      signInWithPassword: function() { return Promise.resolve({ data: null, error: err }); },
      signUp: function() { return Promise.resolve({ data: null, error: err }); },
      signOut: function() { return Promise.resolve({ error: null }); },
      getSession: function() { return Promise.resolve({ data: { session: null } }); },
      resetPasswordForEmail: function() { return Promise.resolve({ error: err }); }
    },
    from: function() { return chain; }
  };
}
// OJO: la variable NO puede llamarse "supabase" — la propia librería del CDN
// declara una variable global con ese mismo nombre, y un const/let que choque
// con una declaración global existente es un SyntaxError (para todo el script,
// antes incluso de ejecutar una sola línea). Por eso se llama "sb".
const sb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { autoRefreshToken: true, persistSession: true, storageKey: 'wyncare-auth', flowType: 'pkce' }
    })
  : offlineSupabaseClient();

/* ---------- STATE ---------- */
let currentUser = null;
let currentProfile = null;
let currentPolicies = [];
let currentPolicyDocuments = [];
let selectedQuote = { name: 'Coche', price: 35, pts: 700, cov: 'Cobertura completa coche' };
let quoteCalcWidget = null;

/* ---------- PRESUPUESTOS: estados del ciclo de validación ---------- */
// pending_docs -> in_review -> validated (o, en cualquier momento, rejected).
// El admin sube el PDF final y cambia el estado desde el panel; document_url
// y rejection_reason todavía no existen en la tabla "quotes" real — llegan
// con supabase/02_quotes_status_and_documents.sql cuando retomemos Supabase.
const QUOTE_STATUS_STEPS = ['pending_docs', 'in_review', 'validated'];
const QUOTE_STATUS_LABELS = { pending_docs: 'Documentación', in_review: 'Verificación', validated: 'Validado' };

function renderQuoteStatus(status) {
  if (status === 'rejected') return null;
  var idx = QUOTE_STATUS_STEPS.indexOf(status);
  if (idx < 0) idx = 0;
  return '<div class="tier-track quote-track">' + QUOTE_STATUS_STEPS.map(function(key, i) {
    var cls = i < idx ? 'done' : (i === idx ? 'done current' : '');
    var dot = i < idx ? '<svg class="icon" style="width:13px;height:13px"><use href="#i-check"/></svg>' : String(i + 1);
    return '<div class="tier-step ' + cls + '"><div class="tier-dot">' + dot + '</div><div class="tn">' + QUOTE_STATUS_LABELS[key] + '</div></div>';
  }).join('') + '</div>';
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// La tabla "quotes" real no tiene columna "reference" — la calculamos a
// partir del id para tener algo corto y legible que mostrar.
function friendlyRef(prefix, id) { return prefix + '-' + String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase(); }

function renderQuoteCard(q) {
  var fd = q.form_data || {};
  var icon = getPolicyIcon(q.type);
  var dateLabel = q.created_at ? new Date(q.created_at).toLocaleDateString('es-ES') : '';
  var body;
  if (q.status === 'rejected') {
    body = '<div class="quote-rejected"><svg class="icon"><use href="#i-alert"/></svg><span>' +
      esc(q.rejection_reason || 'Presupuesto rechazado. Contacta con soporte para más información.') + '</span></div>';
  } else {
    body = renderQuoteStatus(q.status);
    if (q.status === 'validated') {
      body += '<div class="quote-card-foot">' + (q.document_url
        ? '<a class="btn btn-primary btn-block" href="' + esc(q.document_url) + '" target="_blank" rel="noopener">Descargar presupuesto</a>'
        : '<p class="quote-doc-pending">Documento en preparación — te avisaremos en cuanto esté listo.</p>') + '</div>';
    }
  }
  return '<div class="quote-card"><div class="quote-card-head"><span class="ic"><svg class="icon"><use href="#' + icon + '"/></svg></span>' +
    '<div class="info"><div class="nm">' + esc(capitalize(q.type) || 'Seguro') + '</div><div class="ref">' + esc(friendlyRef('PR', q.id)) + (dateLabel ? ' · ' + dateLabel : '') + '</div></div>' +
    '<div class="pr">' + formatCurrency(parseFloat(q.premium || 0)) + '€/mes</div></div>' + body + '</div>';
}

async function updateQuotesList() {
  var panel = $('quotesList');
  if (!panel || !currentUser) return;
  var emptyHtml = '<div class="empty-block"><svg class="icon"><use href="#i-inbox"/></svg><p>Todavía no has guardado ningún presupuesto. Usa "Nueva cotización" para pedir el primero.</p></div>';
  try {
    var { data, error } = await sb.from('quotes').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if (error) throw error;
    var quotes = data || [];
    panel.innerHTML = quotes.length ? quotes.map(renderQuoteCard).join('') : emptyHtml;
  } catch (err) {
    panel.innerHTML = emptyHtml;
  }
}

function initQuotesViewToggle() {
  var toggle = $('quotesViewToggle');
  if (!toggle) return;
  toggle.addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    qsa('button', toggle).forEach(function(b) { b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    var isMis = btn.dataset.view === 'mis';
    $('quotesNewView').style.display = isMis ? 'none' : '';
    $('quotesListView').style.display = isMis ? '' : 'none';
    if (isMis) updateQuotesList();
  });
  var viewMyQuotesBtn = $('viewMyQuotesBtn');
  if (viewMyQuotesBtn) viewMyQuotesBtn.addEventListener('click', function() {
    var misBtn = toggle.querySelector('[data-view="mis"]');
    if (misBtn) misBtn.click();
  });
}

/* ---------- CALCULADORA: preguntas y precios por tipo de seguro ---------- */
// Precios y puntos "base" (nivel Estándar, primera opción de cada pregunta).
// El precio final es orientativo: base x nivel x cada respuesta. La aseguradora
// valida el precio real una vez el cliente crea su cuenta y envía la cotización.
// "postal: true" activa el campo de código postal (solo Coche y Hogar): es
// opcional y solo afina el PRECIO por zona, nunca los WynPoints. Telemedicina
// ya no está aquí: es una ventaja de WynCare+ que se contrata aparte, no un
// seguro que se compare en este widget.
const CALC_TYPES = {
  Coche: { cov: 'Cobertura completa coche', base: 35, pts: 700, postal: true, questions: [
    { key: 'vehiculo', label: 'Tipo de vehículo', options: [
      { label: 'Turismo', mult: 1 },
      { label: 'Moto', mult: 0.8 },
      { label: 'Furgoneta', mult: 1.2 }
    ]},
    { key: 'uso', label: 'Uso', options: [
      { label: 'Particular', mult: 1 },
      { label: 'Profesional (VTC, reparto...)', mult: 1.35 }
    ]},
    { key: 'carne', label: 'Antigüedad del carné', options: [
      { label: '+5 años', mult: 1 },
      { label: '2-5 años', mult: 1.15 },
      { label: 'Menos de 2 años', mult: 1.4 }
    ]}
  ]},
  Hogar: { cov: 'Cobertura completa hogar', base: 22, pts: 600, postal: true, questions: [
    { key: 'vivienda', label: 'Tipo de vivienda', options: [
      { label: 'Piso', mult: 1 },
      { label: 'Casa / chalet', mult: 1.25 }
    ]},
    { key: 'regimen', label: 'Régimen', options: [
      { label: 'Propietario', mult: 1 },
      { label: 'Inquilino', mult: 0.85 }
    ]}
  ]},
  Salud: { cov: 'Cobertura completa salud', base: 45, pts: 1500, questions: [
    { key: 'personas', label: 'Nº de personas', options: [
      { label: 'Solo yo', mult: 1 },
      { label: 'Pareja', mult: 1.7 },
      { label: 'Familia (3+)', mult: 2.6 }
    ]},
    { key: 'edad', label: 'Edad del asegurado principal', options: [
      { label: 'Hasta 35', mult: 1 },
      { label: '36-55', mult: 1.15 },
      { label: '+55', mult: 1.45 }
    ]},
    { key: 'copago', label: 'Copago', options: [
      { label: 'Con copago', mult: 0.85 },
      { label: 'Sin copago', mult: 1.15 }
    ]}
  ]},
  Vida: { cov: 'Cobertura completa vida', base: 15, pts: 2500, questions: [
    { key: 'edad', label: 'Edad', options: [
      { label: 'Hasta 35', mult: 1 },
      { label: '36-50', mult: 1.4 },
      { label: '+50', mult: 2 }
    ]},
    { key: 'capital', label: 'Capital asegurado', options: [
      { label: '50.000€', mult: 1 },
      { label: '100.000€', mult: 1.6 },
      { label: '+200.000€', mult: 2.4 }
    ]},
    { key: 'fumador', label: '¿Fumador?', options: [
      { label: 'No', mult: 1 },
      { label: 'Sí', mult: 1.4 }
    ]}
  ]},
  Empresa: { cov: 'Cobertura completa empresa', base: 80, pts: 3500, questions: [
    { key: 'sector', label: 'Sector', options: [
      { label: 'Comercio', mult: 1 },
      { label: 'Oficina', mult: 0.9 },
      { label: 'Hostelería', mult: 1.35 },
      { label: 'Otro', mult: 1.1 }
    ]},
    { key: 'empleados', label: 'Nº de empleados', options: [
      { label: '1-5', mult: 1 },
      { label: '6-20', mult: 1.8 },
      { label: '+20', mult: 3 }
    ]}
  ]},
  Mascotas: { cov: 'Cobertura completa mascotas', base: 10, pts: 300, questions: [
    { key: 'tipo', label: 'Tipo de mascota', options: [
      { label: 'Perro', mult: 1 },
      { label: 'Gato', mult: 0.85 },
      { label: 'Otro', mult: 0.9 }
    ]},
    { key: 'edad', label: 'Edad', options: [
      { label: 'Cachorro (-1 año)', mult: 0.9 },
      { label: 'Adulto (1-7)', mult: 1 },
      { label: 'Senior (+7)', mult: 1.4 }
    ]},
    { key: 'rc', label: 'Responsabilidad civil', options: [
      { label: 'Sin RC', mult: 1 },
      { label: 'Con RC', mult: 1.2 }
    ]}
  ]}
};
const CALC_LEVEL_MULT = { 'Básica': 0.8, 'Estándar': 1, 'Completa': 1.3 };

// Multiplicador regional orientativo a partir del código postal español (los
// 2 primeros dígitos = provincia). Solo afecta al precio de Coche/Hogar y solo
// si se introduce un CP; vacío o inválido => 1 (sin efecto). Es una estimación
// para la demo: la aseguradora calcula la tarifa real al validar.
function calcRegionalMult(cp) {
  var digits = String(cp || '').replace(/\D/g, '');
  if (digits.length < 2) return 1;
  var prov = parseInt(digits.slice(0, 2), 10);
  if (prov < 1 || prov > 52) return 1;
  var alta = [28, 8, 41, 46, 48, 29, 7]; // Madrid, Barcelona, Sevilla, Valencia, Bizkaia, Málaga, Balears
  var baja = [42, 44, 40, 34, 5, 49, 16, 19]; // Soria, Teruel, Segovia, Palencia, Ávila, Zamora, Cuenca, Guadalajara
  if (alta.indexOf(prov) > -1) return 1.12;
  if (baja.indexOf(prov) > -1) return 0.9;
  return 1;
}

// Motor compartido por la calculadora de la landing y "Cotizar seguro" del
// Área Cliente: mismo tipo, mismas preguntas, mismo cálculo de precio — así
// lo que el visitante rellena sin cuenta se traslada tal cual al presupuesto
// que sí queda guardado y pendiente de validación.
function initCalcWidget(opts) {
  var typesEl = opts.typesEl, questionsEl = opts.questionsEl, levelsEl = opts.levelsEl;
  if (!typesEl || !questionsEl || !levelsEl) return null;
  var postalWrap = opts.postalWrap || null;
  var postalInput = postalWrap ? postalWrap.querySelector('input') : null;
  var whyEl = opts.whyEl || null;

  function defaultAnswers(type) {
    var a = {};
    CALC_TYPES[type].questions.forEach(function(q) { a[q.key] = { label: q.options[0].label, mult: q.options[0].mult }; });
    return a;
  }

  var state = { type: 'Coche', level: 'Estándar', answers: defaultAnswers('Coche'), postal: '' };

  function syncPostal() {
    if (!postalWrap) return;
    postalWrap.style.display = CALC_TYPES[state.type].postal ? '' : 'none';
  }

  function renderQuestions() {
    var cfg = CALC_TYPES[state.type];
    questionsEl.innerHTML = cfg.questions.map(function(q) {
      var opts = q.options.map(function(o) {
        var pressed = state.answers[q.key].label === o.label;
        return '<button class="calc-level" type="button" data-mult="' + o.mult + '" aria-pressed="' + pressed + '">' + esc(o.label) + '</button>';
      }).join('');
      return '<div class="calc-field"><div class="calc-field-label">' + esc(q.label) + '</div><div class="calc-qopts" data-qkey="' + q.key + '">' + opts + '</div></div>';
    }).join('');
    syncPostal();
  }

  function render() {
    var cfg = CALC_TYPES[state.type];
    // El nivel y las respuestas mueven precio Y puntos; el código postal solo
    // afina el precio (por eso pts se calcula antes de aplicar el regional).
    var baseMult = CALC_LEVEL_MULT[state.level];
    Object.keys(state.answers).forEach(function(k) { baseMult *= state.answers[k].mult; });
    var pts = Math.round(cfg.pts * baseMult);
    var regional = cfg.postal ? calcRegionalMult(state.postal) : 1;
    var price = cfg.base * baseMult * regional;
    opts.priceEl.textContent = formatCurrency(price) + '€';
    if (opts.ptsEl) opts.ptsEl.textContent = pts.toLocaleString();
    var detail = cfg.questions.map(function(q) { return state.answers[q.key].label; }).join(' · ');
    if (whyEl) whyEl.innerHTML = '<span class="cw-q">¿Por qué este precio?</span> ' + esc(detail.toLowerCase() + ' · cobertura ' + state.level.toLowerCase());
    if (opts.onChange) opts.onChange({
      type: state.type, level: state.level, answers: state.answers, postal: state.postal, price: price, pts: pts,
      cov: cfg.cov, covDetailed: cfg.cov + ' · Nivel ' + state.level + ' · ' + detail
    });
  }

  typesEl.addEventListener('click', function(e) {
    var btn = e.target.closest('.type-card');
    if (!btn) return;
    var name = btn.dataset.type || btn.dataset.name;
    if (!CALC_TYPES[name]) return;
    qsa('.type-card', typesEl).forEach(function(b) { b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    state.type = name;
    state.answers = defaultAnswers(name);
    renderQuestions();
    render();
  });

  levelsEl.addEventListener('click', function(e) {
    var btn = e.target.closest('.calc-level');
    if (!btn) return;
    qsa('.calc-level', levelsEl).forEach(function(b) { b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    state.level = btn.dataset.level;
    render();
  });

  questionsEl.addEventListener('click', function(e) {
    var btn = e.target.closest('.calc-level');
    if (!btn) return;
    var group = btn.closest('.calc-qopts');
    if (!group) return;
    qsa('.calc-level', group).forEach(function(b) { b.setAttribute('aria-pressed', 'false'); });
    btn.setAttribute('aria-pressed', 'true');
    state.answers[group.dataset.qkey] = { label: btn.textContent, mult: parseFloat(btn.dataset.mult) };
    render();
  });

  if (postalInput) postalInput.addEventListener('input', function() {
    state.postal = postalInput.value;
    render();
  });

  renderQuestions();
  render();

  return {
    setState: function(partial) {
      if (partial.type && CALC_TYPES[partial.type]) {
        state.type = partial.type;
        state.answers = defaultAnswers(partial.type);
        qsa('.type-card', typesEl).forEach(function(b) {
          var n = b.dataset.type || b.dataset.name;
          b.setAttribute('aria-pressed', n === partial.type ? 'true' : 'false');
        });
        renderQuestions();
      }
      if (partial.level && CALC_LEVEL_MULT[partial.level]) {
        state.level = partial.level;
        qsa('.calc-level', levelsEl).forEach(function(b) { b.setAttribute('aria-pressed', b.dataset.level === partial.level ? 'true' : 'false'); });
      }
      if (partial.answers) {
        Object.keys(partial.answers).forEach(function(k) {
          if (state.answers.hasOwnProperty(k)) state.answers[k] = partial.answers[k];
        });
        qsa('.calc-qopts', questionsEl).forEach(function(group) {
          var key = group.dataset.qkey;
          if (!partial.answers.hasOwnProperty(key)) return;
          qsa('.calc-level', group).forEach(function(b) {
            b.setAttribute('aria-pressed', parseFloat(b.dataset.mult) === partial.answers[key].mult ? 'true' : 'false');
          });
        });
      }
      if (partial.postal !== undefined) {
        state.postal = partial.postal || '';
        if (postalInput) postalInput.value = state.postal;
      }
      syncPostal();
      render();
    }
  };
}

/* ---------- UTILS ---------- */
const $ = id => document.getElementById(id);
const qs = (sel, ctx) => (ctx || document).querySelector(sel);
const qsa = (sel, ctx) => (ctx || document).querySelectorAll(sel);

function formatCurrency(n) { return n.toFixed(2).replace('.', ','); }

// Escapa texto antes de interpolarlo en innerHTML — obligatorio para cualquier
// dato que venga de Supabase o del usuario (nombres, referencias, mensajes...).
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function formatEsNumber(n, decimals) {
  var fixed = n.toFixed(decimals || 0);
  var parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.join(',');
}

function getTier(points) {
  if (points >= 6000) return 'Oro';
  if (points >= 2000) return 'Plata';
  return 'Bronce';
}

function getPolicyIcon(type) {
  const m = { 'coche': 'i-car', 'hogar': 'i-home', 'salud': 'i-stethoscope', 'vida': 'i-life', 'empresa': 'i-building', 'mascotas': 'i-paw', 'telemedicina': 'i-pulse' };
  return m[(type || '').toLowerCase()] || 'i-shield';
}

/* ---------- VIEWS ---------- */
function showView(id) {
  qsa('.view, #view-app').forEach(v => v.classList.remove('is-active'));
  const el = $(id);
  if (el) { el.classList.add('is-active'); if (id === 'view-app') el.style.display = 'grid'; }
  window.scrollTo(0, 0);
}

function showAppTab(id) {
  qsa('.app-tab').forEach(t => t.classList.remove('is-active'));
  const tab = $(id);
  if (tab) tab.classList.add('is-active');
  qsa('.app-menu-item').forEach(item => {
    item.removeAttribute('aria-current');
    if ('tab-' + item.getAttribute('data-tab') === id) item.setAttribute('aria-current', 'page');
  });
  if (id === 'tab-presupuestos') applyLandingQuoteHandoff();
}

function applyLandingQuoteHandoff() {
  if (!quoteCalcWidget) return;
  try {
    var stored = JSON.parse(localStorage.getItem('wyncare_landing_quote') || 'null');
    if (stored && stored.type && CALC_TYPES[stored.type]) {
      quoteCalcWidget.setState(stored);
      localStorage.removeItem('wyncare_landing_quote');
    }
  } catch (e) {}
}

/* ---------- THEME ---------- */
function getTheme() { return localStorage.getItem('wyncare-theme') || 'dark'; }
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('wyncare-theme', t);
  const sw = $('settingsThemeSwitch');
  if (sw) sw.setAttribute('aria-checked', t === 'dark');
}
function toggleTheme() { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); }
document.addEventListener('click', e => { const btn = e.target.closest('[data-theme-toggle]'); if (btn) toggleTheme(); });

/* ---------- ROUTER ---------- */
const ROUTES = { '/': 'view-home', '/login': 'view-login', '/registro': 'view-registro', '/recuperar': 'view-recuperar', '/terminos': 'view-terminos', '/privacidad': 'view-privacidad', '/cookies': 'view-cookies', '/404': 'view-404' };

function navigate(hash) {
  const path = hash.replace(/^#/, '') || '/';
  const appMatch = path.match(/^\/app(?:\/(\w+))?/);
  if (appMatch) {
    if (!currentUser) { navigate('#/login'); return; }
    showView('view-app');
    showAppTab('tab-' + (appMatch[1] || 'resumen'));
    return;
  }
  if (ROUTES[path]) { showView(ROUTES[path]); return; }
  if (path === '/admin') {
    if (!currentUser) { navigate('#/login'); return; }
    if (!ADMIN_EMAILS.includes(currentUser.email)) { showView('view-404'); return; }
    loadAdminPanel();
    return;
  }
  showView('view-404');
}

window.addEventListener('hashchange', () => navigate(location.hash));
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#/"]');
  if (a) { e.preventDefault(); navigate(a.getAttribute('href')); }
  const anchor = e.target.closest('a[href^="#"]:not([href^="#/"])');
  if (anchor) { e.preventDefault(); const t = document.querySelector(anchor.getAttribute('href')); if (t) t.scrollIntoView({ behavior: 'smooth' }); }
});

/* ---------- AUTH ---------- */
async function handleLogin(email, password) {
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    await loadUserData();
    navigate('#/app');
  } catch (err) {
    alert('Error al iniciar sesión: ' + err.message);
  }
}

async function handleRegister(name, email, password) {
  try {
    // "options.data" queda en auth.users.raw_user_meta_data: lo lee el
    // trigger "handle_new_user" (ver supabase/migrations) para crear el
    // perfil y dar el bono de bienvenida en cuanto se registra, sin
    // depender de que este código del cliente llegue a ejecutarse.
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) throw error;
    if (data?.user) {
      // El trigger ya crea "profiles" al vuelo; este upsert es solo una
      // red de seguridad por si acaso (idempotente por "onConflict").
      await sb.from('profiles').upsert({
        id: data.user.id, full_name: name
      }, { onConflict: 'id' });
    }
    localStorage.setItem('wyncare_pending_confirmation', email);
    alert('Registro completado. Revisa tu correo para confirmar la cuenta.');
    navigate('#/login');
  } catch (err) {
    alert('Error al registrarse: ' + err.message);
  }
}

async function handleLogout() {
  await sb.auth.signOut();
  currentUser = null; currentProfile = null;
  document.documentElement.classList.remove('admin-mode');
  $('adminPanel')?.remove();
  navigate('#/');
}

async function loadUserSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      await loadUserData();
      const path = location.hash.replace(/^#/, '') || '/';
      if (path.startsWith('/app') || path === '/admin') navigate(location.hash);
    }
  } catch (err) { console.warn('Session load error:', err.message); }

}

async function loadUserData() {
  if (!currentUser) return;
  try {
    const { data: profile } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
    currentProfile = profile || { full_name: currentUser.email?.split('@')[0] || 'Usuario' };
    const { data: policies } = await sb.from('policies').select('*').eq('user_id', currentUser.id);
    currentPolicies = policies || [];
  } catch (err) {
    currentProfile = { full_name: currentUser.email?.split('@')[0] || 'Usuario' };
  }
  try {
    // "profiles" no guarda un total de WynPoints — el saldo es la suma de
    // los movimientos en "wynpoints_transactions" (positivos y negativos).
    const { data: transactions, error } = await sb.from('wynpoints_transactions').select('amount').eq('user_id', currentUser.id);
    if (error) throw error;
    currentProfile.wynpoints = (transactions || []).reduce((sum, t) => sum + (t.amount || 0), 0);
  } catch (err) {
    currentProfile.wynpoints = currentProfile.wynpoints || 0;
  }
  try {
    const policyIds = currentPolicies.map(p => p.id).filter(Boolean);
    if (policyIds.length) {
      const { data: docs, error } = await sb.from('policy_documents').select('*').in('policy_id', policyIds);
      if (error) throw error;
      currentPolicyDocuments = docs || [];
    } else {
      currentPolicyDocuments = [];
    }
  } catch (err) {
    currentPolicyDocuments = [];
  }
  updateSidebar();
  updateDashboard();
  updatePoliciesTab();
  updateWynpointsTab();
  updateSettings();
  updateClaimsTab();
  updateDocumentsTab();
  updateQuotesList();
}

/* ---------- DASHBOARD ---------- */
function updateSidebar() {
  const name = currentProfile?.full_name || currentUser?.email?.split('@')[0] || 'Usuario';
  const email = currentUser?.email || '';
  $('dAvatar').textContent = (name.charAt(0) || 'U').toUpperCase();
  $('dName').textContent = name;
  $('dMail').textContent = email;
}

function updateDashboard() {
  $('dGreetName').textContent = currentProfile?.full_name || 'Usuario';
  const active = currentPolicies.filter(p => p.status === 'active' || p.status === 'Activo');
  const monthly = active.reduce((s, p) => s + (parseFloat(p.premium) || 0), 0);
  const pts = currentProfile?.wynpoints || 0;

  const cards = qsa('.quick-card');
  if (cards.length >= 4) {
    cards[0].querySelector('.qn').textContent = active.length;
    cards[1].querySelector('.qn').textContent = formatCurrency(monthly) + '€';
    cards[2].querySelector('.qn').textContent = pts.toLocaleString();
    cards[3].querySelector('.qn').textContent = '0';
    cards[2].querySelector('.qt').textContent = 'Nivel ' + getTier(pts);
  }

  const dashPanel = qs('#tab-resumen .dash-panel:first-child');
  if (dashPanel) {
    const listEl = dashPanel.querySelector('.policy-list') || (() => {
      const d = document.createElement('div'); d.className = 'policy-list';
      const e = dashPanel.querySelector('.empty-block');
      if (e) e.replaceWith(d); else dashPanel.appendChild(d);
      return d;
    })();
    if (active.length === 0) {
      listEl.innerHTML = '<div class="empty-block"><svg class="icon"><use href="#i-inbox"/></svg><p>Todavía no tienes seguros activos. Cotiza el primero desde "Presupuestos".</p></div>';
    } else {
      listEl.innerHTML = active.slice(0, 4).map(p =>
        '<div class="policy-row"><span class="ic"><svg><use href="#' + getPolicyIcon(p.type || p.policy_type) + '"/></svg></span><div class="info"><div class="nm">' + esc(p.type || p.policy_type || 'Seguro') + '</div><div class="ref">' + esc(p.reference || '—') + '</div></div><span class="st active">Activo</span><span class="pr">' + parseFloat(p.premium || 0).toFixed(0) + '€/mes</span></div>'
      ).join('');
    }
  }

  if (currentUser) {
    const pEl = qs('.pass-points .pts');
    const lEl = qs('.pass-points .lbl');
    const hEl = qs('.pass-holder strong');
    if (pEl) pEl.textContent = pts.toLocaleString();
    if (lEl) lEl.textContent = 'WynPoints · ' + getTier(pts);
    if (hEl) hEl.textContent = currentProfile?.full_name || 'Usuario';
  }
}

function updatePoliciesTab() {
  const container = qs('#tab-seguros .dash-panel');
  if (!container) return;
  if (currentPolicies.length === 0) {
    container.innerHTML = '<div class="empty-block"><svg class="icon"><use href="#i-inbox"/></svg><p>Todavía no tienes pólizas. Cotiza desde "Presupuestos".</p></div>';
  } else {
    container.innerHTML = currentPolicies.map(p => {
      const a = (p.status === 'active' || p.status === 'Activo');
      const doc = currentPolicyDocuments.find(d => d.policy_id === p.id);
      const dlLink = doc ? '<a class="doc-link" href="' + esc(doc.url) + '" target="_blank" rel="noopener">Descargar póliza</a>' : '';
      return '<div class="policy-row"><span class="ic"><svg><use href="#' + getPolicyIcon(p.type || p.policy_type) + '"/></svg></span><div class="info"><div class="nm">' + esc(capitalize(p.type || p.policy_type) || 'Seguro') + '</div><div class="ref">' + esc(p.policy_number || p.reference || '—') + '</div></div><span class="st ' + (a ? 'active' : 'pending') + '">' + (a ? 'Activo' : 'Pendiente') + '</span><span class="pr">' + parseFloat(p.premium || 0).toFixed(0) + '€/mes</span>' + dlLink + '<a class="doc-link" href="#/app/documentos">Documentos</a><a class="doc-link" href="#/app/siniestros">Declarar siniestro</a></div>';
    }).join('');
  }
}

function updateWynpointsTab() {
  const pts = currentProfile?.wynpoints || 0;
  const tier = getTier(pts);
  const tiers = ['Bronce', 'Plata', 'Oro'];
  const idx = tiers.indexOf(tier);
  const ptsEl = qs('#tab-wynpoints .points-num');
  if (ptsEl) ptsEl.innerHTML = pts.toLocaleString() + ' <small>pts</small>';
  const pill = qs('#tab-wynpoints .tier-pill');
  if (pill) pill.textContent = 'Nivel ' + tier;
  const track = qs('#tab-wynpoints .tier-track');
  if (track) {
    track.querySelectorAll('.tier-step').forEach((s, i) => {
      s.className = 'tier-step';
      if (i < idx) s.classList.add('done');
      else if (i === idx) s.classList.add('done', 'current');
    });
  }
  const earnList = qs('#tab-wynpoints .wp-earn');
  if (earnList && currentPolicies.length > 0) {
    const pm = { 'coche': 700, 'hogar': 600, 'salud': 1500, 'vida': 2500, 'empresa': 3500, 'telemedicina': 0 };
    earnList.innerHTML = currentPolicies.map(p => {
      const pts2 = pm[(p.type || p.policy_type || '').toLowerCase()] || 500;
      return '<div><svg><use href="#' + getPolicyIcon(p.type || p.policy_type) + '"/></svg><span class="nm">' + esc(p.type || p.policy_type || 'Seguro') + '</span><span class="pt">+' + pts2 + ' pts</span></div>';
    }).join('');
  }
}

function updateSettings() {
  if (!currentProfile) return;
  const n = $('settName'); const e = $('settEmail');
  if (n) n.value = currentProfile.full_name || '';
  if (e) e.value = currentUser?.email || '';
}

/* ---------- QUOTES ---------- */
function initQuoteSelector() {
  quoteCalcWidget = initCalcWidget({
    typesEl: $('typeGrid'), questionsEl: $('quoteQuestions'), levelsEl: $('quoteLevels'),
    priceEl: $('prevPrice'), ptsEl: null, postalWrap: $('quotePostalField'), whyEl: $('prevWhy'),
    onChange: function(s) {
      selectedQuote = { name: s.type, price: s.price, pts: s.pts, cov: s.covDetailed };
      $('prevName').textContent = s.type;
      $('prevCov').textContent = s.cov;
      $('prevPts').textContent = '+ ' + s.pts.toLocaleString() + ' WynPoints';
      $('prevRef').style.display = 'none'; $('prevRef').textContent = '';
      var successEl = $('successBlock');
      if (successEl) successEl.classList.remove('is-shown');
      var saveBtn = $('saveQuoteBtn');
      if (saveBtn) saveBtn.style.display = '';
    }
  });
}

/* ---------- CALCULADORA (landing) ---------- */
function initLandingCalculator() {
  initCalcWidget({
    typesEl: $('calcTypes'), questionsEl: $('calcQuestions'), levelsEl: $('calcLevels'),
    priceEl: $('calcPrice'), ptsEl: $('calcPts'), postalWrap: $('calcPostalField'), whyEl: $('calcWhy'),
    onChange: function(s) {
      try { localStorage.setItem('wyncare_landing_quote', JSON.stringify(s)); } catch (e) {}
    }
  });
}

/* ---------- TEDDY: aviso sutil tras un rato sin interactuar ---------- */
function initTeddyAttract() {
  var launcher = $('teddyLauncher'), panel = $('teddyPanel');
  if (!launcher || !panel) return;
  var timer = setTimeout(function() {
    if (!panel.classList.contains('is-open')) launcher.classList.add('teddy-attract');
  }, 20000);
  launcher.addEventListener('click', function() {
    clearTimeout(timer);
    launcher.classList.remove('teddy-attract');
  });
}

async function saveQuote() {
  if (!currentUser) { navigate('#/login'); return; }
  var btn = $('saveQuoteBtn'); btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    // "quotes" no tiene columnas "quote_type"/"coverage_description"/
    // "wynpoints"/"reference": el tipo va en "type" (enum insurance_type,
    // en min\u00fasculas) y el resto de datos variables van dentro de "form_data".
    var { data, error } = await sb.from('quotes').insert({
      user_id: currentUser.id,
      type: selectedQuote.name.toLowerCase(),
      premium: selectedQuote.price,
      form_data: { coverage_description: selectedQuote.cov, wynpoints: selectedQuote.pts },
      status: 'pending_docs'
    }).select().single();
    if (error) throw error;
    var ref = friendlyRef('WC', data && data.id);
    $('successRef').textContent = ref;
    var successEl = $('successBlock');
    if (successEl) successEl.classList.add('is-shown');
    btn.style.display = 'none';
    $('prevRef').textContent = '\u2714 Cotizaci\u00f3n guardada';
    $('prevRef').style.display = 'block';
    updateQuotesList();
  } catch (err) { alert('Error al guardar: ' + err.message); }
  btn.disabled = false; btn.textContent = 'Guardar cotizaci\u00f3n';
}

/* ---------- SINIESTROS ---------- */
var CLAIM_TONE = { 'Enviado': 'pending', 'En revisi\u00f3n': 'pending', 'Resuelto': 'active', 'Rechazado': 'pending' };

function initClaims() {
  var newBtn = $('newClaimBtn'), cancelBtn = $('cancelClaimBtn'), panel = $('claimFormPanel'), form = $('claimForm');
  if (newBtn) newBtn.addEventListener('click', function() {
    if (!currentUser) { navigate('#/login'); return; }
    fillClaimPolicySelect();
    if (panel) panel.classList.add('is-shown');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  if (cancelBtn) cancelBtn.addEventListener('click', function() { if (panel) panel.classList.remove('is-shown'); if (form) form.reset(); });
  if (form) form.addEventListener('submit', function(e) { e.preventDefault(); submitClaim(); });
}

function fillClaimPolicySelect() {
  var select = $('claimPolicy');
  if (!select) return;
  if (currentPolicies.length === 0) {
    select.innerHTML = '<option value="">No tienes p\u00f3lizas activas todav\u00eda</option>';
    return;
  }
  select.innerHTML = currentPolicies.map(function(p) {
    var label = (p.type || p.policy_type || 'Seguro') + ' \u2014 ' + (p.reference || '');
    return '<option value="' + esc(p.id || '') + '">' + esc(label) + '</option>';
  }).join('');
}

async function submitClaim() {
  if (!currentUser) { navigate('#/login'); return; }
  var form = $('claimForm');
  var btn = form.querySelector('button[type="submit"]');
  var ref = 'SN-' + Date.now().toString(36).toUpperCase();
  var payload = {
    user_id: currentUser.id,
    policy_id: $('claimPolicy').value || null,
    reference: ref,
    incident_type: $('claimType').value,
    incident_date: $('claimDate').value,
    phone: $('claimPhone').value,
    description: $('claimDesc').value,
    status: 'Enviado',
    created_at: new Date().toISOString()
  };
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    var { error } = await sb.from('claims').insert(payload);
    if (error) throw error;
    alert('Parte enviado. Referencia: ' + ref + '. Te avisaremos por email de cualquier novedad.');
  } catch (err) {
    alert('No hemos podido registrar el parte autom\u00e1ticamente (' + err.message + '). Escr\u00edbenos a contacto@wyncare.es con esta referencia y te ayudamos a mano: ' + ref);
  }
  btn.disabled = false; btn.textContent = 'Enviar parte';
  form.reset();
  $('claimFormPanel').classList.remove('is-shown');
  updateClaimsTab();
}

async function updateClaimsTab() {
  var panel = $('claimsListPanel');
  if (!panel || !currentUser) return;
  try {
    var { data, error } = await sb.from('claims').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if (error) throw error;
    var claims = data || [];
    if (claims.length === 0) {
      panel.innerHTML = '<div class="empty-block"><svg class="icon"><use href="#i-inbox"/></svg><p>Todav\u00eda no has declarado ning\u00fan siniestro.</p></div>';
    } else {
      panel.innerHTML = claims.map(function(c) {
        var tone = CLAIM_TONE[c.status] || 'pending';
        var date = c.incident_date ? new Date(c.incident_date).toLocaleDateString() : '\u2014';
        return '<div class="claim-row"><span class="ic"><svg class="icon"><use href="#i-alert"/></svg></span><div class="info"><div class="nm">' + esc(c.incident_type || 'Siniestro') + '</div><div class="ref">' + esc(c.reference || '') + '</div></div><span class="dt">' + date + '</span><span class="st ' + tone + '">' + esc(c.status || 'Enviado') + '</span></div>';
      }).join('');
    }
  } catch (err) {
    panel.innerHTML = '<div class="empty-block"><svg class="icon"><use href="#i-inbox"/></svg><p>Todav\u00eda no has declarado ning\u00fan siniestro.</p></div>';
  }
}

/* ---------- DOCUMENTOS ---------- */
// currentPolicyDocuments ya se carga una sola vez en loadUserData() (lo
// reutiliza tambi\u00e9n updatePoliciesTab() para el enlace "Descargar p\u00f3liza").
function updateDocumentsTab() {
  var panel = $('documentsListPanel');
  if (!panel || !currentUser) return;
  var emptyHtml = '<div class="empty-block"><svg class="icon"><use href="#i-inbox"/></svg><p>Todav\u00eda no hay documentos disponibles. Te avisaremos por email en cuanto lo est\u00e9n.</p></div>';
  var docs = currentPolicyDocuments.slice().sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });
  if (docs.length === 0) { panel.innerHTML = emptyHtml; return; }
  var policyById = {};
  currentPolicies.forEach(function(p) { policyById[p.id] = p; });
  panel.innerHTML = docs.map(function(d) {
    var policy = policyById[d.policy_id];
    var policyLabel = policy ? (policy.type || policy.policy_type || 'Seguro') + ' \u00b7 ' + (policy.reference || '') : '';
    return '<div class="doc-row"><span class="ic"><svg class="icon"><use href="#i-doc"/></svg></span><div class="info"><div class="nm">' + esc(d.name || 'Documento') + '</div><div class="meta">' + esc(policyLabel) + '</div></div><a class="dl" href="' + esc(d.url || '#') + '" target="_blank" rel="noopener">Descargar</a></div>';
  }).join('');
}

/* ---------- FORMS ---------- */
function initLoginForm() {
  var loginForm = $('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function(e) { e.preventDefault(); handleLogin($('loginEmail').value, $('loginPass').value); });
  }
  var regForm = $('registerForm');
  if (regForm) {
    regForm.addEventListener('submit', function(e) { e.preventDefault(); handleRegister($('regName').value, $('regEmail').value, $('regPass').value); });
  }
  var forgotForm = $('forgotForm');
  if (forgotForm) {
    forgotForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var email = $('forgotEmail').value;
      $('forgotSuccess').style.display = 'block';
      $('forgotSuccess').querySelector('p').textContent = 'Si ' + email + ' est\u00e1 registrado, recibir\u00e1s instrucciones para restablecer tu contrase\u00f1a.';
      sb.auth.resetPasswordForEmail(email).catch(function() {});
    });
  }
  var sq = $('saveQuoteBtn');
  if (sq) sq.addEventListener('click', saveQuote);
  var lo = $('logoutBtn');
  if (lo) lo.addEventListener('click', function(e) { e.preventDefault(); handleLogout(); });
  var saveBtn = qs('#tab-ajustes .btn-primary');
  if (saveBtn) {
    saveBtn.addEventListener('click', async function() {
      var name = $('settName')?.value;
      if (!name || !currentUser) return;
      await sb.from('profiles').update({ full_name: name }).eq('id', currentUser.id);
      currentProfile.full_name = name;
      updateSidebar(); updateDashboard();
      alert('Perfil actualizado \u2713');
    });
  }
  var themeSw = $('settingsThemeSwitch');
  if (themeSw) {
    themeSw.addEventListener('click', function() { toggleTheme(); });
  }
  document.querySelectorAll('[data-demo-switch]').forEach(function(sw) {
    sw.addEventListener('click', function() {
      var c = sw.getAttribute('aria-checked') === 'true';
      sw.setAttribute('aria-checked', !c);
    });
  });
}

/* ---------- TELEMEDICINE ---------- */
function initTelemedicina() {
  document.addEventListener('click', function(e) {
    var row = e.target.closest('.tele-row[data-spec]');
    if (!row) return;
    var spec = row.dataset.spec;
    $('teleBookPanel').classList.add('is-shown');
    $('teleBookText').textContent = 'Videoconsulta de ' + spec + ' agendada. Recibir\u00e1s un enlace 5 min antes.';
    $('teleBookPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

/* ---------- REWARDS ---------- */
function initRewards() {
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.redeem-btn');
    if (!btn) return;
    var row = btn.closest('.reward-row');
    var name = row?.querySelector('.nm')?.textContent || 'Recompensa';
    var cost = parseInt(row?.querySelector('.cost')?.textContent || '0');
    if (confirm('\u00bfCanjear "' + name + '" por ' + cost + ' WynPoints?')) {
      btn.textContent = '\u2714 Canjeado'; btn.disabled = true; btn.style.opacity = '0.6';
    }
  });
}

/* ---------- TEDDY CHAT ---------- */
var teddyResponses = [
  { match: /seguro/i, text: 'Depende de lo que necesites proteger. \u00bfCoche, hogar, salud, vida o empresa? Puedo darte una estimaci\u00f3n r\u00e1pida.' },
  { match: /wynpoints|punto/i, text: 'Los WynPoints se acumulan con cada seguro activo. Coche \u2192 700 pts, Hogar \u2192 600 pts, Salud \u2192 1.500 pts, Vida \u2192 2.500 pts. \u00a1Canj\u00e9alos por recompensas!' },
  { match: /asesor|humano|hablar/i, text: 'Puedo conectar con un asesor. Dime tu n\u00famero y te llamamos en horario comercial (L-V 9:00-18:00).' },
  { match: /hola|buenas|hey|b.*d[i\u00ed]a/i, text: '\u00a1Hola! Soy Teddy \ud83d\udc3b, tu asistente de WynCare. \u00bfEn qu\u00e9 puedo ayudarte?' },
];

function addTeddyMessage(text, isUser) {
  var body = $('teddyBody'); if (!body) return;
  var div = document.createElement('div');
  div.className = 't-msg' + (isUser ? ' user' : '');
  div.innerHTML = '<span class="av">' + (isUser ? '<svg><use href="#i-user"/></svg>' : '<svg class="icon" style="stroke:var(--gold-ink);width:12px;height:12px"><use href="#i-chat"/></svg>') + '</span><div class="bubble">' + esc(text) + '</div>';
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function teddyTyping() {
  var body = $('teddyBody'); if (!body) return;
  var div = document.createElement('div'); div.className = 't-msg'; div.id = 'teddyTyping';
  div.innerHTML = '<span class="av"><svg class="icon" style="stroke:var(--gold-ink);width:12px;height:12px"><use href="#i-chat"/></svg></span><div class="t-typing"><span></span><span></span><span></span></div>';
  body.appendChild(div); body.scrollTop = body.scrollHeight;
}

(function() {
  var launcher = $('teddyLauncher');
  var close = $('teddyClose');
  var send = $('teddySend');
  var input = $('teddyInput');
  var panel = $('teddyPanel');

  if (launcher) {
    launcher.addEventListener('click', function() {
      if (panel) panel.classList.add('is-open');
      var body = $('teddyBody');
      if (body && body.children.length === 0) addTeddyMessage('\u00a1Hola! Soy Teddy \ud83d\udc3b, tu asistente de WynCare. Puedo ayudarte con seguros, WynPoints, telemedicina y m\u00e1s. \u00bfQu\u00e9 necesitas?');
    });
  }
  if (close) close.addEventListener('click', function() { if (panel) panel.classList.remove('is-open'); });
  if (send) {
    send.addEventListener('click', function() {
      if (!input) return;
      var msg = input.value.trim(); if (!msg) return;
      input.value = ''; addTeddyMessage(msg, true); teddyTyping();
      setTimeout(function() {
        var el = $('teddyTyping'); if (el) el.remove();
        var r = null;
        for (var i = 0; i < teddyResponses.length; i++) {
          if (teddyResponses[i].match.test(msg)) { r = teddyResponses[i]; break; }
        }
        addTeddyMessage(r ? r.text : 'Entiendo. D\u00e9jame consultar... \u00a1Claro! Para eso puedes ir a la secci\u00f3n correspondiente en tu \u00c1rea Cliente o preguntarme algo m\u00e1s concreto.');
      }, 600 + Math.random() * 900);
    });
  }
  if (input) {
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (send) send.click(); } });
  }
})();

document.addEventListener('click', function(e) {
  var chip = e.target.closest('.t-chip');
  if (chip && chip.closest('#teddySuggestions')) {
    var text = chip.textContent;
    var launcher = $('teddyLauncher');
    if (launcher) launcher.click();
    setTimeout(function() {
      addTeddyMessage(text, true); teddyTyping();
      setTimeout(function() {
        var el = $('teddyTyping'); if (el) el.remove();
        var r = null;
        for (var i = 0; i < teddyResponses.length; i++) {
          if (teddyResponses[i].match.test(text)) { r = teddyResponses[i]; break; }
        }
        addTeddyMessage(r ? r.text : 'Claro, d\u00e9jame ayudarte.');
      }, 700);
    }, 300);
  }
});

/* ---------- MOBILE NAV ---------- */
(function() {
  var toggle = $('navToggle');
  if (toggle) {
    toggle.addEventListener('click', function() {
      var nav = $('siteNav');
      var isOpen = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen);
    });
  }
})();

/* ---------- SCROLL EFFECTS ---------- */
(function() {
  var nav = $('siteNav');
  var progress = $('scrollProgress');
  if (nav) {
    window.addEventListener('scroll', function() {
      nav.classList.toggle('is-scrolled', window.scrollY > 20);
      if (progress) {
        var h = document.documentElement;
        var max = h.scrollHeight - h.clientHeight;
        progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
      }
    }, { passive: true });
  }

  var revealEls = qsa('.reveal');
  if (revealEls.length && 'IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); obs.unobserve(entry.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    for (var i = 0; i < revealEls.length; i++) obs.observe(revealEls[i]);
  } else {
    for (var i = 0; i < revealEls.length; i++) revealEls[i].classList.add('is-visible');
  }

  var card = $('tiltCard');
  var stage = card ? card.closest('.tilt-stage') : null;
  if (card && stage) {
    stage.addEventListener('mousemove', function(e) {
      var r = stage.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      card.style.transform = 'rotateX(' + ((y - r.height/2) / r.height * -10) + 'deg) rotateY(' + ((x - r.width/2) / r.width * 10) + 'deg)';
    });
    stage.addEventListener('mouseleave', function() { card.style.transform = ''; });
  }

  /* animated counters (hero stats, about badges) */
  var counters = qsa('[data-count-to]');
  if (counters.length && 'IntersectionObserver' in window) {
    var countObs = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        countObs.unobserve(entry.target);
        var el = entry.target;
        var to = parseFloat(el.getAttribute('data-count-to'));
        var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
        var prefix = el.getAttribute('data-prefix') || '';
        var suffix = el.getAttribute('data-suffix') || '';
        var duration = 1400, start = null;
        function tick(ts) {
          if (start === null) start = ts;
          var p = Math.min((ts - start) / duration, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          var val = to * eased;
          el.textContent = prefix + formatEsNumber(val, decimals) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });
    for (var ci = 0; ci < counters.length; ci++) countObs.observe(counters[ci]);
  }

  /* spotlight cursor glow on cards */
  var spotlights = qsa('.spotlight');
  for (var si = 0; si < spotlights.length; si++) {
    (function(el) {
      el.addEventListener('mousemove', function(e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    })(spotlights[si]);
  }
})();

/* ---------- FOOTER YEAR ---------- */
(function() {
  var yearEl = $('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();

/* ---------- COOKIE CONSENT ---------- */
(function() {
  var KEY = 'wyncare-cookie-consent'; // 'all' | 'necessary'
  function loadGoogleFonts() {
    if (document.getElementById('gfonts-link')) return;
    var link = document.createElement('link');
    link.id = 'gfonts-link'; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(link);
  }
  var stored = localStorage.getItem(KEY);
  if (stored === 'all') loadGoogleFonts();

  var banner = $('cookieBanner');

  // El banner es position:fixed, así que por defecto puede solaparse con
  // contenido (p.ej. el CTA del hero en móviles bajos). Mientras esté
  // visible, reservamos su altura real como padding-bottom del body para
  // que nunca tape nada — en vez de recortar el aviso para que "quepa".
  function reserveSpace() {
    if (!banner || !banner.classList.contains('is-shown')) { document.body.style.paddingBottom = ''; return; }
    document.body.style.paddingBottom = (banner.getBoundingClientRect().height + 16) + 'px';
  }
  function hideBanner() {
    if (banner) banner.classList.remove('is-shown');
    document.body.style.paddingBottom = '';
    window.removeEventListener('resize', reserveSpace);
  }

  if (!stored && banner) {
    banner.classList.add('is-shown');
    reserveSpace();
    window.addEventListener('resize', reserveSpace);
  }

  var acceptBtn = $('cookieAccept'), rejectBtn = $('cookieReject');
  if (acceptBtn) acceptBtn.addEventListener('click', function() {
    localStorage.setItem(KEY, 'all');
    loadGoogleFonts();
    hideBanner();
  });
  if (rejectBtn) rejectBtn.addEventListener('click', function() {
    localStorage.setItem(KEY, 'necessary');
    hideBanner();
  });
})();

/* ---------- ADMIN PANEL ---------- */
async function loadAdminPanel() {
  showView('view-home');
  var existing = $('adminPanel');
  if (existing) existing.remove();
  document.documentElement.classList.add('admin-mode');

  if (!document.querySelector('#adminStyles')) {
    var s = document.createElement('style'); s.id = 'adminStyles';
    s.textContent = '.admin-overlay{position:fixed;inset:0;z-index:99;background:rgba(0,0,0,.7);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center}.admin-panel{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);width:min(94vw,1100px);max-height:90vh;overflow-y:auto;padding:2rem;position:relative}.admin-panel .close-btn{position:absolute;top:1rem;right:1rem;width:32px;height:32px;border-radius:50%;border:1px solid var(--border);display:flex;align-items:center;justify-content:center}.admin-panel h2{font-size:1.3rem;margin-bottom:.5rem;display:flex;align-items:center;gap:.5rem}.admin-panel .sub{color:var(--text-2);font-size:.85rem;margin-bottom:1.5rem}.admin-table{width:100%;border-collapse:collapse;font-size:.85rem}.admin-table th{text-align:left;padding:.65rem .7rem;border-bottom:1px solid var(--border);color:var(--text-2);font-weight:600;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}.admin-table td{padding:.65rem .7rem;border-bottom:1px solid var(--border)}.admin-table tr:last-child td{border-bottom:0}.admin-tabs{display:flex;gap:.5rem;margin-bottom:1.5rem;border-bottom:1px solid var(--border);padding-bottom:.6rem;overflow-x:auto}.admin-tab{padding:.5rem .9rem;border-radius:var(--radius-sm);font-size:.82rem;font-weight:500;color:var(--text-2);white-space:nowrap}.admin-tab[aria-current]{background:rgba(var(--gold-rgb),.14);color:var(--gold)}.badge-admin{font-size:.65rem;font-weight:700;background:var(--danger);color:#fff;padding:.2rem .5rem;border-radius:var(--radius-full);text-transform:uppercase;letter-spacing:.04em}.admin-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem;margin-bottom:1.2rem}.admin-stat{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.85rem;text-align:center}.admin-stat .n{font-family:var(--font-mono);font-size:1.3rem;font-weight:700;color:var(--gold)}.admin-stat .l{font-size:.72rem;color:var(--text-2);margin-top:.15rem}';
    document.head.appendChild(s);
  }

  var panel = document.createElement('div'); panel.className = 'admin-overlay'; panel.id = 'adminPanel';
  panel.innerHTML = '<div class="admin-panel"><button class="close-btn" id="adminClose"><svg class="icon" style="width:15px;height:15px"><use href="#i-close"/></svg></button><h2>Panel de Administraci\u00f3n <span class="badge-admin">Admin</span></h2><p class="sub">' + esc(currentUser ? currentUser.email : '') + ' \u00b7 wyncare.es</p><div class="admin-tabs"><button class="admin-tab" data-admin-tab="usuarios" aria-current="true">Usuarios</button><button class="admin-tab" data-admin-tab="cotizaciones">Cotizaciones</button><button class="admin-tab" data-admin-tab="polizas">P\u00f3lizas</button><button class="admin-tab" data-admin-tab="wynpoints">WynPoints</button></div><div id="adminContent"><p style="color:var(--text-2)">Cargando datos...</p></div></div>';
  document.body.appendChild(panel);

  $('adminClose').addEventListener('click', function() { panel.remove(); document.documentElement.classList.remove('admin-mode'); navigate('#/app'); });
  panel.addEventListener('click', function(e) { if (e.target === panel) { panel.remove(); document.documentElement.classList.remove('admin-mode'); navigate('#/app'); } });

  panel.addEventListener('click', function(e) {
    var tab = e.target.closest('[data-admin-tab]');
    if (tab) {
      qsa('[data-admin-tab]').forEach(function(t) { t.removeAttribute('aria-current'); });
      tab.setAttribute('aria-current', 'true');
      loadAdminTab(tab.getAttribute('data-admin-tab'));
    }
  });

  loadAdminTab('usuarios');
}

async function adminFetch(table) {
  try {
    // Lee con la sesión del usuario; el acceso de admin lo deciden las
    // políticas RLS de Supabase, nunca una clave embebida en el cliente.
    var { data, error } = await sb.from(table).select('*').limit(200);
    if (error) { console.warn('adminFetch(' + table + '): ' + error.message); return []; }
    return data || [];
  } catch(e) { return []; }
}

async function loadAdminTab(tabName) {
  var content = $('adminContent');
  content.innerHTML = '<p style="color:var(--text-2)">Cargando...</p>';
  try {
    if (tabName === 'usuarios') {
      var profiles = await adminFetch('profiles');
      var html = '<div class="admin-summary"><div class="admin-stat"><div class="n">' + profiles.length + '</div><div class="l">Usuarios totales</div></div><div class="admin-stat"><div class="n">' + profiles.filter(function(p) { return p.created_at; }).length + '</div><div class="l">Con perfil</div></div></div>';
      html += '<table class="admin-table"><thead><tr><th>ID</th><th>Nombre</th><th>Email</th><th>WynPoints</th><th>Registro</th></tr></thead><tbody>';
      for (var i = 0; i < profiles.length; i++) {
        var p = profiles[i];
        html += '<tr><td style="font-family:var(--font-mono);font-size:.75rem">' + esc((p.id || '').substring(0, 8) || '\u2014') + '</td><td>' + esc(p.full_name || '\u2014') + '</td><td>' + esc(p.email || '\u2014') + '</td><td>' + esc(p.wynpoints || 0) + '</td><td>' + (p.created_at ? new Date(p.created_at).toLocaleDateString() : '\u2014') + '</td></tr>';
      }
      html += '</tbody></table>';
      content.innerHTML = html;
    } else if (tabName === 'cotizaciones') {
      var quotes = await adminFetch('quotes');
      var html = '<div class="admin-summary"><div class="admin-stat"><div class="n">' + quotes.length + '</div><div class="l">Cotizaciones</div></div><div class="admin-stat"><div class="n">' + quotes.filter(function(q) { return q.status === 'pending' || q.status === 'Pendiente'; }).length + '</div><div class="l">Pendientes</div></div></div>';
      html += '<table class="admin-table"><thead><tr><th>Ref</th><th>Tipo</th><th>Prima</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>';
      for (var i = 0; i < quotes.length; i++) {
        var q = quotes[i];
        html += '<tr><td>' + esc(q.reference || '\u2014') + '</td><td>' + esc(q.quote_type || '\u2014') + '</td><td>' + esc(q.premium || 0) + '\u20ac</td><td>' + esc(q.status || '\u2014') + '</td><td>' + (q.created_at ? new Date(q.created_at).toLocaleDateString() : '\u2014') + '</td></tr>';
      }
      html += '</tbody></table>';
      content.innerHTML = html;
    } else if (tabName === 'polizas') {
      var policies = await adminFetch('policies');
      var html = '<div class="admin-summary"><div class="admin-stat"><div class="n">' + policies.length + '</div><div class="l">P\u00f3lizas</div></div><div class="admin-stat"><div class="n">' + policies.filter(function(p) { return p.status === 'active' || p.status === 'Activo'; }).length + '</div><div class="l">Activas</div></div></div>';
      html += '<table class="admin-table"><thead><tr><th>Ref</th><th>Tipo</th><th>Prima</th><th>Estado</th><th>Usuario</th></tr></thead><tbody>';
      for (var i = 0; i < policies.length; i++) {
        var p = policies[i];
        html += '<tr><td>' + esc(p.reference || '\u2014') + '</td><td>' + esc(p.type || p.policy_type || '\u2014') + '</td><td>' + esc(p.premium || 0) + '\u20ac</td><td>' + esc(p.status || '\u2014') + '</td><td style="font-size:.75rem">' + esc((p.user_id || '').substring(0, 8) || '\u2014') + '</td></tr>';
      }
      html += '</tbody></table>';
      content.innerHTML = html;
    } else if (tabName === 'wynpoints') {
      var trans = await adminFetch('wynpoints_transactions');
      var html = '<div class="admin-summary"><div class="admin-stat"><div class="n">' + trans.length + '</div><div class="l">Transacciones</div></div></div>';
      html += '<table class="admin-table"><thead><tr><th>Usuario</th><th>Tipo</th><th>Puntos</th><th>Concepto</th><th>Fecha</th></tr></thead><tbody>';
      for (var i = 0; i < trans.length; i++) {
        var t = trans[i];
        html += '<tr><td>' + esc((t.user_id || '').substring(0, 8) || '\u2014') + '</td><td>' + esc(t.transaction_type || t.type || '\u2014') + '</td><td>' + esc(t.points || 0) + '</td><td>' + esc(t.description || '\u2014') + '</td><td>' + (t.created_at ? new Date(t.created_at).toLocaleDateString() : '\u2014') + '</td></tr>';
      }
      html += '</tbody></table>';
      content.innerHTML = html;
    }
  } catch (err) {
    content.innerHTML = '<p style="color:var(--danger)">Error al cargar datos: ' + esc(err.message) + '</p>';
  }
}

/* ---------- INIT ---------- */
(function init() {
  setTheme(getTheme());
  initQuoteSelector();
  initQuotesViewToggle();
  initTelemedicina();
  initRewards();
  initClaims();
  initLandingCalculator();
  initTeddyAttract();
  // Always bind forms even before Supabase loads
  initLoginForm();
  // Async session load
  loadUserSession();
  
  // Auto-resize Teddy textarea
  var teddyInput = $('teddyInput');
  if (teddyInput) {
    teddyInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 90) + 'px';
    });
  }
})();
