/* ──────────────────────────────────────────────────
   TAB SUSPENDER — Service Worker (Manifest V3)
   ──────────────────────────────────────────────────
   1  Configuración y helper
   2  Instalación (alarma + menú)
   3  UI (icono·comandos·menú)
   4  Mensajes: SYNC_ALL  | RESTORE_TAB
   5  Alarma inactividad
   ────────────────────────────────────────────────── */

   import * as store from './storage.js';

   /* ═════════════ 1. CONFIGURACIÓN & HELPERS ═══════════ */
   const SUSPEND_MINUTES = 600;
   const ALARM_NAME      = 'checkInactive';
   
   /* suspende pestaña ACTIVA */
   async function suspendTab(tab) {
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
   
     try { await chrome.tabs.remove(tab.id); } catch { return; }
   
     console.info(`[TabSuspender] Pestaña ${tab.id} suspendida`);
   }
   
   /* restaura pestaña SUSPENDIDA */
   async function restoreTab(tid) {
     const { windows = {}, tabs = {} } = await store.get(['windows', 'tabs']);
     const t = tabs[tid];
     if (!t || t.state !== 'SUSPENDED') return false;
   
     let win, createdNewWindow = false;
     try {
       win = await chrome.windows.get(Number(t.windowId));
     } catch {
       win = await chrome.windows.create({ url: t.url });
       createdNewWindow = true;
     }
   
     // Solo crear la pestaña si NO acabamos de crear la ventana (porque Chrome ya la abrió)
     if (!createdNewWindow) {
       await chrome.tabs.create({ windowId: win.id, url: t.url });
     }
   
     // Si se creó una nueva ventana, actualiza el windowId de la pestaña y crea el registro de la ventana si no existe
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
     t.state = 'ACTIVE'; t.lastVisit = Date.now();
   
     await store.set({ windows, tabs });
     return true;
   }
   async function deleteTab(tid){
    const { windows={}, tabs={} } = await store.get(['windows','tabs']);
    const t = tabs[tid];
    if (!t) return false;
  
    /* 1 ▸ ACTIVA ⇒ cerrar pestaña real */
    if (t.state === 'ACTIVE'){
      try{ await chrome.tabs.remove(Number(tid)); }catch{/* ya cerrada */ }
      const w = windows[t.windowId];
      if (w) w.active = Math.max(0,(w.active||1)-1);
    }
  
    /* 2 ▸ SUSPENDIDA ⇒ sólo borrar registro + contador */
    if (t.state === 'SUSPENDED'){
      const w = windows[t.windowId];
      if (w) w.suspended = Math.max(0,(w.suspended||1)-1);
    }
  
    /* 3 ▸ elimina entrada y guarda */
    delete tabs[tid];
    await store.set({ windows, tabs });
    console.info(`[TabSuspender] Pestaña ${tid} eliminada`);
    return true;
  }
  
   
   /* ═════════════ 2. INSTALACIÓN ═════════════ */
   chrome.runtime.onInstalled.addListener(() => {
     chrome.alarms.create(ALARM_NAME,{ periodInMinutes:SUSPEND_MINUTES });
     chrome.contextMenus.create({ id:'suspend-tab', title:'Suspender pestaña', contexts:['page'] });
   });
   
   /* renueva alarma al despertar el SW */
   chrome.alarms.create(ALARM_NAME,{ periodInMinutes:SUSPEND_MINUTES });
   
   /* ═════════════ 3. UI (icono · comandos · menú) ══════ */
   chrome.action.onClicked.addListener(async()=>{
     const url = chrome.runtime.getURL('dashboard.html');
     const [tab] = await chrome.tabs.query({ url });
     tab ? chrome.tabs.update(tab.id,{active:true}) : chrome.tabs.create({url});
   });
   
   chrome.commands.onCommand.addListener(async(cmd,tab)=>{
     if (cmd==='open-control-panel') {
       const url = chrome.runtime.getURL('dashboard.html');
       const [t] = await chrome.tabs.query({ url });
       t ? chrome.tabs.update(t.id,{active:true}) : chrome.tabs.create({url});
     }
     if (cmd==='suspend-current-tab' && tab?.id) suspendTab(tab);
   });
   
   chrome.contextMenus.onClicked.addListener((info,tab)=>{
     if (info.menuItemId==='suspend-tab' && tab) suspendTab(tab);
   });

   /* ═════════════  LISTENERS LIVE-SYNC  ═════════════ */

/* 1️⃣  TAB creada */
chrome.tabs.onCreated.addListener(async tab => {
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
});

/* 2️⃣  TAB eliminada (cerrada) */
chrome.tabs.onRemoved.addListener(async (tabId, info) => {
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
});

/* 3️⃣  VENTANA cerrada: borra su registro y las pestañas que queden */
chrome.windows.onRemoved.addListener(async winId => {
  const { windows={}, tabs={} } = await store.get(['windows','tabs']);
  const wid = String(winId);

  delete windows[wid];
  for (const [id, t] of Object.entries(tabs)){
    if (t.windowId === wid) delete tabs[id];
  }
  store.queueWrite({ windows, tabs });
  await store.set({ windows, tabs });
});

/* 4️⃣  TAB actualizada (navegación, título, favicon) */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Solo nos interesa cuando cambia la URL, el título o el favicon
  if (!changeInfo.url && !changeInfo.title && !changeInfo.favIconUrl) return;

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
});

   
   /* ═════════════ 4. MENSAJES (SYNC_ALL | RESTORE_TAB) ═ */
   chrome.runtime.onMessage.addListener(async(msg,_src,sendResponse)=>{
     if (msg.action === 'SYNC_ALL') {
       await handleSyncAll(); sendResponse({ok:true}); return true;
     }
     if (msg.action === 'RESTORE_TAB') {
       const ok = await restoreTab(msg.tid); sendResponse({ok}); return true;
     }
     if (msg.action === 'DELETE_TAB') {
      const ok = await deleteTab(msg.tid);
      sendResponse({ ok }); return true;
    }
    if (msg.action === 'SUSPEND_TAB') {
      const tabId = Number(msg.tid);
      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
      } catch {
        sendResponse({ ok: false }); return true;
      }
      await suspendTab(tab);
      sendResponse({ ok: true }); return true;
    }
   });
   
   /* ------- SYNC_ALL helper ------- */
   async function handleSyncAll() {
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
   }
   
   /* ═════════════ 5. ALARMA AUTO-SUSPENSIÓN ════════ */
   chrome.alarms.onAlarm.addListener(async alarm=>{
     if (alarm.name!==ALARM_NAME) return;
   
     const { windows={}, tabs={} } = await store.get(['windows','tabs']);
     const now = Date.now(), threshold = SUSPEND_MINUTES*60*1000;
     let dirty=false;
   
     for (const [tid,t] of Object.entries(tabs)){
       if (t.state==='ACTIVE' && now-t.lastVisit>threshold){
         try{ await chrome.tabs.remove(Number(tid)); }catch{continue;}
         const w = windows[t.windowId];
         if (w){ w.active=Math.max(0,(w.active||1)-1); w.suspended=(w.suspended||0)+1; }
         t.state='SUSPENDED'; dirty=true;
       }
     }
     if (dirty){ await store.set({ windows, tabs }); console.info('[TabSuspender] Auto-suspensión completada'); }
   });
   
   console.info('[TabSuspender] Service worker listo');
   