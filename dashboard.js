/* dashboard.js — SIN EVENT HANDLERS INLINE - CSP COMPLIANT */
import * as store from './storage.js';

// Iconos SVG
const ICONS = {
  suspend: 'M15.75 5.25v13.5m-7.5-13.5v13.5',
  restore: 'M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3',
  delete: 'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0',
  windowSuspend: 'M6 18L18 6M6 6l12 12',
  windowRestore: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m-4.991 4.99a8.25 8.25 0 0 1-16.5 0',
  focus: 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7Z',
  sun: 'M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z',
  moon: 'M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z'
};

function createIcon(path, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  if (className) svg.className = className;
  svg.innerHTML = `<path d="${path}" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  return svg;
}

// Estado de la aplicación
const appState = {
  expandedWindows: new Set(),
  selectedTabs: new Set(),
  selectedWindows: new Set()
};

/* ═════════════ VALIDACIONES Y UTILIDADES ═════════════ */

// Validar si una URL de favicon es segura
function isSafeFavicon(url) {
  if (!url) return false;
  if (url.startsWith('chrome://')) return false;
  if (url.startsWith('chrome-extension://')) return false;
  if (url.startsWith('moz-extension://')) return false;
  return true;
}

// Validar si una pestaña existe realmente
async function tabExists(tabId) {
  try {
    await chrome.tabs.get(Number(tabId));
    return true;
  } catch {
    return false;
  }
}

// Limpiar pestañas que ya no existen del storage
async function cleanupInvalidTabs() {
  const { windows = {}, tabs = {} } = await store.get(['windows', 'tabs']);
  const validTabs = {};
  let hasChanges = false;

  for (const [tabId, tab] of Object.entries(tabs)) {
    if (tab.state === 'ACTIVE') {
      // Verificar si la pestaña activa aún existe
      if (await tabExists(tabId)) {
        validTabs[tabId] = tab;
      } else {
        // La pestaña ya no existe, actualizar contadores
        const w = windows[tab.windowId];
        if (w) {
          w.active = Math.max(0, (w.active || 1) - 1);
        }
        hasChanges = true;
        console.info(`[Dashboard] Pestaña activa ${tabId} ya no existe, removida del storage`);
      }
    } else {
      // Las pestañas suspendidas siempre se mantienen
      validTabs[tabId] = tab;
    }
  }

  if (hasChanges) {
    await store.set({ windows, tabs: validTabs });
  }
}

/* ═════════════ FUNCIONES DE MENSAJERÍA MEJORADAS ═════════════ */
async function sendMessage(action, data = {}) {
  return new Promise((resolve) => {
    const message = { action, ...data };
    console.log(`[Dashboard] Enviando mensaje: ${action}`, message);
    
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error(`[Dashboard] Error en runtime: ${chrome.runtime.lastError.message}`);
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      
      console.log(`[Dashboard] Respuesta recibida para ${action}:`, response);
      resolve(response || { ok: false, error: 'No response' });
    });
  });
}

/* ═════════════ SINCRONIZAR ═════════════ */
document.getElementById('btn-sync').addEventListener('click', async () => {
  if (!confirm('¿Eliminar pestañas suspendidas y mapear las activas?')) return;
  
  const response = await sendMessage('SYNC_ALL');
  if (response?.ok) {
    console.log('[Dashboard] Sincronización exitosa');
    setTimeout(() => renderDashboard(), 300);
  } else {
    console.error('[Dashboard] Error en sincronización:', response);
    alert('Error en la sincronización. Revisa la consola para más detalles.');
  }
});

/* ═════════════ RENDERIZADO PRINCIPAL ═════════════ */
async function renderDashboard() {
  // Limpiar pestañas inválidas antes de renderizar
  await cleanupInvalidTabs();
  
  const { windows = {}, tabs = {} } = await store.get(['windows', 'tabs']);
  const stats = document.getElementById('stats');
  const cards = document.getElementById('cards');
  
  if (!Object.keys(windows).length) {
    stats.innerHTML = '<div class="no-results">No hay datos sincronizados. Haz clic en "Sincronizar" para comenzar.</div>';
    cards.innerHTML = '';
    return;
  }

  // Estadísticas globales
  let totalActive = 0, totalSuspended = 0;
  Object.values(windows).forEach(w => {
    totalActive += w.active || 0;
    totalSuspended += w.suspended || 0;
  });
  
  const memoryEstimate = totalSuspended * 50;
  stats.innerHTML = `
    <div class="stat-item">
      <span class="stat-number">${Object.keys(windows).length}</span>
      <span class="stat-label">Ventanas</span>
    </div>
    <div class="stat-item">
      <span class="stat-number">${totalActive}</span>
      <span class="stat-label">Activas</span>
    </div>
    <div class="stat-item">
      <span class="stat-number">${totalSuspended}</span>
      <span class="stat-label">Suspendidas</span>
    </div>
    <div class="stat-item">
      <span class="stat-number">~${memoryEstimate}MB</span>
      <span class="stat-label">Liberados</span>
    </div>
  `;

  // Renderizar ventanas
  cards.innerHTML = '';
  for (const [wid, win] of Object.entries(windows)) {
    const card = createWindowCard(wid, win, tabs);
    cards.appendChild(card);
  }
}

function createWindowCard(wid, win, allTabs) {
  const card = document.createElement('div');
  card.className = 'card';
  if (win.closed) card.classList.add('closed');
  card.dataset.windowId = wid;
  
  const isExpanded = appState.expandedWindows.has(wid);
  
  const header = document.createElement('div');
  header.className = 'card-header';
  header.dataset.windowId = wid;
  
  const windowTabs = Object.entries(allTabs).filter(([, tab]) => tab.windowId === wid);
  const totalTabs = windowTabs.length;
  const activeTabs = windowTabs.filter(([, tab]) => tab.state === 'ACTIVE').length;
  const suspendedTabs = windowTabs.filter(([, tab]) => tab.state === 'SUSPENDED').length;
  
  header.innerHTML = `
    <div class="window-info">
      <div class="custom-checkbox" data-window="${wid}"></div>
      <span class="window-title">${win.alias}</span>
      <span class="window-count">(${totalTabs}) - ${activeTabs}A / ${suspendedTabs}S</span>
    </div>
    <div class="window-actions">
      <div class="window-action" data-action="focus" data-window="${wid}" title="Enfocar ventana">
        ${createIcon(ICONS.focus).outerHTML}
      </div>
      <div class="window-action" data-action="suspend-all" data-window="${wid}" title="Suspender todas">
        ${createIcon(ICONS.windowSuspend).outerHTML}
      </div>
      <div class="window-action" data-action="restore-all" data-window="${wid}" title="Restaurar todas">
        ${createIcon(ICONS.windowRestore).outerHTML}
      </div>
    </div>
  `;

  const body = document.createElement('div');
  body.className = 'card-body';
  body.dataset.windowId = wid;
  
  if (isExpanded) {
    body.style.display = 'block';
    populateWindowTabs(body, windowTabs);
    adjustBodyHeight(body);
  } else {
    body.style.display = 'none';
  }

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function populateWindowTabs(body, windowTabs) {
  body.innerHTML = '';

  windowTabs.sort(([, a], [, b]) => (a.index ?? 0) - (b.index ?? 0));

  windowTabs.forEach(([tabId, tab]) => {
    const tabItem = createTabItem(tabId, tab);
    body.appendChild(tabItem);
  });
  adjustBodyHeight(body);
}

function adjustBodyHeight(body) {
  const item = body.querySelector('.tab-item');
  const h = item ? item.offsetHeight : 48;
  const count = body.children.length;
  const visible = Math.min(count, 15);
  body.style.maxHeight = (h * visible) + 'px';
}

function createTabItem(tabId, tab) {
  const item = document.createElement('div');
  item.className = 'tab-item';
  item.dataset.tabId = tabId;
  
  // Crear favicon de forma programática (sin event handlers inline)
  const faviconContainer = document.createElement('div');
  faviconContainer.className = 'favicon-container';
  
  if (tab.favIcon && isSafeFavicon(tab.favIcon)) {
    const img = document.createElement('img');
    img.src = tab.favIcon;
    img.className = 'tab-favicon';
    
    const fallback = document.createElement('span');
    fallback.className = 'status-indicator';
    fallback.textContent = tab.state === 'ACTIVE' ? '🟢' : '⚫';
    fallback.style.display = 'none';
    
    // Event listener sin inline handlers
    img.addEventListener('error', () => {
      img.style.display = 'none';
      fallback.style.display = 'inline-block';
    });
    
    faviconContainer.appendChild(img);
    faviconContainer.appendChild(fallback);
  } else {
    const indicator = document.createElement('span');
    indicator.className = 'status-indicator';
    indicator.textContent = tab.state === 'ACTIVE' ? '🟢' : '⚫';
    faviconContainer.appendChild(indicator);
  }

  // Crear el contenido del item
  const checkbox = document.createElement('div');
  checkbox.className = 'custom-checkbox';
  checkbox.dataset.tab = tabId;

  const tabContent = document.createElement('div');
  tabContent.className = 'tab-content';
  
  const tabText = document.createElement('div');
  tabText.className = 'tab-text';
  
  const tabTitle = document.createElement('div');
  tabTitle.className = 'tab-title';
  tabTitle.textContent = tab.title || '(Sin título)';
  
  const tabUrl = document.createElement('div');
  tabUrl.className = 'tab-url';
  tabUrl.textContent = tab.url || '';

  tabText.appendChild(tabTitle);
  tabText.appendChild(tabUrl);
  
  tabContent.appendChild(faviconContainer);
  tabContent.appendChild(tabText);

  // Crear acciones
  const tabActions = document.createElement('div');
  tabActions.className = 'tab-actions';
  
  if (tab.state === 'ACTIVE') {
    const suspendIcon = document.createElement('span');
    suspendIcon.className = 'icon-action suspend-icon';
    suspendIcon.dataset.tid = tabId;
    suspendIcon.title = 'Suspender';
    suspendIcon.appendChild(createIcon(ICONS.suspend));
    tabActions.appendChild(suspendIcon);
  } else {
    const restoreIcon = document.createElement('span');
    restoreIcon.className = 'icon-action restore-icon';
    restoreIcon.dataset.tid = tabId;
    restoreIcon.title = 'Restaurar';
    restoreIcon.appendChild(createIcon(ICONS.restore));
    tabActions.appendChild(restoreIcon);
  }
  
  const deleteIcon = document.createElement('span');
  deleteIcon.className = 'icon-action delete-icon';
  deleteIcon.dataset.tid = tabId;
  deleteIcon.title = 'Eliminar';
  deleteIcon.appendChild(createIcon(ICONS.delete));
  tabActions.appendChild(deleteIcon);

  // Ensamblar el item
  item.appendChild(checkbox);
  item.appendChild(tabContent);
  item.appendChild(tabActions);

  return item;
}

/* ═════════════ ACCIONES DE PESTAÑAS CON VALIDACIÓN ═════════════ */
async function suspendTab(tid) {
  console.log(`[Dashboard] Intentando suspender pestaña: ${tid}`);
  
  // Validar que la pestaña existe si es activa
  const { tabs = {} } = await store.get(['tabs']);
  const tab = tabs[tid];
  
  if (!tab) {
    console.warn(`[Dashboard] Pestaña ${tid} no encontrada en storage`);
    renderDashboard(); // Refresh para limpiar
    return;
  }
  
  if (tab.state === 'ACTIVE' && !(await tabExists(tid))) {
    console.warn(`[Dashboard] Pestaña ${tid} ya no existe en el navegador`);
    renderDashboard(); // Refresh para limpiar
    return;
  }
  
  const response = await sendMessage('SUSPEND_TAB', { tid });
  if (response?.ok) {
    console.log(`[Dashboard] Pestaña ${tid} suspendida exitosamente`);
    setTimeout(() => renderDashboard(), 300);
  } else {
    console.error(`[Dashboard] Error al suspender pestaña ${tid}:`, response);
    renderDashboard(); // Refresh en caso de error
  }
}

async function restoreTab(tid) {
  console.log(`[Dashboard] Intentando restaurar pestaña: ${tid}`);
  
  const response = await sendMessage('RESTORE_TAB', { tid });
  if (response?.ok) {
    console.log(`[Dashboard] Pestaña ${tid} restaurada exitosamente`);
    setTimeout(() => renderDashboard(), 300);
  } else {
    console.error(`[Dashboard] Error al restaurar pestaña ${tid}:`, response);
    renderDashboard(); // Refresh en caso de error
  }
}

async function deleteTab(tid) {
  console.log(`[Dashboard] Intentando eliminar pestaña: ${tid}`);
  
  const response = await sendMessage('DELETE_TAB', { tid });
  if (response?.ok) {
    console.log(`[Dashboard] Pestaña ${tid} eliminada exitosamente`);
    setTimeout(() => renderDashboard(), 300);
  } else {
    console.error(`[Dashboard] Error al eliminar pestaña ${tid}:`, response);
    renderDashboard(); // Refresh en caso de error
  }
}

async function navigateToTab(tabId, tab) {
  if (tab.state === 'ACTIVE') {
    // Verificar que la pestaña aún existe
    if (!(await tabExists(tabId))) {
      console.warn(`[Dashboard] Pestaña ${tabId} ya no existe, refrescando dashboard`);
      renderDashboard();
      return;
    }
    
    try {
      await chrome.tabs.update(Number(tabId), { active: true });
      await chrome.windows.update(Number(tab.windowId), { focused: true });
      console.log(`[Dashboard] Navegado a pestaña activa ${tabId}`);
    } catch (err) {
      console.warn(`[Dashboard] Error al navegar a pestaña ${tabId}:`, err);
      renderDashboard(); // Refresh para limpiar pestañas inexistentes
    }
  } else {
    await restoreTab(tabId);
  }
}

function toggleWindowExpansion(wid) {
  const isExpanded = appState.expandedWindows.has(wid);
  const card = document.querySelector(`[data-window-id="${wid}"]`);
  const body = card?.querySelector('.card-body');
  if (!card || !body) return;

  if (isExpanded) {
    body.style.display = 'none';
    appState.expandedWindows.delete(wid);
  } else {
    body.style.display = 'block';
    appState.expandedWindows.add(wid);

    if (body.children.length === 0) {
      populateWindowTabsById(wid, body);
    }
    adjustBodyHeight(body);
  }
}

async function populateWindowTabsById(wid, body) {
  const { tabs = {} } = await store.get(['tabs']);
  const windowTabs = Object.entries(tabs).filter(([, tab]) => tab.windowId === wid);
  populateWindowTabs(body, windowTabs);
  adjustBodyHeight(body);
}

async function suspendAllInWindow(wid) {
  const { tabs = {} } = await store.get(['tabs']);
  const windowTabs = Object.entries(tabs)
    .filter(([, tab]) => tab.windowId === wid && tab.state === 'ACTIVE');
  
  for (const [tabId] of windowTabs) {
    await suspendTab(tabId);
    // Pequeña pausa para evitar saturar el sistema
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function restoreAllInWindow(wid) {
  const { tabs = {} } = await store.get(['tabs']);
  const windowTabs = Object.entries(tabs)
    .filter(([, tab]) => tab.windowId === wid && tab.state === 'SUSPENDED');
  
  for (const [tabId] of windowTabs) {
    await restoreTab(tabId);
    // Pequeña pausa para evitar saturar el sistema
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/* ═════════════ EVENT LISTENERS SIN INLINE ═════════════ */

// Usar delegación de eventos más robusta
document.addEventListener('click', async (e) => {
  const target = e.target;
  
  // SUSPENDER PESTAÑA
  if (target.closest('.suspend-icon')) {
    e.preventDefault();
    e.stopPropagation();
    const tid = target.closest('.suspend-icon').dataset.tid;
    if (tid) {
      await suspendTab(tid);
    }
    return;
  }
  
  // RESTAURAR PESTAÑA
  if (target.closest('.restore-icon')) {
    e.preventDefault();
    e.stopPropagation();
    const tid = target.closest('.restore-icon').dataset.tid;
    if (tid) {
      await restoreTab(tid);
    }
    return;
  }
  
  // ELIMINAR PESTAÑA
  if (target.closest('.delete-icon')) {
    e.preventDefault();
    e.stopPropagation();
    const tid = target.closest('.delete-icon').dataset.tid;
    if (tid) {
      await deleteTab(tid);
    }
    return;
  }
  
  // ACCIONES DE VENTANA
  if (target.closest('.window-action')) {
    const windowAction = target.closest('.window-action');
    const action = windowAction.dataset.action;
    const wid = windowAction.dataset.window;
    
    e.preventDefault();
    e.stopPropagation();
    
    switch (action) {
      case 'focus':
        try {
          await chrome.windows.update(Number(wid), { focused: true });
          console.log(`[Dashboard] Ventana ${wid} enfocada`);
        } catch (err) {
          console.warn(`[Dashboard] Error al enfocar ventana ${wid}:`, err);
        }
        break;
      case 'suspend-all':
        if (confirm('¿Suspender todas las pestañas activas de esta ventana?')) {
          await suspendAllInWindow(wid);
        }
        break;
      case 'restore-all':
        if (confirm('¿Restaurar todas las pestañas suspendidas de esta ventana?')) {
          await restoreAllInWindow(wid);
        }
        break;
    }
    return;
  }
  
  
  // CHECKBOX
  if (target.classList.contains('custom-checkbox')) {
    e.preventDefault();
    e.stopPropagation();
    target.classList.toggle('checked');
    
    const windowId = target.dataset.window;
    const tabId = target.dataset.tab;
    
    if (windowId) {
      if (appState.selectedWindows.has(windowId)) {
        appState.selectedWindows.delete(windowId);
      } else {
        appState.selectedWindows.add(windowId);
      }
    }
    
    if (tabId) {
      if (appState.selectedTabs.has(tabId)) {
        appState.selectedTabs.delete(tabId);
      } else {
        appState.selectedTabs.add(tabId);
      }
    }
    return;
  }
  
  // CLICK EN HEADER DE VENTANA
  if (target.closest('.card-header') && !target.closest('.window-actions') && !target.closest('.custom-checkbox')) {
    const wid = target.closest('.card-header').dataset.windowId;
    if (wid) {
      toggleWindowExpansion(wid);
    }
    return;
  }
  
  // CLICK EN PESTAÑA (NAVEGAR)
  if (target.closest('.tab-item') && !target.closest('.custom-checkbox') && !target.closest('.tab-actions')) {
    const tabItem = target.closest('.tab-item');
    const tabId = tabItem.dataset.tabId;
    if (tabId) {
      const { tabs = {} } = await store.get(['tabs']);
      const tab = tabs[tabId];
      if (tab) {
        await navigateToTab(tabId, tab);
      }
    }
    return;
  }
});

/* ═════════════ BÚSQUEDA EN TIEMPO REAL ══════════ */
document.getElementById('search').addEventListener('input', async (e) => {
  const q = e.target.value.trim().toLowerCase();
  const out = document.getElementById('results'); 
  out.innerHTML = '';
  if (!q) return;

  const { tabs = {} } = await store.get(['tabs']);
  const hits = Object.entries(tabs).filter(([, t]) =>
    (t.title && t.title.toLowerCase().includes(q)) ||
    (t.url && t.url.toLowerCase().includes(q))
  );
  
  if (hits.length > 0) {
    out.innerHTML = hits.map(([tabId, t]) => `
      <div class="search-result" data-tab-id="${tabId}">
        <span class="status-indicator">${t.state === 'ACTIVE' ? '🟢' : '⚫'}</span>
        <div class="tab-text">
          <div class="tab-title"><strong>${t.title || '(sin título)'}</strong></div>
          <div class="tab-url">${t.url}</div>
        </div>
      </div>
    `).join('');
  } else {
    out.innerHTML = '<div class="no-results">Sin resultados para la búsqueda.</div>';
  }
});

// Click en resultados de búsqueda
document.getElementById('results').addEventListener('click', async (e) => {
  const result = e.target.closest('.search-result');
  if (result) {
    const tabId = result.dataset.tabId;
    const { tabs = {} } = await store.get(['tabs']);
    const tab = tabs[tabId];
    if (tab) {
      await navigateToTab(tabId, tab);
    }
  }
});

/* ═════════════ TEMA CLARO / OSCURO ═════════════ */
const tBtn = document.getElementById('theme-toggle-btn');
const tIcon = document.getElementById('theme-icon');
const tLab = document.getElementById('theme-label');

function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  tIcon.innerHTML = '';
  tIcon.appendChild(createIcon(mode === 'dark' ? ICONS.moon : ICONS.sun));
  tLab.textContent = mode === 'dark' ? 'Oscuro' : 'Claro';
  tBtn.checked = mode === 'dark';
}

(async () => {
  const { userTheme } = await store.get(['userTheme']);
  const mode = userTheme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  setTheme(mode);
})();

tBtn.addEventListener('change', async () => {
  const next = tBtn.checked ? 'dark' : 'light';
  setTheme(next);
  await store.set({ userTheme: next });
});

/* ═════════════ BURGER MÓVIL ═════════════ */
document.getElementById('burger')
  .addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));

/* ═════════════ STORAGE CHANGE → repintar ═════════════ */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.windows || changes.tabs)) {
    setTimeout(() => renderDashboard(), 100);
  }
});

// Auto-refresh cada 30 segundos para mantener sincronización
setInterval(async () => {
  await cleanupInvalidTabs();
}, 30000);

/* Carga inicial */
window.addEventListener('DOMContentLoaded', renderDashboard);