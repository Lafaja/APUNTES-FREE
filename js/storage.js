// ===== GLOBAL TABLET RESILIENCE & ERROR CAPTURE =====
window.addEventListener('error', (e) => {
  console.warn("Global JS notice:", e.message || e.error, "at line", e.lineno || '?');
});

window.addEventListener('unhandledrejection', (e) => {
  console.warn("Unhandled Async notice:", e && e.reason);
});

// ===== PWA INSTALLATION & DESKTOP SHORTCUT ENGINE =====
let deferredPrompt = null;
let deferredInstallPrompt = null; // Alias de compatibilidad

function mostrarToast(msg, type = 'info') {
  if (typeof showToast === 'function') {
    showToast(msg, type);
  }
}

function isAppInStandaloneMode() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

function actualizarBotonInstalacion(disponible = false) {
  const btnInstalar = document.getElementById('btn-instalar-app');
  const installedIndicator = document.getElementById('pwa-installed-indicator');
  const btnLegacy = document.getElementById('btn-install-pwa');

  const isStandalone = isAppInStandaloneMode();

  if (btnInstalar) {
    if (isStandalone) {
      btnInstalar.style.display = 'none';
      if (installedIndicator) installedIndicator.style.display = 'inline-flex';
    } else {
      // Mostrar el botón para permitir instalación nativa o guiar al usuario
      btnInstalar.style.display = 'inline-flex';
      if (installedIndicator) installedIndicator.style.display = 'none';
    }
  }

  if (btnLegacy) {
    if (isStandalone) {
      btnLegacy.classList.add('installed');
      btnLegacy.disabled = true;
      btnLegacy.innerHTML = '<span>✓ Aplicación ya instalada</span>';
    } else if (deferredPrompt) {
      btnLegacy.classList.remove('installed');
      btnLegacy.disabled = false;
      btnLegacy.innerHTML = '<span class="pwa-btn-icon">⬇️</span><span class="pwa-btn-text">Instalar aplicación en el escritorio</span>';
    } else {
      btnLegacy.classList.remove('installed');
      btnLegacy.disabled = false;
      btnLegacy.innerHTML = '<span class="pwa-btn-icon">📲</span><span class="pwa-btn-text">Instalar / Crear Acceso Directo</span>';
    }
  }

  const pwaBanner = document.getElementById('pwa-direct-banner');
  if (pwaBanner) {
    pwaBanner.style.display = deferredPrompt ? 'flex' : 'none';
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  deferredInstallPrompt = e;
  actualizarBotonInstalacion(true);
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  deferredInstallPrompt = null;
  actualizarBotonInstalacion(false);
  mostrarToast("¡Aplicación instalada con éxito en el escritorio!", "success");
});

function downloadWindowsUrlShortcut() {
  const currentUrl = window.location.href;
  const shortcutContent = `[InternetShortcut]\r\nURL=${currentUrl}\r\nIconIndex=0\r\n`;
  const blob = new Blob([shortcutContent], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Tablet Studio.url';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
  mostrarToast("¡Acceso directo (.url) descargado! Muévelo a tu escritorio.", "success");
}

function downloadWindowsBatLauncher() {
  const isFile = window.location.protocol === 'file:';
  const target = isFile ? '%~dp0index.html' : window.location.href;
  const batContent = `@echo off\r\ntitle Tablet Studio\r\necho Iniciando Tablet Studio en modo aplicacion...\r\nstart msedge --app="${target}" 2>nul || start chrome --app="${target}" 2>nul || start "" "${target}"\r\nexit\r\n`;
  const blob = new Blob([batContent], { type: 'application/x-bat' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Tablet Studio (Lanzador App).bat';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
  mostrarToast("¡Lanzador (.bat) descargado! Se ejecutará en modo app sin bordes.", "success");
}

function switchInstallDeviceTab(tabKey) {
  document.querySelectorAll('.device-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabKey);
  });
  document.querySelectorAll('.device-panel-content').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-install-${tabKey}`);
  });
}

function openShortcutModal(preferredTab = null) {
  const modal = document.getElementById('modal-install-shortcut');
  if (!modal) return;

  const ua = navigator.userAgent || '';
  let defaultTab = 'android';
  if (/Android/i.test(ua)) {
    defaultTab = 'android';
  } else if (/iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    defaultTab = 'ipad';
  } else {
    defaultTab = 'windows';
  }

  switchInstallDeviceTab(preferredTab || defaultTab);

  const pwaBanner = document.getElementById('pwa-direct-banner');
  if (pwaBanner) {
    pwaBanner.style.display = deferredPrompt ? 'flex' : 'none';
  }

  modal.classList.add('open');
}

function closeShortcutModal() {
  const modal = document.getElementById('modal-install-shortcut');
  if (modal) modal.classList.remove('open');
}

async function triggerPwaInstall() {
  if (isAppInStandaloneMode()) {
    mostrarToast('La aplicación ya está instalada y ejecutándose en modo autónomo.', 'info');
    return;
  }

  if (deferredPrompt) {
    deferredPrompt.prompt();
    try {
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        deferredPrompt = null;
        deferredInstallPrompt = null;
        actualizarBotonInstalacion(false);
        mostrarToast("¡Aplicación instalada con éxito en el escritorio!", "success");
        return;
      }
    } catch (err) {
      console.warn('Error en userChoice:', err);
    }
  }

  // Abre el modal interactivo con instrucciones visuales y generador de accesos directos
  openShortcutModal();
}

// ===== PDF.JS ROBUST LOCAL ENGINE & BINARY NORMALIZER =====
function arrayBufferToBase64(buffer) {
  if (!buffer) return '';
  try {
    let binary = '';
    const bytes = (buffer instanceof Uint8Array) ? buffer : new Uint8Array(buffer);
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
    }
    return btoa(binary);
  } catch (e) {
    console.warn('Error convirtiendo buffer a base64:', e);
    return '';
  }
}

function normalizePdfBinaryData(raw) {
  if (!raw) return null;
  if (raw instanceof Uint8Array) {
    if (raw.byteLength === 0) return null;
    return new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  }
  if (raw instanceof ArrayBuffer) {
    if (raw.byteLength === 0) return null;
    return new Uint8Array(raw.slice(0));
  }
  if (ArrayBuffer.isView(raw)) {
    if (raw.byteLength === 0) return null;
    return new Uint8Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  }
  if (typeof raw === 'string') {
    try {
      let base64 = raw;
      if (base64.includes('base64,')) {
        base64 = base64.split('base64,')[1];
      }
      base64 = base64.trim().replace(/\s+/g, '');
      if (!base64) return null;
      const binaryStr = atob(base64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    } catch (e) {
      console.warn('Error decodificando base64 de PDF:', e);
      return null;
    }
  }
  if (raw && typeof raw === 'object') {
    if (raw.base64) {
      const b64Res = normalizePdfBinaryData(raw.base64);
      if (b64Res && b64Res.length > 0) return b64Res;
    }
    if (raw.arrayBuffer && raw.arrayBuffer.byteLength > 0) {
      const abRes = normalizePdfBinaryData(raw.arrayBuffer);
      if (abRes && abRes.length > 0) return abRes;
    }
    if (raw.data) {
      const dtRes = normalizePdfBinaryData(raw.data);
      if (dtRes && dtRes.length > 0) return dtRes;
    }
    if (raw.buffer && raw.buffer.byteLength > 0) {
      const bfRes = normalizePdfBinaryData(raw.buffer);
      if (bfRes && bfRes.length > 0) return bfRes;
    }
    if (raw.bytes) {
      const byRes = normalizePdfBinaryData(raw.bytes);
      if (byRes && byRes.length > 0) return byRes;
    }
  }
  return null;
}

function setupPdfWorkerSrc(lib) {
  if (!lib || !lib.GlobalWorkerOptions) return;
  try {
    if (window.PDF_WORKER_BLOB_URL) {
      lib.GlobalWorkerOptions.workerSrc = window.PDF_WORKER_BLOB_URL;
    } else if (window.PDF_WORKER_BASE64) {
      const binary = atob(window.PDF_WORKER_BASE64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/javascript' });
      window.PDF_WORKER_BLOB_URL = URL.createObjectURL(blob);
      lib.GlobalWorkerOptions.workerSrc = window.PDF_WORKER_BLOB_URL;
    } else {
      lib.GlobalWorkerOptions.workerSrc = './libs/pdf.worker.min.js';
    }
  } catch (err) {
    console.warn('Aviso configurando worker de PDF.js:', err);
  }
}

async function ensurePdfJsLib() {
  if (window.pdfjsLib) {
    setupPdfWorkerSrc(window.pdfjsLib);
    return window.pdfjsLib;
  }

  return new Promise((resolve) => {
    const s1 = document.createElement('script');
    s1.src = './libs/pdf.min.js';
    s1.onload = () => {
      if (window.pdfjsLib) {
        setupPdfWorkerSrc(window.pdfjsLib);
        resolve(window.pdfjsLib);
      } else {
        resolve(null);
      }
    };
    s1.onerror = () => {
      const s2 = document.createElement('script');
      s2.src = 'web-app/libs/pdf.min.js';
      s2.onload = () => {
        if (window.pdfjsLib) {
          setupPdfWorkerSrc(window.pdfjsLib);
          resolve(window.pdfjsLib);
        } else {
          resolve(null);
        }
      };
      s2.onerror = () => resolve(null);
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  });
}

if (window.pdfjsLib) {
  setupPdfWorkerSrc(window.pdfjsLib);
}

/**
 * Tablet Studio - File Manager & Handwritten Notes / PDF System
 * 100% Offline & Pure Web
 */

// ===== 1. UNIVERSAL STORAGE ENGINE (INDEXEDDB + LOCALSTORAGE + MEMORY FALLBACK) =====
const DB_NAME = 'TabletStudioAppDB';
const DB_VERSION = 5;
let db = null;
let useFallbackStorage = false;

// Memoria interna como red de seguridad
const memoryStore = {
  tablet_folders: [],
  tablet_items: [],
  tablet_handles: {}
};

function initDatabase() {
  return new Promise((resolve) => {
    try {
      if (!window.indexedDB) {
        console.warn('IndexedDB no está disponible en este entorno. Usando LocalStorage.');
        useFallbackStorage = true;
        return resolve(null);
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        try {
          const d = e.target.result;
          if (!d.objectStoreNames.contains('folders')) {
            const fStore = d.createObjectStore('folders', { keyPath: 'id' });
            fStore.createIndex('parentId', 'parentId', { unique: false });
          }
          if (!d.objectStoreNames.contains('items')) {
            const itemStore = d.createObjectStore('items', { keyPath: 'id' });
            itemStore.createIndex('parentId', 'parentId', { unique: false });
            itemStore.createIndex('type', 'type', { unique: false });
          }
          if (!d.objectStoreNames.contains('handles')) {
            d.createObjectStore('handles', { keyPath: 'key' });
          }
        } catch (upgErr) {
          console.warn('Error en upgrade de IndexedDB:', upgErr);
        }
      };

      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onerror = (err) => {
        console.warn('Error abriendo IndexedDB (posible file:/// o sandbox móvil). Activando Fallback LocalStorage:', err);
        useFallbackStorage = true;
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('IndexedDB bloqueado. Activando Fallback LocalStorage.');
        useFallbackStorage = true;
        resolve(null);
      };
    } catch (e) {
      console.warn('Excepción al inicializar IndexedDB (SecurityError en file:///):', e);
      useFallbackStorage = true;
      resolve(null);
    }
  });
}

// Helpers de LocalStorage seguro
function getLocalStorageData(key, defaultVal) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : (memoryStore[key] || defaultVal);
  } catch (e) {
    return memoryStore[key] || defaultVal;
  }
}

function setLocalStorageData(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    memoryStore[key] = val;
  }
}

// Persistencia del FileSystemDirectoryHandle (Carpeta Local de la Tablet)
async function dbSaveDirectoryHandle(handle) {
  if (handle && handle.name) {
    setLocalStorageData('tablet_device_dir_name', handle.name);
  }
  if (!useFallbackStorage && db) {
    try {
      return await new Promise((resolve) => {
        const tx = db.transaction('handles', 'readwrite');
        const store = tx.objectStore('handles');
        store.put({ key: 'device_dir_handle', handle });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch { resolve(false); }
  }
  return false;
}

async function dbGetDirectoryHandle() {
  if (!useFallbackStorage && db) {
    try {
      return await new Promise((resolve) => {
        const tx = db.transaction('handles', 'readonly');
        const store = tx.objectStore('handles');
        const req = store.get('device_dir_handle');
        req.onsuccess = () => resolve(req.result ? req.result.handle : null);
        req.onerror = () => resolve(null);
      });
    } catch { resolve(null); }
  }
  return null;
}

async function dbRemoveDirectoryHandle() {
  try {
    localStorage.removeItem('tablet_device_dir_name');
  } catch {}
  if (!useFallbackStorage && db) {
    try {
      return await new Promise((resolve) => {
        const tx = db.transaction('handles', 'readwrite');
        const store = tx.objectStore('handles');
        store.delete('device_dir_handle');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch { resolve(false); }
  }
  return false;
}

// Operaciones de Carpetas
async function dbGetFolders() {
  if (!useFallbackStorage && db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('folders', 'readonly');
        const store = tx.objectStore('folders');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(getLocalStorageData('tablet_folders', []));
      } catch {
        resolve(getLocalStorageData('tablet_folders', []));
      }
    });
  }
  return getLocalStorageData('tablet_folders', []);
}

// ===== GESTIÓN DE CARPETAS Y SUBDIRECTORIOS FÍSICOS (FILE SYSTEM ACCESS API) =====
async function verifyDirectoryPermission(dirHandle = state.deviceDirHandle, promptUser = true) {
  if (!dirHandle) return false;
  try {
    const opts = { mode: 'readwrite' };
    if (typeof dirHandle.queryPermission === 'function') {
      const status = await dirHandle.queryPermission(opts);
      if (status === 'granted') return true;
      if (promptUser && typeof dirHandle.requestPermission === 'function') {
        const reqStatus = await dirHandle.requestPermission(opts);
        return reqStatus === 'granted';
      }
    }
    return false;
  } catch (err) {
    console.warn('Error verificando permisos de directorio:', err);
    return false;
  }
}

function getFolderPath(folderId, allFolders = []) {
  const path = [];
  let curId = folderId;
  const visited = new Set();
  while (curId && !visited.has(curId)) {
    visited.add(curId);
    const f = allFolders.find(x => x.id === curId);
    if (!f) break;
    path.unshift(f);
    curId = f.parentId;
  }
  return path;
}

async function getDirectoryHandleForFolder(folderId) {
  if (!state.deviceDirHandle) return null;
  if (!folderId) return state.deviceDirHandle;

  if (state.folderHandles && state.folderHandles.has(folderId)) {
    const cached = state.folderHandles.get(folderId);
    try {
      if (cached && typeof cached.queryPermission === 'function') {
        const perm = await cached.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') return cached;
      }
    } catch {}
  }

  // Resolver jerarquía desde la raíz hacia abajo
  const allFolders = await dbGetFolders();
  const folderChain = getFolderPath(folderId, allFolders);
  let currentHandle = state.deviceDirHandle;

  for (const f of folderChain) {
    const cleanName = (f.name || 'Carpeta').replace(/[/\\?%*:|"<>]/g, '_');
    currentHandle = await currentHandle.getDirectoryHandle(cleanName, { create: true });
    if (state.folderHandles) {
      state.folderHandles.set(f.id, currentHandle);
    }
  }

  return currentHandle;
}

async function copyDirectoryEntries(sourceDir, destDir) {
  for await (const entry of sourceDir.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      const newFile = await destDir.getFileHandle(entry.name, { create: true });
      const writable = await newFile.createWritable();
      await writable.write(await file.arrayBuffer());
      await writable.close();
    } else if (entry.kind === 'directory') {
      const newSubDir = await destDir.getDirectoryHandle(entry.name, { create: true });
      await copyDirectoryEntries(entry, newSubDir);
    }
  }
}

async function dbCreateFolder(name, color = '#f59e0b', parentId = null, syncToDisk = true) {
  const folder = {
    id: `f_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name,
    color: color || '#f59e0b',
    parentId,
    createdAt: Date.now()
  };

  // 1. Creación física en disco con File System Access API
  if (syncToDisk && state.deviceDirHandle) {
    try {
      await verifyDirectoryPermission(state.deviceDirHandle, false);
      const parentHandle = await getDirectoryHandleForFolder(parentId);
      if (parentHandle) {
        const cleanName = name.replace(/[/\\?%*:|"<>]/g, '_');
        const subFolderHandle = await parentHandle.getDirectoryHandle(cleanName, { create: true });
        if (state.folderHandles) {
          state.folderHandles.set(folder.id, subFolderHandle);
        }
      }
    } catch (err) {
      console.warn('No se pudo crear la subcarpeta física en disco:', err);
    }
  }

  if (!useFallbackStorage && db) {
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('folders', 'readwrite');
        const store = tx.objectStore('folders');
        const req = store.add(folder);
        req.onsuccess = () => resolve(folder);
        req.onerror = () => reject(req.error);
      });
      return folder;
    } catch (e) {
      console.warn('Fallo guardando carpeta en IndexedDB, usando fallback:', e);
    }
  }

  const folders = getLocalStorageData('tablet_folders', []);
  folders.push(folder);
  setLocalStorageData('tablet_folders', folders);
  return folder;
}

async function dbRenameFolder(id, newName, newColor = null) {
  const allFolders = await dbGetFolders();
  const folder = allFolders.find(x => x.id === id);
  if (!folder) return;

  const oldName = folder.name;

  // 1. Renombrado en disco físico si cambió el nombre
  if (oldName !== newName && state.deviceDirHandle) {
    try {
      const parentHandle = await getDirectoryHandleForFolder(folder.parentId);
      if (parentHandle) {
        const oldCleanName = oldName.replace(/[/\\?%*:|"<>]/g, '_');
        const newCleanName = newName.replace(/[/\\?%*:|"<>]/g, '_');

        const oldSubHandle = await parentHandle.getDirectoryHandle(oldCleanName).catch(() => null);
        const newSubHandle = await parentHandle.getDirectoryHandle(newCleanName, { create: true });

        if (oldSubHandle) {
          await copyDirectoryEntries(oldSubHandle, newSubHandle);
          await parentHandle.removeEntry(oldCleanName, { recursive: true });
        }

        if (state.folderHandles) {
          state.folderHandles.set(folder.id, newSubHandle);
        }
      }
    } catch (err) {
      console.warn('Error renombrando carpeta física en disco:', err);
    }
  }

  if (!useFallbackStorage && db) {
    try {
      await new Promise((resolve) => {
        const tx = db.transaction('folders', 'readwrite');
        const store = tx.objectStore('folders');
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const f = getReq.result;
          if (f) {
            f.name = newName;
            if (newColor) f.color = newColor;
            store.put(f).onsuccess = () => resolve();
          } else { resolve(); }
        };
        getReq.onerror = () => resolve();
      });
      return;
    } catch {}
  }
  const folders = getLocalStorageData('tablet_folders', []);
  const f = folders.find(x => x.id === id);
  if (f) {
    f.name = newName;
    if (newColor) f.color = newColor;
    setLocalStorageData('tablet_folders', folders);
  }
}

async function dbMoveFolder(id, targetParentId) {
  const allFolders = await dbGetFolders();
  const folder = allFolders.find(x => x.id === id);
  const oldParentId = folder ? folder.parentId : null;

  // Si cambia de subcarpeta física en disco
  if (folder && oldParentId !== targetParentId && state.deviceDirHandle) {
    try {
      const cleanName = (folder.name || 'Carpeta').replace(/[/\\?%*:|"<>]/g, '_');
      const oldParentHandle = await getDirectoryHandleForFolder(oldParentId);
      const newParentHandle = await getDirectoryHandleForFolder(targetParentId);

      if (oldParentHandle && newParentHandle) {
        const oldSubDir = await oldParentHandle.getDirectoryHandle(cleanName).catch(() => null);
        const newSubDir = await newParentHandle.getDirectoryHandle(cleanName, { create: true });
        if (oldSubDir) {
          await copyDirectoryEntries(oldSubDir, newSubDir);
          await oldParentHandle.removeEntry(cleanName, { recursive: true });
        }
        if (state.folderHandles) {
          state.folderHandles.set(folder.id, newSubDir);
        }
      }
    } catch (err) {
      console.warn('Error moviendo carpeta física en disco:', err);
    }
  }

  if (!useFallbackStorage && db) {
    try {
      await new Promise((resolve) => {
        const tx = db.transaction('folders', 'readwrite');
        const store = tx.objectStore('folders');
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const f = getReq.result;
          if (f) {
            f.parentId = targetParentId;
            store.put(f).onsuccess = () => resolve();
          } else { resolve(); }
        };
        getReq.onerror = () => resolve();
      });
      return;
    } catch {}
  }
  const folders = getLocalStorageData('tablet_folders', []);
  const f = folders.find(x => x.id === id);
  if (f) {
    f.parentId = targetParentId;
    setLocalStorageData('tablet_folders', folders);
  }
}

async function dbDeleteFolder(id) {
  const allFolders = await dbGetFolders();
  const allItems = await dbGetItems();
  const folderToDelete = allFolders.find(f => f.id === id);

  const toDelete = new Set([id]);
  let added = true;
  while (added) {
    added = false;
    for (const f of allFolders) {
      if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
        toDelete.add(f.id);
        added = true;
      }
    }
  }

  // 1. Eliminación física en disco con File System Access API
  if (folderToDelete && state.deviceDirHandle) {
    try {
      await verifyDirectoryPermission(state.deviceDirHandle, false);
      const parentHandle = await getDirectoryHandleForFolder(folderToDelete.parentId);
      if (parentHandle) {
        const cleanName = (folderToDelete.name || 'Carpeta').replace(/[/\\?%*:|"<>]/g, '_');
        await parentHandle.removeEntry(cleanName, { recursive: true }).catch(() => {});
        if (cleanName !== folderToDelete.name) {
          await parentHandle.removeEntry(folderToDelete.name, { recursive: true }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('No se pudo eliminar la carpeta física en disco:', err);
    }
  }

  if (state.folderHandles) {
    toDelete.forEach(fId => state.folderHandles.delete(fId));
  }

  // 2. Limpieza inmediata del estado en memoria y selección reactiva
  state.folders = (state.folders || []).filter(f => !toDelete.has(f.id));
  state.items = (state.items || []).filter(i => !(i.parentId && toDelete.has(i.parentId)));
  toDelete.forEach(fId => {
    selectedItemIds.delete(fId);
    state.selectedItemIds.delete(fId);
    state.fmSelection.selectedFolders.delete(fId);
  });

  // 3. Persistencia en IndexedDB / LocalStorage
  if (!useFallbackStorage && db) {
    try {
      await new Promise((resolve) => {
        const tx = db.transaction(['folders', 'items'], 'readwrite');
        const fStore = tx.objectStore('folders');
        const iStore = tx.objectStore('items');
        toDelete.forEach(fId => fStore.delete(fId));
        allItems.forEach(item => {
          if (item.parentId && toDelete.has(item.parentId)) {
            iStore.delete(item.id);
          }
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {}
  }
  const remainingFolders = allFolders.filter(f => !toDelete.has(f.id));
  const remainingItems = allItems.filter(i => !(i.parentId && toDelete.has(i.parentId)));
  setLocalStorageData('tablet_folders', remainingFolders);
  setLocalStorageData('tablet_items', remainingItems);
}

// Operaciones de Archivos (Apuntes y PDFs)
async function dbGetItems() {
  if (!useFallbackStorage && db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('items', 'readonly');
        const store = tx.objectStore('items');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(getLocalStorageData('tablet_items', []));
      } catch {
        resolve(getLocalStorageData('tablet_items', []));
      }
    });
  }
  return getLocalStorageData('tablet_items', []);
}

function getNoteFileName(noteItem) {
  const cleanName = (noteItem.name || 'apunte').replace(/[/\\?%*:|"<>]/g, '_');
  return `${cleanName}_${noteItem.id}.json`;
}

// Guardar apunte individual en archivo .json dentro del subdirectorio físico correspondiente
async function saveNoteToDeviceFolder(noteItem) {
  if (!state.deviceDirHandle) return;
  try {
    const parentFolderId = noteItem.parentId || null;
    const targetDirHandle = await getDirectoryHandleForFolder(parentFolderId);
    if (!targetDirHandle) return;

    const filename = getNoteFileName(noteItem);

    // Si cambió de nombre o de carpeta física, eliminar la versión previa
    if (noteItem._diskFileName && noteItem._diskFileName !== filename) {
      try {
        await targetDirHandle.removeEntry(noteItem._diskFileName).catch(() => {});
      } catch {}
    }

    const fileHandle = await targetDirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(noteItem, null, 2));
    await writable.close();
    noteItem._diskFileName = filename;
  } catch (err) {
    console.warn('Auto-guardado en subcarpeta física no disponible:', err);
  }
}

const globalImageCache = new Map();

function prepareItemForStorage(item) {
  if (!item) return item;
  if (item.type === 'split_session') {
    return {
      id: item.id,
      type: 'split_session',
      name: item.name || item.title || 'Sesión Dual',
      title: item.title || item.name || 'Sesión Dual',
      leftDocumentId: item.leftDocumentId,
      rightDocumentId: item.rightDocumentId,
      splitRatio: typeof item.splitRatio === 'number' ? item.splitRatio : 50,
      leftViewport: item.leftViewport || { zoom: 1.0, scrollX: 0, scrollY: 0 },
      rightViewport: item.rightViewport || { zoom: 1.0, scrollX: 0, scrollY: 0 },
      parentId: item.parentId || null,
      createdAt: item.createdAt || Date.now(),
      updatedAt: Date.now()
    };
  }
  const clone = Object.assign({}, item);
  if (Array.isArray(clone.strokes)) {
    clone.strokes = clone.strokes.map(s => {
      if (s && s.isImage) {
        const { element, ...rest } = s;
        return rest;
      }
      return s;
    });
  }
  if (Array.isArray(clone.images)) {
    clone.images = clone.images.map(img => {
      if (img && img.element) {
        const { element, ...rest } = img;
        return rest;
      }
      return img;
    });
  }
  if (Array.isArray(clone.undoStack)) {
    clone.undoStack = clone.undoStack.map(snap => {
      if (!snap) return snap;
      if (Array.isArray(snap)) {
        return snap.map(s => (s && s.isImage && s.element ? (({ element, ...r }) => r)(s) : s));
      }
      if (typeof snap === 'object') {
        const cleanSnap = { ...snap };
        if (Array.isArray(cleanSnap.strokes)) {
          cleanSnap.strokes = cleanSnap.strokes.map(s => (s && s.isImage && s.element ? (({ element, ...r }) => r)(s) : s));
        }
        if (Array.isArray(cleanSnap.images)) {
          cleanSnap.images = cleanSnap.images.map(img => (img && img.element ? (({ element, ...r }) => r)(img) : img));
        }
        return cleanSnap;
      }
      return snap;
    });
  }
  if (Array.isArray(clone.redoStack)) {
    clone.redoStack = clone.redoStack.map(snap => {
      if (!snap) return snap;
      if (Array.isArray(snap)) {
        return snap.map(s => (s && s.isImage && s.element ? (({ element, ...r }) => r)(s) : s));
      }
      if (typeof snap === 'object') {
        const cleanSnap = { ...snap };
        if (Array.isArray(cleanSnap.strokes)) {
          cleanSnap.strokes = cleanSnap.strokes.map(s => (s && s.isImage && s.element ? (({ element, ...r }) => r)(s) : s));
        }
        if (Array.isArray(cleanSnap.images)) {
          cleanSnap.images = cleanSnap.images.map(img => (img && img.element ? (({ element, ...r }) => r)(img) : img));
        }
        return cleanSnap;
      }
      return snap;
    });
  }
  if (clone.pdfData) {
    if (clone.pdfData.annotations) {
      const newAnns = {};
      for (const [pg, arr] of Object.entries(clone.pdfData.annotations)) {
        newAnns[pg] = Array.isArray(arr) ? arr.map(s => {
          if (s && s.isImage && s.element) {
            const { element, ...rest } = s;
            return rest;
          }
          return s;
        }) : arr;
      }
      clone.pdfData = Object.assign({}, clone.pdfData, { annotations: newAnns });
    }

    // Normalizar datos binarios y asegurar respaldo base64 para entornos móviles / localStorage
    const rawPdf = clone.pdfData.arrayBuffer || clone.pdfData.base64 || clone.pdfData.data;
    const binaryPdf = normalizePdfBinaryData(rawPdf);
    if (binaryPdf) {
      clone.pdfData.arrayBuffer = binaryPdf.buffer;
      clone.pdfData.base64 = arrayBufferToBase64(binaryPdf);
    }
  }
  return clone;
}

// 1. AISLAMIENTO ESTRICTO DE ESTADO POR DOCUMENTO:
// Normaliza y asegura que cada documento tenga su estructura de datos propia, aislada e inmutable
function normalizeDocumentState(doc) {
  if (!doc) return null;
  if (!doc.id) {
    doc.id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }
  if (!doc.title && doc.name) {
    doc.title = doc.name;
  } else if (!doc.name && doc.title) {
    doc.name = doc.title;
  }
  if (doc.type === 'notebook') {
    doc.type = 'note';
  }
  if (!Array.isArray(doc.strokes)) {
    doc.strokes = [];
  }
  if (!Array.isArray(doc.images)) {
    doc.images = [];
  }

  // Migración limpia: separar trazos vectoriales puros de imágenes cargadas
  const pureStrokes = [];
  doc.strokes.forEach(s => {
    if (s && s.isImage) {
      if (!doc.images.some(img => img.id === s.id)) {
        doc.images.push(s);
      }
    } else if (s) {
      pureStrokes.push(s);
    }
  });
  doc.strokes = pureStrokes;

  if (!doc.viewport || typeof doc.viewport !== 'object') {
    doc.viewport = { x: 0, y: 0, zoom: 1.0 };
  }
  if (typeof doc.viewport.zoom !== 'number') {
    doc.viewport.zoom = 1.0;
  }
  if (typeof doc.viewport.x !== 'number') doc.viewport.x = 0;
  if (typeof doc.viewport.y !== 'number') doc.viewport.y = 0;

  if (!Array.isArray(doc.undoStack)) {
    doc.undoStack = [];
  }
  if (!Array.isArray(doc.redoStack)) {
    doc.redoStack = [];
  }
  return doc;
}

// Pre-cargar en memoria las imágenes de este documento exclusivo sin tocar elementos de otros
function ensureDocImagesLoaded(doc) {
  if (!doc || !Array.isArray(doc.images)) return;
  doc.images.forEach(imgData => {
    if (!imgData) return;
    const src = imgData.src || imgData.dataUrl;
    if (!src) return;
    imgData.src = src;
    imgData.dataUrl = src;
    let imgEl = imgData.element || globalImageCache.get(src);
    if (!imgEl) {
      imgEl = new Image();
      imgEl.src = src;
      globalImageCache.set(src, imgEl);
    }
    imgData.element = imgEl;
    if (imgEl.complete && imgEl.naturalWidth > 0) {
      syncImageStroke(imgData, imgEl);
    } else if (!imgEl.onload) {
      imgEl.onload = () => {
        syncImageStroke(imgData, imgEl);
        if (noteDrawingEngine && state.activeItem && state.activeItem.id === doc.id) {
          noteDrawingEngine.redraw();
        }
      };
    }
  });
}

// Historial exclusivo de Deshacer para este documentId
function pushDocumentUndo(doc) {
  if (!doc) return;
  if (!Array.isArray(doc.undoStack)) doc.undoStack = [];
  doc.redoStack = [];
  const snapshot = {
    strokes: JSON.parse(JSON.stringify(doc.strokes || [])),
    images: (doc.images || []).map(img => {
      const { element, ...rest } = img;
      return JSON.parse(JSON.stringify(rest));
    })
  };
  if (doc.pdfData && doc.pdfData.annotations) {
    snapshot.pdfAnnotations = JSON.parse(JSON.stringify(doc.pdfData.annotations));
  }
  doc.undoStack.push(snapshot);
  if (doc.undoStack.length > 50) doc.undoStack.shift();
  if (state.activeItem && state.activeItem.id === doc.id && state.notes) {
    state.notes.undoStack = doc.undoStack;
    state.notes.redoStack = doc.redoStack;
  }
}

function performUndo(doc) {
  if (!doc || !doc.undoStack || doc.undoStack.length === 0) return;
  if (!Array.isArray(doc.redoStack)) doc.redoStack = [];

  const currentSnapshot = {
    strokes: JSON.parse(JSON.stringify(doc.strokes || [])),
    images: (doc.images || []).map(img => {
      const { element, ...rest } = img;
      return JSON.parse(JSON.stringify(rest));
    })
  };
  if (doc.pdfData && doc.pdfData.annotations) {
    currentSnapshot.pdfAnnotations = JSON.parse(JSON.stringify(doc.pdfData.annotations));
  }
  doc.redoStack.push(currentSnapshot);

  const prev = doc.undoStack.pop();
  if (prev) {
    if (Array.isArray(prev)) {
      doc.strokes = prev.filter(s => !s.isImage);
      const prevImgs = prev.filter(s => s.isImage);
      if (prevImgs.length > 0) doc.images = prevImgs;
    } else {
      doc.strokes = prev.strokes || [];
      doc.images = prev.images || [];
      if (prev.pdfAnnotations && doc.pdfData) {
        doc.pdfData.annotations = prev.pdfAnnotations;
      }
    }
    ensureDocImagesLoaded(doc);
    dbSaveItem(doc);
    if (noteDrawingEngine) noteDrawingEngine.redraw();
    if (state.pdf && state.pdf.pageCanvasControllers) {
      Object.values(state.pdf.pageCanvasControllers).forEach(ctrl => ctrl && ctrl.redraw && ctrl.redraw());
    }
  }
  if (state.activeItem && state.activeItem.id === doc.id && state.notes) {
    state.notes.undoStack = doc.undoStack;
    state.notes.redoStack = doc.redoStack;
  }
}

function performRedo(doc) {
  if (!doc || !doc.redoStack || doc.redoStack.length === 0) return;
  if (!Array.isArray(doc.undoStack)) doc.undoStack = [];

  const currentSnapshot = {
    strokes: JSON.parse(JSON.stringify(doc.strokes || [])),
    images: (doc.images || []).map(img => {
      const { element, ...rest } = img;
      return JSON.parse(JSON.stringify(rest));
    })
  };
  if (doc.pdfData && doc.pdfData.annotations) {
    currentSnapshot.pdfAnnotations = JSON.parse(JSON.stringify(doc.pdfData.annotations));
  }
  doc.undoStack.push(currentSnapshot);

  const next = doc.redoStack.pop();
  if (next) {
    if (Array.isArray(next)) {
      doc.strokes = next.filter(s => !s.isImage);
      const nextImgs = next.filter(s => s.isImage);
      if (nextImgs.length > 0) doc.images = nextImgs;
    } else {
      doc.strokes = next.strokes || [];
      doc.images = next.images || [];
      if (next.pdfAnnotations && doc.pdfData) {
        doc.pdfData.annotations = next.pdfAnnotations;
      }
    }
    ensureDocImagesLoaded(doc);
    dbSaveItem(doc);
    if (noteDrawingEngine) noteDrawingEngine.redraw();
    if (state.pdf && state.pdf.pageCanvasControllers) {
      Object.values(state.pdf.pageCanvasControllers).forEach(ctrl => ctrl && ctrl.redraw && ctrl.redraw());
    }
  }
  if (state.activeItem && state.activeItem.id === doc.id && state.notes) {
    state.notes.undoStack = doc.undoStack;
    state.notes.redoStack = doc.redoStack;
  }
}

async function dbSaveItem(item, syncToDisk = true) {
  item.updatedAt = Date.now();
  const cleanItem = prepareItemForStorage(item);
  if (!useFallbackStorage && db) {
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('items', 'readwrite');
        const store = tx.objectStore('items');
        const req = store.put(cleanItem);
        req.onsuccess = () => resolve(cleanItem);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Fallo guardando item en IndexedDB, usando fallback:', e);
    }
  }
  const items = getLocalStorageData('tablet_items', []);
  const idx = items.findIndex(x => x.id === item.id);
  if (idx !== -1) {
    items[idx] = cleanItem;
  } else {
    items.push(cleanItem);
  }
  setLocalStorageData('tablet_items', items);

  // Auto-guardado anidado en la subcarpeta física de la tablet si está conectada
  if (syncToDisk && state.deviceDirHandle && item.type === 'note') {
    saveNoteToDeviceFolder(cleanItem).catch(() => {});
  }

  return item;
}

const PAPER_SIZES = {
  a0: { name: 'A0', widthMm: 841, heightMm: 1189, widthPx: 3178, heightPx: 4494, ptW: 2383.94, ptH: 3370.39 },
  a1: { name: 'A1', widthMm: 594, heightMm: 841, widthPx: 2245, heightPx: 3178, ptW: 1683.78, ptH: 2383.94 },
  a2: { name: 'A2', widthMm: 420, heightMm: 594, widthPx: 1587, heightPx: 2245, ptW: 1190.55, ptH: 1683.78 },
  a3: { name: 'A3', widthMm: 297, heightMm: 420, widthPx: 1122, heightPx: 1587, ptW: 841.89, ptH: 1190.55 },
  a4: { name: 'A4', widthMm: 210, heightMm: 297, widthPx: 840, heightPx: 1188, ptW: 595.28, ptH: 841.89 },
  a5: { name: 'A5', widthMm: 148, heightMm: 210, widthPx: 595, heightPx: 840, ptW: 419.53, ptH: 595.28 },
  letter: { name: 'Carta', widthMm: 215.9, heightMm: 279.4, widthPx: 816, heightPx: 1056, ptW: 612, ptH: 792 },
  legal: { name: 'Oficio', widthMm: 215.9, heightMm: 355.6, widthPx: 816, heightPx: 1344, ptW: 612, ptH: 1008 },
  infinite: { name: 'Infinito', widthMm: 660, heightMm: 660, widthPx: 2500, heightPx: 2500, ptW: 595.28, ptH: 841.89 }
};

async function dbCreateNote(name, paperSize = 'a4', orientation = 'portrait', parentId = null) {
  const paper = PAPER_SIZES[paperSize] || PAPER_SIZES.a4;
  let w = paper.widthPx;
  let h = paper.heightPx;
  if (orientation === 'landscape' && paperSize !== 'infinite') {
    const temp = w;
    w = h;
    h = temp;
  }
  const documentId = `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item = {
    id: documentId,
    title: name,
    name,
    parentId,
    type: 'note',
    paperSize: paperSize || 'a4',
    orientation: orientation || 'portrait',
    noteMode: paperSize === 'infinite' ? 'infinite' : 'continuous',
    bgColor: '#fdf6e2',
    patternType: 'grid', // 'blank' | 'grid' | 'lines' | 'dots'
    gridSize: 28,
    pageHeight: h,
    canvasWidth: w,
    canvasHeight: h,
    strokes: [],
    images: [],
    viewport: { x: 0, y: 0, zoom: 1.0 },
    undoStack: [],
    redoStack: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  return dbSaveItem(item);
}

async function dbImportPdf(fileObj, parentId = null, customConfig = null) {
  let rawData = (customConfig && (customConfig.arrayBuffer || customConfig.base64))
    ? (customConfig.arrayBuffer || customConfig.base64)
    : (fileObj && fileObj.arrayBuffer ? await fileObj.arrayBuffer() : fileObj);
  let binary = normalizePdfBinaryData(rawData);
  if (!binary && customConfig && customConfig.base64) {
    binary = normalizePdfBinaryData(customConfig.base64);
  }
  const arrayBuffer = binary ? binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) : null;
  const base64 = (customConfig && customConfig.base64) ? customConfig.base64 : (binary ? arrayBufferToBase64(binary) : '');
  const cleanBaseName = (customConfig && customConfig.name) ? customConfig.name.trim() : ((fileObj && fileObj.name) ? fileObj.name.replace(/\.pdf$/i, '') : 'Documento PDF');
  const documentId = `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item = {
    id: documentId,
    title: cleanBaseName,
    name: cleanBaseName,
    parentId,
    type: 'pdf',
    strokes: [],
    images: [],
    viewport: { x: 0, y: 0, zoom: 1.0 },
    undoStack: [],
    redoStack: [],
    pdfData: {
      arrayBuffer,
      base64,
      pageCount: (customConfig && customConfig.pageCount) || (typeof pendingPdfImport !== 'undefined' && pendingPdfImport ? pendingPdfImport.totalPages : 1),
      fileName: (fileObj && fileObj.name) || `${cleanBaseName}.pdf`,
      rotation: (customConfig && typeof customConfig.rotation === 'number') ? customConfig.rotation : 0,
      sideCanvas: (customConfig && customConfig.sideCanvas) ? { ...customConfig.sideCanvas } : {
        position: 'none',
        width: 350,
        pattern: 'grid',
        bgColor: '#ffffff',
        gridSize: 28
      },
      annotations: {} // pageNum -> Stroke[]
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  // Guardado anidado del archivo PDF en la subcarpeta física de la tablet
  if (state.deviceDirHandle) {
    try {
      const targetDirHandle = await getDirectoryHandleForFolder(parentId);
      if (targetDirHandle) {
        const pdfFileName = `${cleanBaseName.replace(/[/\\?%*:|"<>]/g, '_')}.pdf`;
        const fileHandle = await targetDirHandle.getFileHandle(pdfFileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(arrayBuffer);
        await writable.close();
        item._diskFileName = pdfFileName;
      }
    } catch (err) {
      console.warn('No se pudo guardar PDF físico en disco:', err);
    }
  }

  return dbSaveItem(item, false);
}

async function dbMoveItem(id, targetParentId) {
  const allItems = await dbGetItems();
  const it = allItems.find(x => x.id === id);
  const oldParentId = it ? it.parentId : null;

  // Si cambia de subcarpeta física en disco
  if (it && oldParentId !== targetParentId && state.deviceDirHandle) {
    try {
      const oldDirHandle = await getDirectoryHandleForFolder(oldParentId);
      if (oldDirHandle) {
        const oldFilename = it._diskFileName || (it.type === 'note' ? getNoteFileName(it) : `${(it.name || 'documento').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`);
        await oldDirHandle.removeEntry(oldFilename).catch(() => {});
      }
      it.parentId = targetParentId;
      it._diskFileName = null;
      if (it.type === 'note') {
        await saveNoteToDeviceFolder(it);
      } else if (it.type === 'pdf' && it.pdfData && it.pdfData.arrayBuffer) {
        const targetDirHandle = await getDirectoryHandleForFolder(targetParentId);
        if (targetDirHandle) {
          const pdfFileName = `${(it.name || 'documento').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`;
          const fileHandle = await targetDirHandle.getFileHandle(pdfFileName, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(it.pdfData.arrayBuffer);
          await writable.close();
          it._diskFileName = pdfFileName;
        }
      }
    } catch (err) {
      console.warn('Error moviendo archivo físico en disco:', err);
    }
  }

  if (!useFallbackStorage && db) {
    try {
      await new Promise((resolve) => {
        const tx = db.transaction('items', 'readwrite');
        const store = tx.objectStore('items');
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const item = getReq.result;
          if (item) {
            item.parentId = targetParentId;
            store.put(item).onsuccess = () => resolve();
          } else { resolve(); }
        };
        getReq.onerror = () => resolve();
      });
      return;
    } catch {}
  }
  const items = getLocalStorageData('tablet_items', []);
  const item = items.find(x => x.id === id);
  if (item) {
    item.parentId = targetParentId;
    setLocalStorageData('tablet_items', items);
  }
}

async function dbDeleteItem(id) {
  const allItems = await dbGetItems();
  const itemToDelete = allItems.find(x => x.id === id);

  // 1. Eliminación física en disco con File System Access API
  if (itemToDelete && state.deviceDirHandle) {
    try {
      await verifyDirectoryPermission(state.deviceDirHandle, false);
      const targetDirHandle = await getDirectoryHandleForFolder(itemToDelete.parentId);
      if (targetDirHandle) {
        const cleanName = (itemToDelete.name || 'documento').replace(/[/\\?%*:|"<>]/g, '_');
        const filename = itemToDelete._diskFileName || (itemToDelete.type === 'note' ? getNoteFileName(itemToDelete) : `${cleanName}.pdf`);
        if (filename) await targetDirHandle.removeEntry(filename).catch(() => {});
        if (itemToDelete.name && itemToDelete.name !== filename) {
          await targetDirHandle.removeEntry(itemToDelete.name).catch(() => {});
        }
        if (itemToDelete.type === 'note') {
          await targetDirHandle.removeEntry(`${cleanName}.json`).catch(() => {});
          await targetDirHandle.removeEntry(`${cleanName}_${itemToDelete.id}.json`).catch(() => {});
        } else if (itemToDelete.type === 'pdf') {
          await targetDirHandle.removeEntry(`${cleanName}.pdf`).catch(() => {});
          if (itemToDelete.pdfData && itemToDelete.pdfData.fileName) {
            await targetDirHandle.removeEntry(itemToDelete.pdfData.fileName).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('No se pudo eliminar archivo físico en disco:', err);
    }
  }

  // 2. Limpieza inmediata del estado en memoria y selección reactiva
  state.items = (state.items || []).filter(x => x.id !== id);
  selectedItemIds.delete(id);
  state.selectedItemIds.delete(id);
  state.fmSelection.selectedItems.delete(id);

  // 3. Persistencia en IndexedDB / LocalStorage
  if (!useFallbackStorage && db) {
    try {
      await new Promise((resolve) => {
        const tx = db.transaction('items', 'readwrite');
        const store = tx.objectStore('items');
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
      return;
    } catch {}
  }
  const items = getLocalStorageData('tablet_items', []);
  const remaining = items.filter(x => x.id !== id);
  setLocalStorageData('tablet_items', remaining);
}


// ===== 2. ESTADO GENERAL DE LA APP =====
