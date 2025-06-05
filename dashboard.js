/* dashboard.js — 100 % Vanilla JS & CSP-safe */
import * as store from './storage.js';

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
          susIcon.textContent = '💤';
          row.appendChild(susIcon);
        }
        /* ↩ Restaurar (solo suspendidas) */
        if (t.state === 'SUSPENDED') {
          const resIcon = document.createElement('span');
          resIcon.className = 'icon-action restore-icon';
          resIcon.title = 'Restaurar pestaña';
          resIcon.dataset.tid = id;
          resIcon.textContent = '↩️';
          row.appendChild(resIcon);
        }
        /* 🗑 Eliminar (todos los estados) */
        const delIcon = document.createElement('span');
        delIcon.className = 'icon-action delete-icon';
        delIcon.title = 'Eliminar pestaña';
        delIcon.dataset.tid = id;
        delIcon.textContent = '🗑️';
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
    ? hits.map(t => `<div class="tab-item">🟢 <span><b>${t.title || '(sin título)'}</b><br><small>${t.url}</small></span></div>`).join('<hr>')
    : 'Sin resultados.';
});

/* ═════════════ 5. TEMA CLARO / OSCURO ═════════════ */
const tBtn  = document.getElementById('theme-toggle-btn');
const tIcon = document.getElementById('theme-icon');
const tLab  = document.getElementById('theme-label');

function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  tIcon.textContent = mode === 'dark' ? '🌙' : '☀️';
  tLab.textContent  = mode === 'dark' ? 'Oscuro' : 'Claro';
}
(async () => {
  const { userTheme } = await store.get(['userTheme']);
  const mode = userTheme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  setTheme(mode);
})();
tBtn.addEventListener('click', async () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
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
