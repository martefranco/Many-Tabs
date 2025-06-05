/* ──────────────────────────────────────────────────
   TAB SUSPENDER — Service Worker (Manifest V3) - CORREGIDO
   ──────────────────────────────────────────────────
   1  Configuración y helpers
   2  Instalación (alarma + menú)
   3  UI (icono·comandos·menú)
   4  Mensajes: SYNC_ALL | RESTORE_TAB - CORREGIDOS
   5  Alarma inactividad
   ────────────────────────────────────────────────── */

   import * as store from './storage.js';

   /* ═════════════ 1. CONFIGURACIÓN & HELPERS ═══════════ */
   const SUSPEND_MINUTES = 30;
   const ALARM_NAME = 'checkInactive';
   
   /* suspende pestaña ACTIVA */
   async function suspendTab(tab) {
     try {
       const { windows = {}, tabs = {} } = await store.get(['windows', 'tabs']);
       const wid = String(tab.windowId);
   
       windows[wid] ??= { alias: `Ventana ${wid}`, active: 0, suspended: 0, lastActive: Date.now() };
       windows[wid].active    = Math.max(0, (windows[wid].active || 1) - 1);
       windows[wid].suspended = (windows[wid].suspended || 0) + 1;
   
       tabs[String(tab.id)] = {
         windowId: wid, url: tab.url, title: tab.title, favIcon: tab.favIconUrl,
         lastVisit: Date.now(), state: 'SUSPENDED'
       };
   
       await store.set({ windows, tabs });
   
       // Intentar cerrar la pestaña
       await chrome.tabs.remove(tab.id);
       console.info(`[TabSuspender] Pestaña ${tab.id} suspendida correctamente`);
       return true;
       
     } catch (err) { 
       console.error(`[TabSuspender] Error al suspender pestaña ${tab.id}:`, err);
       return false;
     }
   }
   
   /* restaura pestaña SUSPENDIDA */
  async function restoreTab(tid) {
    try {
      const { windows = {}, tabs = {} } = await store.get(['windows', 'tabs']);
      const t = tabs[tid];
      if (!t || t.state !== 'SUSPENDED') {
        console.warn(`[TabSuspender] Pestaña ${tid} no encontrada o no está suspendida`);
        return false;
      }

      let win, createdNewWindow = false, newTab;
      
      // Intentar obtener la ventana original
      try {
        win = await chrome.windows.get(Number(t.windowId));
      } catch {
        // La ventana ya no existe, crear nueva
        try {
          win = await chrome.windows.create({ url: t.url });
          createdNewWindow = true;
          newTab = win.tabs && win.tabs[0];
        } catch (err) {
          console.error(`[TabSuspender] Error al crear ventana para restaurar pestaña ${tid}:`, err);
          return false;
        }
      }

      // Solo crear la pestaña si NO acabamos de crear la ventana
      if (!createdNewWindow) {
        try {
          newTab = await chrome.tabs.create({ windowId: win.id, url: t.url });
        } catch (err) {
          console.error(`[TabSuspender] Error al crear pestaña en ventana existente:`, err);
          return false;
        }
      }

      // Si se creó una nueva ventana, actualiza el windowId de la pestaña
      if (createdNewWindow) {
        t.windowId = String(win.id);
        if (!windows[t.windowId]) {
          windows[t.windowId] = { alias: `Ventana ${t.windowId}`, active: 0, suspended: 0, lastActive: Date.now() };
        }
      }

      // Actualiza contadores y estado
      const w = windows[t.windowId] ?? windows[String(win.id)];
      if (w) {
        w.suspended = Math.max(0, (w.suspended || 1) - 1);
        w.active = (w.active || 0) + 1;
      }
      
      // Eliminar la entrada con el viejo ID y registrar la nueva pestaña
      delete tabs[tid];
      tabs[String(newTab.id)] = {
        windowId: String(newTab.windowId),
        url: newTab.url,
        title: newTab.title,
        favIcon: newTab.favIconUrl,
        lastVisit: Date.now(),
        state: 'ACTIVE'
      };
      restoreIgnore.add(newTab.id);

      await store.set({ windows, tabs });
      console.info(`[TabSuspender] Pestaña ${tid} restaurada como ${newTab.id}`);
      return true;
      
    } catch (err) {
      console.error(`[TabSuspender] Error al restaurar pestaña ${tid}:`, err);
      return false;
    }
  }

   async function deleteTab(tid){
     try {
       const { windows={}, tabs={} } = await store.get(['windows','tabs']);
       const t = tabs[tid];
       if (!t) {
         console.warn(`[TabSuspender] Pestaña ${tid} no encontrada para eliminar`);
         return false;
       }
  
       /* 1 ▸ ACTIVA ⇒ cerrar pestaña real */
       if (t.state === 'ACTIVE'){
         try{ 
           await chrome.tabs.remove(Number(tid)); 
           console.info(`[TabSuspender] Pestaña activa ${tid} cerrada`);
         }catch{
           console.warn(`[TabSuspender] Pestaña activa ${tid} ya estaba cerrada`);
         }
         const w = windows[t.windowId];
         if (w) w.active = Math.max(0,(w.active||1)-1);
       }
  
       /* 2 ▸ SUSPENDIDA ⇒ sólo borrar registro + contador */
       if (t.state === 'SUSPENDED'){
         const w = windows[t.windowId];
         if (w) w.suspended = Math.max(0,(w.suspended||1)-1);
         console.info(`[TabSuspender] Registro de pestaña suspendida ${tid} eliminado`);
       }
  
       /* 3 ▸ elimina entrada y guarda */
       delete tabs[tid];
       await store.set({ windows, tabs });
       console.info(`[TabSuspender] Pestaña ${tid} eliminada del sistema`);
       return true;
       
     } catch (err) {
       console.error(`[TabSuspender] Error al eliminar pestaña ${tid}:`, err);
       return false;
     }
  }
  
   
   /* ═════════════ 2. INSTALACIÓN ═════════════ */
   chrome.runtime.onInstalled.addListener(() => {
     chrome.alarms.create(ALARM_NAME,{ periodInMinutes:SUSPEND_MINUTES });
     chrome.contextMenus.create({ id:'suspend-tab', title:'Suspender pestaña', contexts:['page'] });
     console.info('[TabSuspender] Extensión instalada y configurada');
   });
   
   /* renueva alarma al despertar el SW */
   chrome.alarms.create(ALARM_NAME,{ periodInMinutes:SUSPEND_MINUTES });
   
   /* ═════════════ 3. UI (icono · comandos · menú) ══════ */
   chrome.action.onClicked.addListener(async()=>{
     const url = chrome.runtime.getURL('dashboard.html');
     
     try {
       // Buscar en todas las pestañas
       const tabs = await chrome.tabs.query({ url });
       
       if (tabs.length > 0) {
         // Encontró el dashboard ya abierto
         const dashboardTab = tabs[0];
         try {
           // Activar la pestaña del dashboard
           await chrome.tabs.update(dashboardTab.id, { active: true });
           // Enfocar la ventana que contiene el dashboard
           await chrome.windows.update(dashboardTab.windowId, { focused: true });
           console.info('[TabSuspender] Dashboard enfocado');
         } catch (err) {
           console.error('[TabSuspender] Error al enfocar dashboard:', err);
           // Si hay error, crear una nueva pestaña
           chrome.tabs.create({ url });
         }
       } else {
         // No encontró el dashboard, crear nueva pestaña
         chrome.tabs.create({ url });
         console.info('[TabSuspender] Dashboard creado');
       }
     } catch (err) {
       console.error('[TabSuspender] Error en action click:', err);
       chrome.tabs.create({ url });
     }
   });
   
   chrome.commands.onCommand.addListener(async(cmd,tab)=>{
     if (cmd==='open-control-panel') {
       const url = chrome.runtime.getURL('dashboard.html');
       try {
         const tabs = await chrome.tabs.query({ url });
         
         if (tabs.length > 0) {
           const dashboardTab = tabs[0];
           try {
             await chrome.tabs.update(dashboardTab.id, { active: true });
             await chrome.windows.update(dashboardTab.windowId, { focused: true });
           } catch {
             chrome.tabs.create({ url });
           }
         } else {
           chrome.tabs.create({ url });
         }
       } catch {
         chrome.tabs.create({ url });
       }
     }
     if (cmd==='suspend-current-tab' && tab?.id) {
       await suspendTab(tab);
     }
   });
   
   chrome.contextMenus.onClicked.addListener(async (info,tab)=>{
     if (info.menuItemId==='suspend-tab' && tab) {
       await suspendTab(tab);
     }
   });

   /* ═════════════  LISTENERS LIVE-SYNC  ═════════════ */

/* 1️⃣  TAB creada */
const restoreIgnore = new Set();

chrome.tabs.onCreated.addListener(async tab => {
  if (restoreIgnore.has(tab.id)) {
    restoreIgnore.delete(tab.id);
    return; // Skip processing, handled during restore
  }

  try {
    const { windows={}, tabs={} } = await store.get(['windows','tabs']);

    const wid = String(tab.windowId);
    windows[wid] ??= { alias:`Ventana ${wid}`, active:0, suspended:0, lastActive:Date.now() };
    windows[wid].active++;

    tabs[String(tab.id)] = {
      windowId: wid, url:tab.url, title:tab.title, favIcon:tab.favIconUrl,
      lastVisit: Date.now(), state:'ACTIVE'
    };

    store.queueWrite({ windows, tabs });
    await store.set({ windows, tabs });
  } catch (err) {
    console.error(`[TabSuspender] Error en onCreated para pestaña ${tab.id}:`, err);
  }
});

/* 2️⃣  TAB eliminada (cerrada) */
chrome.tabs.onRemoved.addListener(async (tabId, info) => {
  try {
    const { windows = {}, tabs = {} } = await store.get(['windows', 'tabs']);
    const t = tabs[tabId];
    if (!t) return; // nada registrado

    const w = windows[t.windowId];
    // Solo elimina del modelo si estaba activa
    if (t.state === 'ACTIVE' && w) {
      w.active = Math.max(0, (w.active || 1) - 1);
      delete tabs[tabId];
      // Si tras eliminar la pestaña no quedan pestañas en la ventana, elimina la ventana del modelo
      const quedanEnVentana = Object.values(tabs).some(tab => tab.windowId === t.windowId && tabId !== String(tabId));
      if (!quedanEnVentana) {
        delete windows[t.windowId];
      }
    }
    // Si está suspendida, no la borres ni ajustes contadores
    store.queueWrite({ windows, tabs });
    await store.set({ windows, tabs });
  } catch (err) {
    console.error(`[TabSuspender] Error en onRemoved para pestaña ${tabId}:`, err);
  }
});

/* 3️⃣  VENTANA cerrada: borra su registro y las pestañas que queden */
chrome.windows.onRemoved.addListener(async winId => {
  try {
    const { windows={}, tabs={} } = await store.get(['windows','tabs']);
    const wid = String(winId);

    delete windows[wid];
    for (const [id, t] of Object.entries(tabs)){
      if (t.windowId === wid) delete tabs[id];
    }
    store.queueWrite({ windows, tabs });
    await store.set({ windows, tabs });
  } catch (err) {
    console.error(`[TabSuspender] Error en onRemoved para ventana ${winId}:`, err);
  }
});

/* 4️⃣  TAB actualizada (navegación, título, favicon) */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Solo nos interesa cuando cambia la URL, el título o el favicon
  if (!changeInfo.url && !changeInfo.title && !changeInfo.favIconUrl) return;

  try {
    const { windows = {}, tabs: allTabs = {} } = await store.get(['windows', 'tabs']);
    const t = allTabs[String(tabId)];
    if (!t) return; // Solo actualiza si ya está registrado

    // Actualiza solo los campos que hayan cambiado
    if (changeInfo.url)        t.url    = changeInfo.url;
    if (changeInfo.title)      t.title  = changeInfo.title;
    if (changeInfo.favIconUrl) t.favIcon = changeInfo.favIconUrl;
    t.lastVisit = Date.now();

    allTabs[String(tabId)] = t;
    store.queueWrite({ tabs: allTabs });
    await store.set({ tabs: allTabs });
  } catch (err) {
    console.error(`[TabSuspender] Error en onUpdated para pestaña ${tabId}:`, err);
  }
});

   
   /* ═════════════ 4. MENSAJES ASÍNCRONOS CORREGIDOS ═ */
   chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
     console.info(`[TabSuspender] Mensaje recibido: ${msg.action}`);
     
     // Manejar cada acción de forma asíncrona
     (async () => {
       try {
         let result;
         
         switch (msg.action) {
           case 'SYNC_ALL':
             await handleSyncAll();
             result = { ok: true };
             break;
             
           case 'RESTORE_TAB':
             const restoreSuccess = await restoreTab(msg.tid);
             result = { ok: restoreSuccess };
             break;
             
           case 'DELETE_TAB':
             const deleteSuccess = await deleteTab(msg.tid);
             result = { ok: deleteSuccess };
             break;
             
           case 'SUSPEND_TAB':
             const tabId = Number(msg.tid);
             try {
               const tab = await chrome.tabs.get(tabId);
               const suspendSuccess = await suspendTab(tab);
               result = { ok: suspendSuccess };
             } catch (err) {
               console.error(`[TabSuspender] Error al obtener pestaña ${tabId}:`, err);
               result = { ok: false, error: 'Tab not found' };
             }
             break;
             
           default:
             console.warn(`[TabSuspender] Acción desconocida: ${msg.action}`);
             result = { ok: false, error: 'Unknown action' };
         }
         
         console.info(`[TabSuspender] Enviando respuesta para ${msg.action}:`, result);
         sendResponse(result);
         
       } catch (error) {
         console.error(`[TabSuspender] Error procesando mensaje ${msg.action}:`, error);
         const errorResult = { ok: false, error: error.message };
         console.info(`[TabSuspender] Enviando respuesta de error para ${msg.action}:`, errorResult);
         sendResponse(errorResult);
       }
     })();
     
     // Retornar true para mantener el canal de respuesta abierto
     return true;
   });
   
   /* ------- SYNC_ALL helper ------- */
   async function handleSyncAll() {
     try {
       await store.set({ windows:{}, tabs:{} });          // limpia
       const winData = {};  const tabData = {};
       const wins = await chrome.windows.getAll({ populate:true });
   
       for (const win of wins){
         const wid = String(win.id);
         winData[wid] = { alias:`Ventana ${wid}`,active:win.tabs.length,suspended:0,lastActive:Date.now()};
         for (const tab of win.tabs){
           tabData[String(tab.id)] = {
             windowId:wid,url:tab.url,title:tab.title,favIcon:tab.favIconUrl,
             lastVisit:Date.now(),state:'ACTIVE'
           };
         }
       }
       await store.set({ windows:winData, tabs:tabData });
       console.info('[TabSuspender] Sincronización completa');
     } catch (err) {
       console.error('[TabSuspender] Error en sincronización:', err);
       throw err;
     }
   }
   
   /* ═════════════ 5. ALARMA AUTO-SUSPENSIÓN ════════ */
   chrome.alarms.onAlarm.addListener(async alarm=>{
     if (alarm.name!==ALARM_NAME) return;
   
     try {
       const { windows={}, tabs={} } = await store.get(['windows','tabs']);
       const now = Date.now(), threshold = SUSPEND_MINUTES*60*1000;
       let dirty=false, suspendedCount = 0;
   
       for (const [tid,t] of Object.entries(tabs)){
         if (t.state==='ACTIVE' && now-t.lastVisit>threshold){
           try{ 
             await chrome.tabs.remove(Number(tid)); 
             const w = windows[t.windowId];
             if (w){ 
               w.active=Math.max(0,(w.active||1)-1); 
               w.suspended=(w.suspended||0)+1; 
             }
             t.state='SUSPENDED'; 
             dirty=true;
             suspendedCount++;
           }catch{
             console.warn(`[TabSuspender] No se pudo auto-suspender pestaña ${tid}`);
             continue;
           }
         }
       }
     
       if (dirty){ 
         await store.set({ windows, tabs }); 
         console.info(`[TabSuspender] Auto-suspensión completada: ${suspendedCount} pestañas suspendidas`); 
       }
     } catch (err) {
       console.error('[TabSuspender] Error en auto-suspensión:', err);
     }
   });
   
   console.info('[TabSuspender] Service worker listo');