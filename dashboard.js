/* dashboard.js — 100 % Vanilla JS & CSP-safe */
import * as store from './storage.js';

// Iconos SVG minimalistas
const ICONS = {
  suspend: 'M15.75 5.25v13.5m-7.5-13.5v13.5',
  restore: 'M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3',
  delete: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
  sun: 'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z',
  moon: 'M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z'
};

function createIcon(path) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.innerHTML = `<path d="${path}" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return svg;
}

// Mantiene el estado de ventanas expandidas entre renderizados
const expandedWindows = new Set();

/* ═════════════ 1. SINCRONIZAR ═════════════ */
document.getElementById('btn-sync').addEventListener('click', async () => {
  if (!confirm('¿Eliminar pestañas suspendidas y mapear las activas?')) return;
  const { ok } = await chrome.runtime.sendMessage({ action: 'SYNC_ALL' }) || {};
  if (ok) renderDashboard();
});

/* ═════════════ 2. RENDER PRINCIPAL ═════════ */
async function renderDashboard() {
  const { windows = {}, tabs = {} } = await store.get(['windows', 'tabs']);
  const stats = document.getElementById('stats');
  const cards = document.getElementById('cards');
  stats.textContent = ''; cards.innerHTML = '';

  if (!Object.keys(windows).length) {
    stats.textContent = 'No hay datos sincronizados.'; return;
  }

  /* ► resumen global */
  let act = 0, sus = 0;
  Object.values(windows).forEach(w => { act += w.active || 0; sus += w.suspended || 0; });
  stats.innerHTML =
    `<b>Ventanas:</b> ${Object.keys(windows).length} &nbsp; ` +
    `<b>Pestañas activas:</b> ${act} &nbsp; ` +
    `<b>Pestañas suspendidas:</b> ${sus}`;

  // Guarda los IDs de ventanas actualmente expandidas y resetea para el nuevo render
  const prevExpanded = new Set(expandedWindows);
  expandedWindows.clear();

  /* ► tarjetas por ventana */
  for (const [wid, win] of Object.entries(windows)) {
    const card  = document.createElement('section'); card.className = 'card';
    const head  = document.createElement('div');    head.className  = 'card-header';
    head.dataset.wid = wid;
    head.innerHTML =
      `<span><b>${win.alias}</b> — ${win.active} A / ${win.suspended} S</span><span>⯆</span>`;
    const body  = document.createElement('div');    body.className  = 'card-body';

    /* filas pestaña */
    Object.entries(tabs)
      .filter(([,t]) => t.windowId === wid)
      .forEach(([id, t]) => {
        const row = document.createElement('div'); row.className = 'tab-item';
        row.insertAdjacentHTML('beforeend', t.state === 'ACTIVE' ? '🟢' : '⚫');
        row.insertAdjacentHTML('beforeend',
          `<span>${t.title || '(sin título)'}<br><small>${t.url}</small></span>`);

        /* 💤 Suspender (solo activas) */
        if (t.state === 'ACTIVE') {
          const susIcon = document.createElement('span');
          susIcon.className = 'icon-action suspend-icon';
          susIcon.title = 'Suspender pestaña';
          susIcon.dataset.tid = id;
          susIcon.appendChild(createIcon(ICONS.suspend));
          row.appendChild(susIcon);
        }
        /* ↩ Restaurar (solo suspendidas) */
        if (t.state === 'SUSPENDED') {
          const resIcon = document.createElement('span');
          resIcon.className = 'icon-action restore-icon';
          resIcon.title = 'Restaurar pestaña';
          resIcon.dataset.tid = id;
          resIcon.appendChild(createIcon(ICONS.restore));
          row.appendChild(resIcon);
        }
        /* 🗑 Eliminar (todos los estados) */
        const delIcon = document.createElement('span');
        delIcon.className = 'icon-action delete-icon';
        delIcon.title = 'Eliminar pestaña';
        delIcon.dataset.tid = id;
        delIcon.appendChild(createIcon(ICONS.delete));
        row.appendChild(delIcon);

        body.appendChild(row);
      });

    // Mantener expandido si estaba abierto antes
    if (prevExpanded.has(wid)) {
      body.style.display = 'block';
      head.lastElementChild.textContent = '⯅';
      expandedWindows.add(wid);
    }

    /* colapsar/expandir */
    head.addEventListener('click', () => {
      const open = body.style.display === 'block';
      body.style.display = open ? 'none' : 'block';
      head.lastElementChild.textContent = open ? '⯆' : '⯅';
      if (!open) expandedWindows.add(wid);
      else expandedWindows.delete(wid);
    });

    card.append(head, body); cards.appendChild(card);
  }
}

/* ═════════════ 3. EVENTOS DELEGADOS (Restaurar / Eliminar) ═══════════ */
document.getElementById('cards').addEventListener('click', async e => {
  const tid = e.target.dataset.tid;
  if (!tid) return;

  if (e.target.classList.contains('suspend-icon')) {
    const { ok } = await chrome.runtime.sendMessage({ action: 'SUSPEND_TAB', tid }) || {};
    if (ok) renderDashboard();
  }

  if (e.target.classList.contains('restore-icon')) {
    const { ok } = await chrome.runtime.sendMessage({ action: 'RESTORE_TAB', tid }) || {};
    if (ok) renderDashboard();
  }

  if (e.target.classList.contains('delete-icon')) {
    const { ok } = await chrome.runtime.sendMessage({ action: 'DELETE_TAB', tid }) || {};
    if (ok) renderDashboard();
  }
});

/* ═════════════ 4. BUSCADOR EN TIEMPO REAL ══════════ */
document.getElementById('search').addEventListener('input', async e => {
  const q = e.target.value.trim().toLowerCase();
  const out = document.getElementById('results'); out.innerHTML = '';
  if (!q) return;

  const { tabs = {} } = await store.get(['tabs']);
  const hits = Object.values(tabs).filter(t =>
    (t.title && t.title.toLowerCase().includes(q)) ||
    (t.url   && t.url.toLowerCase().includes(q))
  );
  out.innerHTML = hits.length
    ? hits.map(t =>
        `<div class="tab-item">${t.state === 'ACTIVE' ? '🟢' : '⚫'} ` +
        `<span><b>${t.title || '(sin título)'}</b><br><small>${t.url}</small></span></div>`
      ).join('')
    : 'Sin resultados.';
});

/* ═════════════ 5. TEMA CLARO / OSCURO ═════════════ */
const tBtn  = document.getElementById('theme-toggle-btn');
const tIcon = document.getElementById('theme-icon');
const tLab  = document.getElementById('theme-label');

function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  tIcon.innerHTML = '';
  tIcon.appendChild(createIcon(mode === 'dark' ? ICONS.moon : ICONS.sun));
  tLab.textContent  = mode === 'dark' ? 'Oscuro' : 'Claro';
  tBtn.checked = mode === 'dark';
}
(async () => {
  const { userTheme } = await store.get(['userTheme']);
  const mode = userTheme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  setTheme(mode);
})();
tBtn.addEventListener('change', async () => {
  const next = tBtn.checked ? 'dark' : 'light';
  setTheme(next); await store.set({ userTheme: next });
});

/* ═════════════ 6. BURGER MÓVIL ═════════════ */
document.getElementById('burger')
        .addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));

/* ═════════════  STORAGE CHANGE → repintar ═════════════ */
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.windows || changes.tabs)) {
      renderDashboard();
    }
  });
  

/* carga inicial */
window.addEventListener('DOMContentLoaded', renderDashboard);
