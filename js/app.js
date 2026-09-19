const state = {
  currentView: 'file-manager',
  currentFolderId: null,
  folders: [],
  items: [],
  activeItem: null,
  selectedFolderColor: '#f59e0b',
  renameFolderColor: '#f59e0b',

  // Modo de Selección Múltiple y Operaciones por Lote (Gestor de Archivos)
  isBatchSelectionMode: false,
  selectedItemIds: new Set(),
  fmSelection: {
    active: false,
    selectedFolders: new Set(),
    selectedItems: new Set()
  },

  // Carpeta física del dispositivo (File System Access API)
  deviceDirHandle: null,
  deviceDirName: null,
  folderHandles: new Map(),

  // Ajustes de la aplicación (Unidad de medida, Modo Solo Lápiz / Palm Rejection, etc.)
  settings: {
    unit: 'cm', // 'mm' | 'cm' | 'm' | 'px' | 'inch'
    dpi: 96,
    stylusOnly: true // Por defecto: Desplazar y cambiar de página con el dedo, escribir con lápiz (Palm Rejection)
  },

  // Configuración de dibujo y herramientas
  notes: {
    tool: 'pen', // 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'shapes' | 'fill' | 'select' | 'pan'
    brushType: 'pen', // 'pen' | 'fountain' | 'brush' | 'pencil' | 'highlighter'
    shapeType: 'rectangle', // 'rectangle' | 'circle' | 'line' | 'arrow' | 'triangle' | 'star' | 'hexagon'
    shapeFill: 'none', // 'none' | 'semi' | 'solid'
    shapeSize: 3,
    fillOpacity: 1.0,
    color: '#0f172a',
    size: 3,
    opacity: 1.0,
    eraserMode: 'stroke', // 'stroke' | 'area'
    eraserSize: 20,
    undoStack: [],
    redoStack: [],
    clipboardStrokes: [],
    selectedStrokeIds: new Set(),
    selectedImageId: null,
    selectionBounds: null,
    isSelectionActive: false,
    isDraggingSelection: false
  },

  // Pinceles personalizados del usuario
  customBrushes: [],

  // Herramientas activas en la barra superior (Reordenables y Ampliables)
  toolbarTools: [],
  activeToolId: 'tool_pen_black',

  // Colores favoritos del usuario
  favColors: ['#0f172a', '#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#facc15', '#06b6d4'],

  // Configuración de anotación para PDFs
  pdf: {
    tool: 'pen',
    brushType: 'pen',
    color: '#dc2626',
    size: 3,
    eraserMode: 'stroke',
    eraserSize: 20,
    scale: 1.2,
    doc: null,
    totalPages: 0,
    pageCanvasControllers: {}
  },

  // Configuración de Pantalla Dividida (Split-View / Doble Lienzo)
  split: {
    activePane: 'left', // 'left' | 'right'
    ratio: 50,
    leftDoc: null,
    rightDoc: null,
    leftEngine: null,
    rightEngine: null,
    leftScale: 1.0,
    rightScale: 1.0,
    activeSessionItem: null
  }
};

const DEFAULT_TOOLBAR_TOOLS = [
  { id: 'tool_pen_black', type: 'pen', brushType: 'pen', name: 'Bolígrafo', color: '#0f172a', size: 3, opacity: 1.0, isBuiltin: true },
  { id: 'tool_pen_blue', type: 'pen', brushType: 'fountain', name: 'Pluma', color: '#2563eb', size: 4, opacity: 1.0, isBuiltin: true },
  { id: 'tool_pen_red', type: 'pen', brushType: 'pen', name: 'Rojo', color: '#dc2626', size: 3, opacity: 1.0, isBuiltin: true },
  { id: 'tool_highlighter_yellow', type: 'highlighter', brushType: 'highlighter', name: 'Subrayador', color: '#facc15', size: 18, opacity: 0.45, isBuiltin: true },
  { id: 'tool_eraser', type: 'eraser', name: 'Goma', isBuiltin: true },
  { id: 'tool_lasso', type: 'lasso', name: 'Lazo', isBuiltin: true },
  { id: 'tool_shapes', type: 'shapes', name: 'Formas', isBuiltin: true },
  { id: 'tool_fill', type: 'fill', name: 'Relleno', isBuiltin: true },
  { id: 'tool_image', type: 'image', name: 'Foto', isBuiltin: true }
];

// Cargar preferencias, unidades, pinceles y colores favoritos desde localStorage
function loadUserPreferences() {
  try {
    const savedSettings = localStorage.getItem('tablet_studio_settings');
    if (savedSettings) {
      state.settings = Object.assign({ unit: 'cm', dpi: 96, stylusOnly: true, theme: 'light' }, JSON.parse(savedSettings));
    } else {
      state.settings = { unit: 'cm', dpi: 96, stylusOnly: true, theme: 'light' };
    }

    const savedTools = localStorage.getItem('tablet_studio_toolbar_tools');
    if (savedTools) {
      try {
        const parsed = JSON.parse(savedTools);
        // Filtrar 'pan' (Mano) y 'select' (Cuadrado de selección) para que no persistan
        state.toolbarTools = parsed.filter(t => t && t.type !== 'pan' && t.type !== 'select' && t.id !== 'tool_pan' && t.id !== 'tool_select');
        // Asegurar que la herramienta de Formas esté presente de forma nativa
        if (!state.toolbarTools.some(t => t.type === 'shapes')) {
          const shapesTool = DEFAULT_TOOLBAR_TOOLS.find(t => t.type === 'shapes');
          if (shapesTool) {
            const lassoIdx = state.toolbarTools.findIndex(t => t.type === 'lasso');
            if (lassoIdx !== -1) {
              state.toolbarTools.splice(lassoIdx + 1, 0, Object.assign({}, shapesTool));
            } else {
              state.toolbarTools.push(Object.assign({}, shapesTool));
            }
          }
        }
        if (state.toolbarTools.length === 0) {
          state.toolbarTools = JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_TOOLS));
        }

        // Sanitizar herramientas para evitar colores invisibles en lienzos claros
        state.toolbarTools.forEach(t => {
          if (t.type === 'pen' && (!t.color || t.color.toLowerCase() === '#ffffff' || t.color.toLowerCase() === '#fff')) {
            t.color = '#0f172a';
          }
          if (t.type === 'highlighter' && (!t.color || t.color.toLowerCase() === '#ffffff')) {
            t.color = '#facc15';
          }
          if (!t.size || t.size <= 0) {
            t.size = t.type === 'highlighter' ? 18 : 3;
          }
        });
        if (!state.activeToolId || !state.toolbarTools.some(t => t.id === state.activeToolId)) {
          state.activeToolId = state.toolbarTools[0]?.id || 'tool_pen_black';
        }
      } catch {
        state.toolbarTools = JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_TOOLS));
        state.activeToolId = state.toolbarTools[0]?.id || 'tool_pen_black';
      }
    } else {
      state.toolbarTools = JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_TOOLS));
      state.activeToolId = state.toolbarTools[0]?.id || 'tool_pen_black';
    }

    const savedBrushes = localStorage.getItem('tablet_studio_custom_brushes');
    if (savedBrushes) {
      state.customBrushes = JSON.parse(savedBrushes);
    }

    const savedFavColors = localStorage.getItem('tablet_studio_fav_colors');
    if (savedFavColors) {
      state.favColors = JSON.parse(savedFavColors);
    }
  } catch (e) {
    console.error('Error cargando preferencias:', e);
  }
}

function saveUserSettings() {
  try {
    localStorage.setItem('tablet_studio_settings', JSON.stringify(state.settings));
  } catch (e) {}
}

// ===== SISTEMA DE TEMAS (MODO CLARO / MODO OSCURO) =====
function applyTheme(themeName) {
  const t = themeName === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  if (!state.settings) state.settings = {};
  state.settings.theme = t;
  saveUserSettings();

  // Actualizar estado activo en todos los botones de cambio de tema
  document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
    btn.setAttribute('data-active-theme', t);
    btn.title = t === 'dark' ? 'Cambiar a Modo Claro (☀️)' : 'Cambiar a Modo Oscuro (🌙)';
  });
}

function toggleTheme() {
  const current = (state.settings && state.settings.theme) || document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

function initThemeSystem() {
  const savedTheme = (state.settings && state.settings.theme) || 'light';
  applyTheme(savedTheme);

  const btnFm = document.getElementById('btn-theme-toggle-fm');
  if (btnFm) btnFm.onclick = toggleTheme;
  const btnNotes = document.getElementById('btn-theme-toggle-notes');
  if (btnNotes) btnNotes.onclick = toggleTheme;
  const btnPdf = document.getElementById('btn-theme-toggle-pdf');
  if (btnPdf) btnPdf.onclick = toggleTheme;
}

function saveToolBarTools() {
  try {
    localStorage.setItem('tablet_studio_toolbar_tools', JSON.stringify(state.toolbarTools));
  } catch (e) {}
}

function saveUserBrushes() {
  try {
    localStorage.setItem('tablet_studio_custom_brushes', JSON.stringify(state.customBrushes));
  } catch (e) {}
}

function saveUserFavColors() {
  try {
    localStorage.setItem('tablet_studio_fav_colors', JSON.stringify(state.favColors));
  } catch (e) {}
}

// Convertidor de Píxeles a la Unidad de Medida Activa (mm, cm, m, px, inch)
function formatPxToUnit(px, unit = (state.settings && state.settings.unit) || 'cm') {
  if (isNaN(px)) return '0 ' + unit;
  if (unit === 'px') return `${Math.round(px)} px`;
  if (unit === 'mm') {
    const val = (px * 25.4 / 96);
    return val >= 10 ? `${val.toFixed(0)} mm` : `${val.toFixed(1)} mm`;
  }
  if (unit === 'cm') {
    const val = (px * 2.54 / 96);
    return val >= 10 ? `${val.toFixed(1)} cm` : `${val.toFixed(2)} cm`;
  }
  if (unit === 'm') return `${(px * 0.0254 / 96).toFixed(3)} m`;
  if (unit === 'inch') return `${(px / 96).toFixed(2)} in`;
  return `${(px * 2.54 / 96).toFixed(2)} cm`;
}

// Actualizar todas las etiquetas, presets y botones de medidas según la unidad activa
function updateAllMeasurementLabels() {
  const u = (state.settings && state.settings.unit) || 'cm';

  // 1. Pincel / Pluma
  const brushVal = document.getElementById('brush-size-val');
  if (brushVal) {
    brushVal.textContent = formatPxToUnit(state.notes.size || 3, u);
  }
  document.querySelectorAll('#brush-size-presets .size-pill-btn').forEach(btn => {
    const sz = parseInt(btn.dataset.size);
    if (!isNaN(sz)) {
      btn.textContent = formatPxToUnit(sz, u);
    }
  });

  // 2. Goma de borrar
  const eraserVal = document.getElementById('eraser-size-val');
  if (eraserVal) {
    eraserVal.textContent = formatPxToUnit(state.notes.eraserSize || 20, u);
  }
  document.querySelectorAll('#eraser-size-presets .size-pill-btn').forEach(btn => {
    const sz = parseInt(btn.dataset.size);
    if (!isNaN(sz)) {
      let label = 'Fino';
      if (sz >= 70) label = 'Gigante';
      else if (sz >= 35) label = 'Grueso';
      else if (sz >= 15) label = 'Medio';
      btn.textContent = `${label} (${formatPxToUnit(sz, u)})`;
    }
  });

  // 3. Formas geométricas
  const shapeVal = document.getElementById('shape-size-val');
  if (shapeVal) {
    shapeVal.textContent = formatPxToUnit(state.notes.shapeSize || 3, u);
  }
  document.querySelectorAll('#shape-size-presets .size-pill-btn').forEach(btn => {
    const sz = parseInt(btn.dataset.size);
    if (!isNaN(sz)) {
      btn.textContent = formatPxToUnit(sz, u);
    }
  });

  // 4. Modal Nueva Herramienta
  const newToolVal = document.getElementById('new-tool-size-val');
  const newToolInput = document.getElementById('input-new-tool-size');
  if (newToolVal && newToolInput) {
    newToolVal.textContent = formatPxToUnit(parseInt(newToolInput.value) || 3, u);
  }

  // 5. Cuadrícula
  if (state.activeItem) {
    const gridSz = state.activeItem.gridSize || 28;
    const gridText = document.getElementById('grid-size-text');
    if (gridText) {
      gridText.textContent = `${gridSz}px (${formatPxToUnit(gridSz, u)})`;
    }
  }

  // 6. Badges en la barra superior
  updateToolBadges();

  // 7. Dimensiones de selección y recorte
  if (noteDrawingEngine && noteDrawingEngine.updateSelectionBounds) {
    noteDrawingEngine.updateSelectionBounds();
  }

  // 8. Modal Nuevo Apunte (Descripciones de formato y dimensiones)
  document.querySelectorAll('.paper-size-card').forEach(card => {
    const radio = card.querySelector('input[type="radio"]');
    if (!radio) return;
    const szKey = radio.value;
    const paper = PAPER_SIZES[szKey];
    const descEl = card.querySelector('.paper-size-desc');
    if (paper && descEl && szKey !== 'infinite') {
      descEl.textContent = `${formatPxToUnit(paper.widthPx, u)} × ${formatPxToUnit(paper.heightPx, u)}`;
    }
  });

  const selectedSize = document.querySelector('input[name="note-paper-size"]:checked')?.value || 'a4';
  const selectedOrient = document.querySelector('input[name="note-orientation"]:checked')?.value || 'portrait';
  const paper = PAPER_SIZES[selectedSize] || PAPER_SIZES.a4;
  const dimLabel = document.getElementById('new-note-paper-dim-label');
  if (dimLabel) {
    if (selectedSize === 'infinite') {
      dimLabel.textContent = 'Espacio Libre Infinito';
    } else {
      let w = paper.widthPx;
      let h = paper.heightPx;
      if (selectedOrient === 'landscape') {
        const temp = w;
        w = h;
        h = temp;
      }
      dimLabel.textContent = `${formatPxToUnit(w, u)} × ${formatPxToUnit(h, u)}`;
    }
  }
}


// Sembrar datos simulados de carpetas y apuntes iniciales
async function seedInitialDemoData() {
  // Sin archivos demo por código: el usuario comienza con un espacio 100% limpio y personalizado
}

// ===== 3. INICIALIZACIÓN DE LA APLICACIÓN =====
async function bootstrapApp() {
  // Paso 1: Carga de preferencias y vinculación INMEDIATA de eventos de todos los botones
  try {
    loadUserPreferences();
    initThemeSystem();
    initFileManagerEvents();
    initNotesEditorEvents();
    initPdfEditorEvents();
    initToolPopoversEvents();
    initSettingsModalEvents();
    initFullscreenToggles();
    initColorPickerEvents();
    initAddCustomToolEvents();
    initImageCropEvents();
    initExportModalEvents();
    initPdfImportPreviewModalEvents();
    initPdfSideCanvasConfigModalEvents();
    initBugReportSystem();
    initSplitEditorEvents();
    initSplitModalEvents();
    renderToolbarTools();
    updateLiveBrushPreview();
    updateStylusModeUI();
    updateAllMeasurementLabels();
  } catch (uiErr) {
    console.error('Error vinculando eventos UI iniciales:', uiErr);
  }

  // Paso 2: Inicialización asíncrona de base de datos y renderizado del gestor de archivos
  try {
    await initDatabase();

    // Purgar de forma proactiva cualquier archivo o carpeta demo que haya quedado guardada en sesiones previas
    try {
      const demoNames = [
        'Universidad e Ingeniería',
        'Proyectos & Trabajo',
        'Bocetos & Ideas',
        'Bienvenido a Tablet Studio',
        'Fórmulas y Matemáticas',
        'Plan de Trabajo Semanal',
        'Bocetos Libres'
      ];
      const allFolders = await dbGetFolders();
      for (const f of allFolders) {
        if (demoNames.some(dName => f.name.includes(dName))) {
          await dbDeleteFolder(f.id);
        }
      }
      const allItems = await dbGetItems();
      for (const it of allItems) {
        if (
          demoNames.some(dName => it.name.includes(dName)) ||
          it.id.startsWith('note_welcome_') ||
          it.id.startsWith('note_math_') ||
          it.id.startsWith('note_work_') ||
          it.id.startsWith('note_sketch_')
        ) {
          await dbDeleteItem(it.id);
        }
      }
    } catch (cleanErr) {
      console.warn('Limpieza de archivos demo:', cleanErr);
    }

    try {
      state.deviceDirName = getLocalStorageData('tablet_device_dir_name', null);
      const storedHandle = await dbGetDirectoryHandle();
      if (storedHandle) {
        state.deviceDirHandle = storedHandle;
        state.deviceDirName = storedHandle.name || state.deviceDirName;
        if (typeof storedHandle.queryPermission === 'function') {
          const perm = await storedHandle.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt');
          if (perm === 'granted') {
            await syncDeviceDirectory(true);
          }
        }
      }
    } catch (handleErr) {
      console.warn('Error restaurando directorio vinculado:', handleErr);
    }

    await refreshFileManager();
  } catch (dbErr) {
    console.error('Error inicializando base de datos:', dbErr);
    await refreshFileManager();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}

function switchView(viewId) {
  state.currentView = viewId;
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${viewId}`).classList.add('active');
  closeAllToolPopovers();
}


// ===== 4. MODALES PERSONALIZADOS (PROMISES) =====
function showRenameModal(currentName, isFolder = false, currentColor = '#f59e0b') {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-rename');
    const input = document.getElementById('input-rename-name');
    const title = document.getElementById('rename-modal-title');
    const colorGroup = document.getElementById('rename-color-group');
    const form = document.getElementById('form-rename');
    const btnCancel = document.getElementById('btn-cancel-modal-rename');
    const btnClose = document.getElementById('btn-close-modal-rename');

    input.value = currentName;
    title.textContent = isFolder ? 'Editar Carpeta' : 'Renombrar Archivo';

    if (isFolder) {
      colorGroup.style.display = 'block';
      state.renameFolderColor = currentColor || '#f59e0b';
      document.querySelectorAll('#rename-folder-color-picker .folder-color-dot').forEach(dot => {
        dot.classList.toggle('active', dot.dataset.color === state.renameFolderColor);
      });
    } else {
      colorGroup.style.display = 'none';
    }

    modal.classList.add('open');
    input.focus();
    input.select();

    const cleanup = () => {
      modal.classList.remove('open');
      form.onsubmit = null;
      btnCancel.onclick = null;
      btnClose.onclick = null;
    };

    form.onsubmit = (e) => {
      e.preventDefault();
      const val = input.value.trim();
      cleanup();
      resolve({ name: val, color: isFolder ? state.renameFolderColor : null });
    };

    btnCancel.onclick = () => { cleanup(); resolve(null); };
    btnClose.onclick = () => { cleanup(); resolve(null); };
  });
}

function showDeleteConfirmModal(itemName, itemType = 'elemento') {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-delete-confirm');
    const nameEl = document.getElementById('delete-item-name');
    const subEl = document.getElementById('delete-item-sub');
    const btnConfirm = document.getElementById('btn-confirm-delete');
    const btnCancel = document.getElementById('btn-cancel-modal-delete');
    const btnClose = document.getElementById('btn-close-modal-delete');

    if (!modal || !btnConfirm) {
      const ok = window.confirm(`¿Deseas eliminar permanentemente "${itemName}"?`);
      resolve(ok);
      return;
    }

    if (nameEl) nameEl.textContent = `"${itemName}"`;
    if (subEl) {
      subEl.textContent = itemType === 'carpeta'
        ? 'Se eliminarán también todos los archivos y subcarpetas contenidos.'
        : 'Esta acción no se puede deshacer.';
    }

    modal.classList.add('open');

    let resolved = false;
    const cleanup = (result) => {
      if (resolved) return;
      resolved = true;
      modal.classList.remove('open');
      btnConfirm.onclick = null;
      if (btnCancel) btnCancel.onclick = null;
      if (btnClose) btnClose.onclick = null;
      modal.onclick = null;
      resolve(result);
    };

    btnConfirm.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      cleanup(true);
    };
    if (btnCancel) {
      btnCancel.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        cleanup(false);
      };
    }
    if (btnClose) {
      btnClose.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        cleanup(false);
      };
    }
    modal.onclick = (e) => {
      if (e.target === modal) {
        cleanup(false);
      }
    };
  });
}

function showAlertModal(message, title = 'Aviso') {
  const modal = document.getElementById('modal-alert');
  document.getElementById('alert-title').textContent = title;
  document.getElementById('alert-message').textContent = message;
  modal.classList.add('open');

  const close = () => modal.classList.remove('open');
  document.getElementById('btn-close-alert-ok').onclick = close;
  document.getElementById('btn-close-modal-alert').onclick = close;
}

function updateStorageDirUI() {
  const titleEl = document.getElementById('storage-dir-title');
  const pathEl = document.getElementById('storage-dir-path');
  const badgeEl = document.getElementById('storage-status-badge');
  const selectBtn = document.getElementById('btn-select-device-dir');
  const syncBtn = document.getElementById('btn-sync-device-dir');
  const disconnectBtn = document.getElementById('btn-disconnect-device-dir');
  const fullPathBox = document.getElementById('storage-dir-full-path-box');
  const fullPathVal = document.getElementById('storage-dir-full-path-val');
  const subfoldersInfo = document.getElementById('storage-dir-subfolders-info');

  const folderName = state.deviceDirName || (state.deviceDirHandle ? state.deviceDirHandle.name : null) || getLocalStorageData('tablet_device_dir_name', null);

  if (state.deviceDirHandle) {
    const activeName = state.deviceDirHandle.name || folderName || 'Carpeta de la Tablet';
    if (titleEl) titleEl.textContent = `📁 ${activeName}`;
    if (pathEl) pathEl.textContent = `Directorio de trabajo activo en disco: /${activeName}`;
    if (badgeEl) {
      badgeEl.textContent = 'Vinculado';
      badgeEl.className = 'storage-status-badge linked';
    }
    if (fullPathBox) fullPathBox.style.display = 'flex';
    if (fullPathVal) fullPathVal.textContent = `/${activeName}/`;
    
    const folderCount = (state.folders || []).length;
    const itemCount = (state.items || []).length;
    if (subfoldersInfo) {
      subfoldersInfo.textContent = `Sincronización activa: ${folderCount} subcarpetas y ${itemCount} apuntes en este directorio.`;
    }

    if (selectBtn && selectBtn.querySelector('span')) selectBtn.querySelector('span').textContent = '📁 Cambiar Carpeta';
    if (syncBtn) syncBtn.style.display = 'inline-flex';
    if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
  } else if (folderName) {
    if (titleEl) titleEl.textContent = `📁 ${folderName}`;
    if (pathEl) pathEl.textContent = `Directorio asociado: /${folderName} (Requiere permiso para reconectar)`;
    if (badgeEl) {
      badgeEl.textContent = 'Requiere Permiso';
      badgeEl.className = 'storage-status-badge';
    }
    if (fullPathBox) fullPathBox.style.display = 'flex';
    if (fullPathVal) fullPathVal.textContent = `/${folderName}/ (Pendiente de reconectar)`;
    if (subfoldersInfo) {
      subfoldersInfo.textContent = `Vuelve a autorizar el acceso pulsando "Reconectar" para reactivar la sincronización en disco.`;
    }
    if (selectBtn && selectBtn.querySelector('span')) selectBtn.querySelector('span').textContent = '📁 Reconectar Carpeta';
    if (syncBtn) syncBtn.style.display = 'inline-flex';
    if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
  } else {
    if (titleEl) titleEl.textContent = 'Almacenamiento Interno (IndexedDB)';
    if (pathEl) pathEl.textContent = 'Los archivos se guardan en la memoria local del navegador (sin carpeta física en disco).';
    if (badgeEl) {
      badgeEl.textContent = 'Interno';
      badgeEl.className = 'storage-status-badge';
    }
    if (fullPathBox) fullPathBox.style.display = 'none';

    if (selectBtn && selectBtn.querySelector('span')) selectBtn.querySelector('span').textContent = '📁 Vincular Carpeta Tablet';
    if (syncBtn) syncBtn.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
  }
}

function updateSettingsPreview(u) {
  const a4El = document.getElementById('preview-val-a4');
  const gridEl = document.getElementById('preview-val-grid');
  const penEl = document.getElementById('preview-val-pen');
  if (a4El) a4El.textContent = formatPxToUnit(840, u);
  if (gridEl) gridEl.textContent = formatPxToUnit(28, u);
  if (penEl) penEl.textContent = formatPxToUnit(3, u);
}

function openSettings() {
  const modal = document.getElementById('modal-settings');
  if (!modal) return;
  const curUnit = (state.settings && state.settings.unit) || 'cm';
  const radio = document.querySelector(`input[name="setting-unit"][value="${curUnit}"]`);
  if (radio) radio.checked = true;

  const checkStylus = document.getElementById('input-setting-stylus-only');
  if (checkStylus) checkStylus.checked = !!(state.settings && state.settings.stylusOnly);

  updateSettingsPreview(curUnit);
  updateStorageDirUI();
  actualizarBotonInstalacion(!!deferredPrompt);
  modal.classList.add('open');
}

function closeSettings() {
  const modal = document.getElementById('modal-settings');
  if (modal) modal.classList.remove('open');
}

function initSettingsModalEvents() {
  const modal = document.getElementById('modal-settings');
  if (!modal) return;
  const btnClose = document.getElementById('btn-close-modal-settings');
  const btnCancel = document.getElementById('btn-cancel-modal-settings');
  const btnSave = document.getElementById('btn-save-settings');
  const btnInstallPwa = document.getElementById('btn-install-pwa');
  if (btnInstallPwa) {
    btnInstallPwa.onclick = triggerPwaInstall;
  }
  const btnInstalarApp = document.getElementById('btn-instalar-app');
  if (btnInstalarApp) {
    btnInstalarApp.onclick = triggerPwaInstall;
  }

  document.querySelectorAll('input[name="setting-unit"]').forEach(r => {
    r.onchange = (e) => {
      if (e.target.checked) updateSettingsPreview(e.target.value);
    };
  });

  const fmSet = document.getElementById('btn-fm-settings');
  if (fmSet) fmSet.onclick = openSettings;

  const notesSet = document.getElementById('btn-notes-settings');
  if (notesSet) notesSet.onclick = openSettings;

  const pdfSet = document.getElementById('btn-pdf-settings');
  if (pdfSet) pdfSet.onclick = openSettings;

  if (btnClose) btnClose.onclick = closeSettings;
  if (btnCancel) btnCancel.onclick = closeSettings;

  // Eventos del Modal de Acceso Directo e Instalación
  const btnCloseInstall = document.getElementById('btn-close-modal-install');
  const btnCloseInstallOk = document.getElementById('btn-close-modal-install-ok');
  if (btnCloseInstall) btnCloseInstall.onclick = closeShortcutModal;
  if (btnCloseInstallOk) btnCloseInstallOk.onclick = closeShortcutModal;

  const modalInstall = document.getElementById('modal-install-shortcut');
  if (modalInstall) {
    modalInstall.addEventListener('click', (e) => {
      if (e.target === modalInstall) closeShortcutModal();
    });
  }

  // Pestañas de dispositivos (Android / iPad / Windows)
  document.querySelectorAll('.device-tab-btn').forEach(btn => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      if (tab) switchInstallDeviceTab(tab);
    };
  });

  // Botones de descarga de accesos directos Windows
  const btnWinShortcut = document.getElementById('btn-download-win-shortcut');
  if (btnWinShortcut) btnWinShortcut.onclick = downloadWindowsUrlShortcut;

  const btnWinLauncher = document.getElementById('btn-download-win-launcher');
  if (btnWinLauncher) btnWinLauncher.onclick = downloadWindowsBatLauncher;

  const btnPwaInstant = document.getElementById('btn-pwa-instant-install');
  if (btnPwaInstant) btnPwaInstant.onclick = triggerPwaInstall;

  // Botón Vincular Carpeta de la Tablet
  const btnSelectDir = document.getElementById('btn-select-device-dir');
  if (btnSelectDir) {
    btnSelectDir.onclick = async () => {
      if (!window.showDirectoryPicker) {
        showAlertModal(
          'Tu navegador o dispositivo actual no soporta la selección directa de carpetas del sistema (File System Access API). Puedes usar la opción de "Descargar / Restaurar Copia de Seguridad" para exportar e importar todos tus apuntes.',
          'Navegador No Compatible'
        );
        return;
      }

      try {
        const handle = await window.showDirectoryPicker({
          mode: 'readwrite',
          startIn: 'documents'
        });

        if (handle) {
          state.deviceDirHandle = handle;
          state.deviceDirName = handle.name;
          await dbSaveDirectoryHandle(handle);
          updateStorageDirUI();

          // Preguntar o sincronizar inmediatamente
          await syncDeviceDirectory();
        }
      } catch (err) {
        if (err.name === 'SecurityError') {
          showAlertModal(
            'El navegador bloquea carpetas del sistema (como la raíz C:\\, Windows o Archivos de Programa) por seguridad.\n\nPor favor, pulsa de nuevo en "Vincular Carpeta", entra en tu carpeta "Documentos", crea una subcarpeta llamada "Mis Apuntes" y selecciónala.',
            'Carpeta Protegida del Sistema'
          );
        } else if (err.name !== 'AbortError') {
          console.error('Error seleccionando carpeta:', err);
          showAlertModal(`No se pudo vincular la carpeta: ${err.message}`, 'Error de Acceso');
        }
      }
    };
  }

  // Botón Sincronizar y Leer Archivos
  const btnSyncDir = document.getElementById('btn-sync-device-dir');
  if (btnSyncDir) {
    btnSyncDir.onclick = async () => {
      await syncDeviceDirectory();
    };
  }

  // Botón Desvincular Carpeta
  const btnDisconnectDir = document.getElementById('btn-disconnect-device-dir');
  if (btnDisconnectDir) {
    btnDisconnectDir.onclick = async () => {
      state.deviceDirHandle = null;
      state.deviceDirName = null;
      await dbRemoveDirectoryHandle();
      updateStorageDirUI();
      showAlertModal('Se ha desvinculado la carpeta del dispositivo. La app seguirá guardando en el almacenamiento interno de IndexedDB.', 'Carpeta Desvinculada');
    };
  }

  // Botón Exportar Copia de Seguridad
  const btnExportBackup = document.getElementById('btn-export-all-backup');
  if (btnExportBackup) {
    btnExportBackup.onclick = () => exportFullBackup();
  }

  // Botón Importar Copia de Seguridad
  const btnImportBackup = document.getElementById('btn-import-all-backup');
  const inputBackupFile = document.getElementById('input-backup-file');
  if (btnImportBackup && inputBackupFile) {
    btnImportBackup.onclick = () => inputBackupFile.click();
    inputBackupFile.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        await importFullBackup(file);
      }
      inputBackupFile.value = '';
    };
  }

  if (btnSave) {
    btnSave.onclick = () => {
      const selected = document.querySelector('input[name="setting-unit"]:checked');
      if (selected) {
        state.settings.unit = selected.value;
      }
      const checkStylus = document.getElementById('input-setting-stylus-only');
      if (checkStylus) {
        state.settings.stylusOnly = checkStylus.checked;
      }
      saveUserSettings();
      updateStylusModeUI();
      updateAllMeasurementLabels();

      showAlertModal(`Ajustes guardados correctamente.`, 'Ajustes Guardados');
      closeSettings();
    };
  }
}

// Control del Modo Solo Lápiz (Palm Rejection)
function updateStylusModeUI() {
  const isStylusOnly = state.settings ? state.settings.stylusOnly !== false : true;
  const ids = [
    'btn-toggle-stylus-mode-notes',
    'btn-toggle-stylus-mode-pdf',
    'btn-toggle-stylus-mode-split'
  ];

  ids.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.toggle('active', isStylusOnly);
    btn.setAttribute('aria-pressed', isStylusOnly ? 'true' : 'false');
    btn.title = isStylusOnly 
      ? 'Modo Desplazamiento Táctil ACTIVO (Desliza con el dedo para scrollear y cambiar de página / Escribe con el lápiz). Pulsa para dibujar también con el dedo.' 
      : 'Modo Dibujo con Dedo ACTIVO (El dedo dibuja trazos). Pulsa para activar el desplazamiento con el dedo.';

    const txt = btn.querySelector('.stylus-status-text');
    if (txt) {
      txt.innerHTML = isStylusOnly ? 'Dedo: <strong>Desplaza</strong>' : 'Dedo: <span>Dibuja</span>';
    }
    const icon = btn.querySelector('.stylus-icon');
    if (icon) {
      icon.textContent = isStylusOnly ? '🖐️' : '✏️';
    }
  });

  const checkSettings = document.getElementById('input-setting-stylus-only');
  if (checkSettings) {
    checkSettings.checked = isStylusOnly;
  }
}

function toggleStylusMode() {
  state.settings.stylusOnly = !state.settings.stylusOnly;
  saveUserSettings();
  updateStylusModeUI();
  if (state.settings.stylusOnly) {
    if (typeof showToast === 'function') {
      showToast('🖐️ Desplazamiento con dedo activado (Scrollea con el dedo y escribe con el lápiz)', 'success');
    }
  } else {
    if (typeof showToast === 'function') {
      showToast('✏️ Dibujo con dedo activado', 'info');
    }
  }
}

// ===== FUNCIONES DE SINCRONIZACIÓN Y BACKUP DE ARCHIVOS =====
async function scanDirectoryRecursive(dirHandle, parentFolderId = null, stats = { foldersAdded: 0, itemsAdded: 0, itemsUpdated: 0 }) {
  const allFolders = await dbGetFolders();
  const allItems = await dbGetItems();

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      // Ignorar carpetas ocultas o de sistema
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      let folder = allFolders.find(f => f.name === entry.name && f.parentId === parentFolderId);
      if (!folder) {
        folder = await dbCreateFolder(entry.name, '#f59e0b', parentFolderId, false);
        stats.foldersAdded++;
        allFolders.push(folder);
      }
      if (state.folderHandles) {
        state.folderHandles.set(folder.id, entry);
      }

      // Escaneo recursivo de la subcarpeta anidada
      await scanDirectoryRecursive(entry, folder.id, stats);
    } else if (entry.kind === 'file') {
      if (entry.name.endsWith('.json')) {
        try {
          const file = await entry.getFile();
          const text = await file.text();
          const data = JSON.parse(text);
          if (data && data.id && data.type === 'note') {
            data.parentId = parentFolderId;
            data._diskFileName = entry.name;
            const existing = allItems.find(x => x.id === data.id || (x.name === data.name && x.parentId === parentFolderId));
            if (existing) {
              if (data.updatedAt && data.updatedAt > (existing.updatedAt || 0)) {
                Object.assign(existing, data);
                await dbSaveItem(existing, false);
                stats.itemsUpdated++;
              }
            } else {
              await dbSaveItem(data, false);
              allItems.push(data);
              stats.itemsAdded++;
            }
          }
        } catch (err) {
          console.warn('Error leyendo archivo .json del disco:', entry.name, err);
        }
      } else if (entry.name.toLowerCase().endsWith('.pdf')) {
        try {
          const cleanPdfName = entry.name.replace(/\.pdf$/i, '');
          const exists = allItems.some(i => i.type === 'pdf' && (i.name === cleanPdfName || (i.pdfData && i.pdfData.fileName === entry.name)) && i.parentId === parentFolderId);
          if (!exists) {
            const file = await entry.getFile();
            const arrayBuffer = await file.arrayBuffer();
            const pdfItem = {
              id: `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              name: cleanPdfName,
              parentId: parentFolderId,
              type: 'pdf',
              pdfData: {
                arrayBuffer,
                fileName: entry.name,
                annotations: {}
              },
              _diskFileName: entry.name,
              createdAt: file.lastModified || Date.now(),
              updatedAt: file.lastModified || Date.now()
            };
            await dbSaveItem(pdfItem, false);
            allItems.push(pdfItem);
            stats.itemsAdded++;
          }
        } catch (err) {
          console.warn('Error leyendo archivo .pdf del disco:', entry.name, err);
        }
      }
    }
  }
}

async function syncDeviceDirectory(silent = false) {
  if (!state.deviceDirHandle) return;
  try {
    const stats = { foldersAdded: 0, itemsAdded: 0, itemsUpdated: 0 };
    
    // Escaneo recursivo nativo en disco con File System Access API
    await scanDirectoryRecursive(state.deviceDirHandle, null, stats);

    // Guardar también todos los apuntes actuales en sus subcarpetas físicas correspondientes si aún no están en disco
    const currentItems = await dbGetItems();
    for (const it of currentItems) {
      if (it.type === 'note') {
        await saveNoteToDeviceFolder(it);
      }
    }

    await refreshFileManager();
    if (!silent) {
      showAlertModal(
        `Sincronización completada con éxito.\n\n• Subcarpetas detectadas: ${stats.foldersAdded}\n• Archivos nuevos importados: ${stats.itemsAdded}\n• Archivos actualizados: ${stats.itemsUpdated}`,
        'Sincronización de Disco'
      );
    }
  } catch (err) {
    console.error('Error sincronizando directorio:', err);
    if (!silent) {
      showAlertModal(`Error al sincronizar con el disco: ${err.message}`, 'Error de Sincronización');
    }
  }
}

async function exportFullBackup() {
  try {
    const folders = await dbGetFolders();
    const items = await dbGetItems();

    // Convertir ArrayBuffers a Base64 para exportación JSON sin pérdida en dispositivos móviles
    const serializedItems = items.map(it => {
      if (it.type === 'pdf' && it.pdfData) {
        const copy = Object.assign({}, it, {
          pdfData: Object.assign({}, it.pdfData)
        });
        const rawPdf = it.pdfData.arrayBuffer || it.pdfData.base64 || it.pdfData.data;
        const binary = normalizePdfBinaryData(rawPdf);
        if (binary) {
          copy.pdfData.base64 = arrayBufferToBase64(binary);
          delete copy.pdfData.arrayBuffer;
        }
        return copy;
      }
      return it;
    });

    const backupData = {
      app: 'Tablet Studio',
      version: 2,
      exportDate: new Date().toISOString(),
      settings: state.settings,
      customBrushes: state.customBrushes,
      favColors: state.favColors,
      folders,
      items: serializedItems
    };

    const jsonText = JSON.stringify(backupData, null, 2);
    const backupBlob = new Blob([jsonText], { type: 'application/json' });
    const backupName = `tablet_studio_backup_${new Date().toISOString().slice(0, 10)}.json`;
    await promptSaveFile(backupBlob, backupName, 'application/json', 'json');
  } catch (err) {
    showAlertModal(`Error al exportar copia de seguridad: ${err.message}`, 'Error');
  }
}

async function importFullBackup(file) {
  try {
    const text = await file.text();
    const backupData = JSON.parse(text);
    if (!backupData.folders && !backupData.items) {
      throw new Error('El archivo no tiene el formato de copia de seguridad de Tablet Studio.');
    }

    if (backupData.settings) {
      state.settings = backupData.settings;
      saveUserSettings();
    }
    if (backupData.customBrushes) {
      state.customBrushes = backupData.customBrushes;
      saveUserBrushes();
    }
    if (backupData.favColors) {
      state.favColors = backupData.favColors;
      saveUserFavColors();
    }

    if (backupData.folders && Array.isArray(backupData.folders)) {
      for (const f of backupData.folders) {
        await dbCreateFolder(f.name, f.color, f.parentId);
      }
    }
    if (backupData.items && Array.isArray(backupData.items)) {
      for (const it of backupData.items) {
        if (it.type === 'pdf' && it.pdfData) {
          const rawPdf = it.pdfData.base64 || it.pdfData.arrayBuffer || it.pdfData.data;
          const binary = normalizePdfBinaryData(rawPdf);
          if (binary) {
            it.pdfData.arrayBuffer = binary.buffer;
            it.pdfData.base64 = arrayBufferToBase64(binary);
          }
        }
        await dbSaveItem(it);
      }
    }

    await refreshFileManager();
    renderBrushShelves();
    renderExtendedPalettes();
    showAlertModal('¡Copia de seguridad restaurada con éxito! Todos tus archivos, carpetas y configuraciones se han cargado.', 'Restauración Completa');
  } catch (err) {
    showAlertModal(`Error al restaurar copia: ${err.message}`, 'Error');
  }
}

function initColorPickerEvents() {
  const newDots = document.querySelectorAll('#new-folder-color-picker .folder-color-dot');
  newDots.forEach(dot => {
    dot.onclick = () => {
      newDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      state.selectedFolderColor = dot.dataset.color;
    };
  });

  const renameDots = document.querySelectorAll('#rename-folder-color-picker .folder-color-dot');
  renameDots.forEach(dot => {
    dot.onclick = () => {
      renameDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      state.renameFolderColor = dot.dataset.color;
    };
  });
}


// ===== 5. LÓGICA DEL GESTOR DE ARCHIVOS (FILE MANAGER) =====
async function refreshFileManager() {
  state.folders = await dbGetFolders();
  state.items = await dbGetItems();

  renderBreadcrumbs();
  renderGrid();
}

function renderBreadcrumbs() {
  const container = document.getElementById('fm-breadcrumbs');
  if (!container) return;
  container.innerHTML = '';

  const rootCrumb = document.createElement('span');
  rootCrumb.className = `crumb ${state.currentFolderId === null ? 'active' : ''}`;
  rootCrumb.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
    <span>Inicio / Raíz</span>
  `;
  rootCrumb.onclick = () => {
    state.currentFolderId = null;
    refreshFileManager();
  };
  container.appendChild(rootCrumb);

  if (state.currentFolderId) {
    const chain = [];
    let curId = state.currentFolderId;
    while (curId) {
      const f = state.folders.find(x => x.id === curId);
      if (f) {
        chain.unshift(f);
        curId = f.parentId;
      } else {
        break;
      }
    }

    chain.forEach((f, idx) => {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = ' / ';
      container.appendChild(sep);

      const c = document.createElement('span');
      const isLast = idx === chain.length - 1;
      c.className = `crumb ${isLast ? 'active' : ''}`;
      c.innerHTML = `<span style="color: ${f.color || '#f59e0b'};">📁</span> <span>${f.name}</span>`;
      c.onclick = () => {
        state.currentFolderId = f.id;
        refreshFileManager();
      };
      container.appendChild(c);
    });
  }
}

// ===== MODO DE SELECCIÓN MÚLTIPLE Y DUPLICACIÓN / MOVIMIENTO EN LOTE =====
let isBatchSelectionMode = false;
let selectedItemIds = new Set();

async function dbDuplicateItem(itemOrId, targetParentId = null) {
  const allItems = await dbGetItems();
  const source = (typeof itemOrId === 'object' && itemOrId !== null) 
    ? itemOrId 
    : allItems.find(i => i.id === itemOrId);
  if (!source) return null;

  const newItem = JSON.parse(JSON.stringify(prepareItemForStorage(source)));
  newItem.id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  newItem.name = `${source.name || source.title || 'Documento'} (Copia)`;
  newItem.title = newItem.name;
  newItem.parentId = targetParentId !== null ? targetParentId : (source.parentId || null);
  newItem.createdAt = Date.now();
  newItem.updatedAt = Date.now();
  newItem._diskFileName = null;

  await dbSaveItem(newItem);
  return newItem;
}

async function dbDuplicateFolder(folderOrId, targetParentId = null) {
  const allFolders = await dbGetFolders();
  const allItems = await dbGetItems();
  const folder = (typeof folderOrId === 'object' && folderOrId !== null)
    ? folderOrId
    : allFolders.find(f => f.id === folderOrId);
  if (!folder) return null;

  const newParent = targetParentId !== null ? targetParentId : folder.parentId;
  const newFolder = await dbCreateFolder(`${folder.name} (Copia)`, folder.color, newParent);

  // Duplicar recursivamente subcarpetas
  const childFolders = allFolders.filter(f => f.parentId === folder.id);
  for (const cf of childFolders) {
    await dbDuplicateFolder(cf, newFolder.id);
  }

  // Duplicar archivos internos
  const childItems = allItems.filter(i => i.parentId === folder.id);
  for (const ci of childItems) {
    await dbDuplicateItem(ci, newFolder.id);
  }

  return newFolder;
}

function enterFmSelectionMode(initialId = null) {
  isBatchSelectionMode = true;
  state.isBatchSelectionMode = true;
  state.fmSelection.active = true;
  document.body.classList.add('selection-mode-active');
  const btnMode = document.getElementById('btn-fm-select-mode');
  if (btnMode) btnMode.classList.add('active');
  const bar = document.getElementById('fm-selection-bar');
  if (bar) bar.style.display = 'flex';

  if (initialId) {
    selectedItemIds.add(initialId);
    state.selectedItemIds.add(initialId);
    if (state.folders.some(f => f.id === initialId)) {
      state.fmSelection.selectedFolders.add(initialId);
    } else {
      state.fmSelection.selectedItems.add(initialId);
    }
  }
  updateFmSelectionUI();
  if (navigator.vibrate) {
    try { navigator.vibrate(50); } catch (e) {}
  }
}

function exitFmSelectionMode() {
  isBatchSelectionMode = false;
  state.isBatchSelectionMode = false;
  state.fmSelection.active = false;
  selectedItemIds.clear();
  state.selectedItemIds.clear();
  state.fmSelection.selectedFolders.clear();
  state.fmSelection.selectedItems.clear();
  document.body.classList.remove('selection-mode-active');
  const btnMode = document.getElementById('btn-fm-select-mode');
  if (btnMode) btnMode.classList.remove('active');
  const bar = document.getElementById('fm-selection-bar');
  if (bar) bar.style.display = 'none';
  updateFmSelectionUI();
}

function toggleFmSelection(id) {
  if (!isBatchSelectionMode) {
    enterFmSelectionMode(id);
    return;
  }
  if (selectedItemIds.has(id)) {
    selectedItemIds.delete(id);
    state.selectedItemIds.delete(id);
    state.fmSelection.selectedFolders.delete(id);
    state.fmSelection.selectedItems.delete(id);
  } else {
    selectedItemIds.add(id);
    state.selectedItemIds.add(id);
    if (state.folders.some(f => f.id === id)) {
      state.fmSelection.selectedFolders.add(id);
    } else {
      state.fmSelection.selectedItems.add(id);
    }
  }
  updateFmSelectionUI();
}

function toggleSelectAllFm() {
  const currentFolders = state.folders.filter(f => f.parentId === state.currentFolderId);
  const currentItems = state.items.filter(i => i.parentId === state.currentFolderId);
  const allCurrent = [...currentFolders, ...currentItems];
  if (allCurrent.length === 0) return;

  const allSelected = allCurrent.every(x => selectedItemIds.has(x.id));

  if (allSelected) {
    allCurrent.forEach(x => {
      selectedItemIds.delete(x.id);
      state.selectedItemIds.delete(x.id);
      state.fmSelection.selectedFolders.delete(x.id);
      state.fmSelection.selectedItems.delete(x.id);
    });
  } else {
    if (!isBatchSelectionMode) {
      enterFmSelectionMode();
    }
    allCurrent.forEach(x => {
      selectedItemIds.add(x.id);
      state.selectedItemIds.add(x.id);
      if (state.folders.some(f => f.id === x.id)) {
        state.fmSelection.selectedFolders.add(x.id);
      } else {
        state.fmSelection.selectedItems.add(x.id);
      }
    });
  }
  updateFmSelectionUI();
}

function updateFmSelectionUI() {
  const count = selectedItemIds.size;
  const countBadge = document.getElementById('selection-count-badge');
  if (countBadge) {
    countBadge.textContent = `${count} seleccionado${count === 1 ? '' : 's'}`;
  }

  const btnMove = document.getElementById('btn-fm-sel-move') || document.getElementById('btn-sel-move');
  const btnCopy = document.getElementById('btn-fm-sel-copy') || document.getElementById('btn-sel-copy');
  const btnDelete = document.getElementById('btn-fm-sel-delete') || document.getElementById('btn-sel-delete');

  const hasSelection = count > 0;
  if (btnMove) {
    btnMove.style.opacity = hasSelection ? '1' : '0.55';
    btnMove.style.pointerEvents = 'auto';
  }
  if (btnCopy) {
    btnCopy.style.opacity = hasSelection ? '1' : '0.55';
    btnCopy.style.pointerEvents = 'auto';
  }
  if (btnDelete) {
    btnDelete.style.opacity = hasSelection ? '1' : '0.55';
    btnDelete.style.pointerEvents = 'auto';
  }

  document.querySelectorAll('.fm-card[data-folder-id]').forEach(card => {
    const fId = card.dataset.folderId;
    card.classList.toggle('is-selected', selectedItemIds.has(fId));
  });
  document.querySelectorAll('.fm-card[data-item-id]').forEach(card => {
    const iId = card.dataset.itemId;
    card.classList.toggle('is-selected', selectedItemIds.has(iId));
  });
}

function attachCardLongPress(card, id, onLongPress, onClick) {
  let pressTimer = null;
  let startX = 0;
  let startY = 0;
  let longPressed = false;

  const cancelPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    card.classList.remove('long-press-holding');
  };

  card.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.card-actions')) return;
    if (isBatchSelectionMode) return;
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;

    longPressed = false;
    startX = e.clientX;
    startY = e.clientY;
    card.classList.add('long-press-holding');

    pressTimer = setTimeout(() => {
      longPressed = true;
      card.classList.remove('long-press-holding');
      if (navigator.vibrate) {
        try { navigator.vibrate(50); } catch (err) {}
      }
      onLongPress();
    }, 450);
  });

  card.addEventListener('pointermove', (e) => {
    if (!pressTimer) return;
    const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (dist > 12) {
      cancelPress();
    }
  });

  card.addEventListener('pointerup', cancelPress);
  card.addEventListener('pointercancel', cancelPress);

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-actions')) return;
    if (longPressed) {
      longPressed = false;
      return;
    }
    if (isBatchSelectionMode) {
      e.preventDefault();
      e.stopPropagation();
      toggleFmSelection(id);
    } else {
      onClick(e);
    }
  });

  card.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.card-actions')) return;
    e.preventDefault();
    cancelPress();
    onLongPress();
  });
}

async function batchDeleteSelected() {
  const allSelected = Array.from(selectedItemIds);
  const total = allSelected.length;
  if (total === 0) {
    showToast('Selecciona primero las carpetas o archivos que deseas eliminar', 'info');
    return;
  }

  if (state.deviceDirHandle) await verifyDirectoryPermission(state.deviceDirHandle, true);
  const confirmed = await showDeleteConfirmModal(`${total} elemento${total === 1 ? '' : 's'}`, 'los elementos seleccionados');
  if (confirmed) {
    for (const id of allSelected) {
      try {
        const isFolder = state.folders && state.folders.some(f => f.id === id);
        if (isFolder) {
          await dbDeleteFolder(id);
        } else {
          await dbDeleteItem(id);
        }
      } catch (err) {
        console.error('Error eliminando elemento:', id, err);
      }
    }

    exitFmSelectionMode();
    await refreshFileManager();
    showToast(`${total} elemento${total === 1 ? '' : 's'} eliminado${total === 1 ? '' : 's'} correctamente`, 'info');
  }
}

async function batchCopySelected() {
  const allSelected = Array.from(selectedItemIds);
  const total = allSelected.length;
  if (total === 0) {
    showToast('Selecciona primero las carpetas o archivos que deseas copiar', 'info');
    return;
  }

  for (const id of allSelected) {
    try {
      const isFolder = state.folders && state.folders.some(f => f.id === id);
      if (isFolder) {
        await dbDuplicateFolder(id, state.currentFolderId);
      } else {
        await dbDuplicateItem(id, state.currentFolderId);
      }
    } catch (err) {
      console.error('Error duplicando elemento:', id, err);
    }
  }

  exitFmSelectionMode();
  await refreshFileManager();
  showToast(`${total} elemento${total === 1 ? '' : 's'} duplicado${total === 1 ? '' : 's'} correctamente`, 'success');
}

async function openBatchMoveModal(selectedIds = []) {
  const idsToMove = (selectedIds && selectedIds.length > 0) ? selectedIds : Array.from(selectedItemIds);
  if (idsToMove.length === 0) {
    showToast('Selecciona primero las carpetas o archivos que deseas mover', 'info');
    return;
  }

  const modal = document.getElementById('modal-move-item');
  const list = document.getElementById('move-destinations-list');
  if (!modal || !list) return;
  list.innerHTML = '';

  const allFolders = await dbGetFolders();

  // Calcular todas las carpetas que no pueden ser destino (las seleccionadas y sus descendientes)
  const forbiddenFolderIds = new Set(idsToMove.filter(id => state.folders.some(f => f.id === id)));
  let added = true;
  while (added) {
    added = false;
    for (const f of allFolders) {
      if (f.parentId && forbiddenFolderIds.has(f.parentId) && !forbiddenFolderIds.has(f.id)) {
        forbiddenFolderIds.add(f.id);
        added = true;
      }
    }
  }

  const handleDestinationSelected = async (targetParentId) => {
    for (const id of idsToMove) {
      try {
        const isFolder = state.folders && state.folders.some(f => f.id === id);
        if (isFolder) {
          await dbMoveFolder(id, targetParentId);
        } else {
          await dbMoveItem(id, targetParentId);
        }
      } catch (err) {
        console.error('Error moviendo elemento:', id, err);
      }
    }
    modal.classList.remove('open');
    exitFmSelectionMode();
    await refreshFileManager();
    showToast(`${idsToMove.length} elemento${idsToMove.length === 1 ? '' : 's'} movido${idsToMove.length === 1 ? '' : 's'} con éxito`, 'success');
  };

  const rootOption = document.createElement('div');
  rootOption.className = 'dest-row';
  rootOption.innerHTML = '<span>🏠 Raíz / Inicio</span>';
  rootOption.onclick = () => handleDestinationSelected(null);
  list.appendChild(rootOption);

  allFolders.forEach(f => {
    if (forbiddenFolderIds.has(f.id)) return;
    const opt = document.createElement('div');
    opt.className = 'dest-row';
    opt.innerHTML = `<span style="color: ${f.color || '#f59e0b'};">📁</span> <span>${f.name}</span>`;
    opt.onclick = () => handleDestinationSelected(f.id);
    list.appendChild(opt);
  });

  modal.classList.add('open');
  const btnClose = document.getElementById('btn-close-modal-move');
  if (btnClose) btnClose.onclick = () => modal.classList.remove('open');
  const btnCancel = document.getElementById('btn-cancel-modal-move');
  if (btnCancel) btnCancel.onclick = () => modal.classList.remove('open');
}

function openMoveModal(id, type) {
  openBatchMoveModal([id]);
}

function renderGrid() {
  const grid = document.getElementById('fm-grid');
  const emptyState = document.getElementById('fm-empty-state');
  if (!grid) return;
  grid.innerHTML = '';

  const currentFolders = state.folders.filter(f => f.parentId === state.currentFolderId);
  const currentItems = state.items.filter(i => i.parentId === state.currentFolderId);

  const statsEl = document.getElementById('fm-stats');
  if (statsEl) {
    statsEl.textContent = `${currentFolders.length} carpetas, ${currentItems.length} archivos`;
  }

  if (currentFolders.length === 0 && currentItems.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    return;
  }
  if (emptyState) emptyState.style.display = 'none';

  // Renderizar Carpetas con Colores Personalizados y Selección Múltiple
  currentFolders.forEach(folder => {
    const fColor = folder.color || '#3b82f6';
    const hexMatch = (fColor || '#3b82f6').replace('#', '');
    const r = parseInt(hexMatch.substring(0, 2), 16) || 59;
    const g = parseInt(hexMatch.substring(2, 4), 16) || 130;
    const b = parseInt(hexMatch.substring(4, 6), 16) || 246;

    const isSelected = selectedItemIds.has(folder.id);
    const card = document.createElement('div');
    card.className = `fm-card card-folder ${isSelected ? 'is-selected' : ''}`;
    card.dataset.folderId = folder.id;
    card.dataset.id = folder.id;
    card.style.setProperty('--folder-accent', fColor);
    card.style.setProperty('--folder-rgb', `${r}, ${g}, ${b}`);

    card.innerHTML = `
      <div class="card-select-indicator" title="Seleccionar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
      <div class="card-top">
        <div class="card-icon folder-icon-box" style="background: rgba(${r}, ${g}, ${b}, 0.16); border: 1.5px solid rgba(${r}, ${g}, ${b}, 0.35); box-shadow: 0 4px 12px rgba(${r}, ${g}, ${b}, 0.2);">
          <svg class="folder-svg-icon" viewBox="0 0 24 24" fill="${fColor}" fill-opacity="0.32" stroke="${fColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
          </svg>
        </div>
        <span class="card-badge badge-folder" style="color: ${fColor}; background: rgba(${r}, ${g}, ${b}, 0.14); border: 1px solid rgba(${r}, ${g}, ${b}, 0.32);">Carpeta</span>
      </div>
      <div class="card-body">
        <div class="card-title">${folder.name}</div>
        <div class="card-date">${new Date(folder.createdAt).toLocaleDateString()}</div>
      </div>
      <div class="card-actions">
        <button class="btn-card-action btn-rename" title="Renombrar / Cambiar Color">✏️</button>
        <button class="btn-card-action btn-move" title="Mover">📦</button>
        <button class="btn-card-action btn-del" title="Eliminar">🗑️</button>
      </div>
    `;

    // Long press & click
    attachCardLongPress(
      card,
      folder.id,
      () => {
        if (!isBatchSelectionMode) {
          enterFmSelectionMode(folder.id);
        } else {
          toggleFmSelection(folder.id);
        }
      },
      () => {
        state.currentFolderId = folder.id;
        refreshFileManager();
      }
    );

    card.querySelector('.btn-rename').onclick = async (e) => {
      e.stopPropagation();
      if (state.deviceDirHandle) await verifyDirectoryPermission(state.deviceDirHandle, true);
      const res = await showRenameModal(folder.name, true, folder.color);
      if (res && res.name && res.name.trim()) {
        await dbRenameFolder(folder.id, res.name.trim(), res.color);
        await refreshFileManager();
      }
    };

    card.querySelector('.btn-move').onclick = (e) => {
      e.stopPropagation();
      openMoveModal(folder.id, 'folder');
    };

    card.querySelector('.btn-del').onclick = async (e) => {
      e.stopPropagation();
      if (state.deviceDirHandle) await verifyDirectoryPermission(state.deviceDirHandle, true);
      const confirmed = await showDeleteConfirmModal(folder.name, 'carpeta');
      if (confirmed) {
        await dbDeleteFolder(folder.id);
        await refreshFileManager();
      }
    };

    grid.appendChild(card);
  });

  // Renderizar Archivos (Apuntes, PDFs y Sesiones Duales) con Selección Múltiple
  currentItems.forEach(item => {
    const isSelected = selectedItemIds.has(item.id);
    const card = document.createElement('div');
    const isSplit = item.type === 'split_session';
    const isNote = item.type === 'note' || item.type === 'notebook';
    card.className = `fm-card ${isSplit ? 'card-split' : isNote ? 'card-note' : 'card-pdf'} ${isSelected ? 'is-selected' : ''}`;
    card.dataset.itemId = item.id;
    card.dataset.id = item.id;

    let badgeHtml = '';
    let icon = '📝';
    if (isSplit) {
      icon = '🪟';
      badgeHtml = `<span class="card-badge badge-split">Sesión Dual</span>`;
    } else if (isNote) {
      const isA4 = item.noteMode === 'a4_continuous';
      badgeHtml = `<span class="card-badge ${isA4 ? 'badge-a4' : 'badge-inf'}">${isA4 ? 'A4 Continuo' : 'Infinito'}</span>`;
    } else {
      icon = '📄';
      const countStr = (item.pdfData && item.pdfData.pageCount) ? ` • ${item.pdfData.pageCount} págs` : '';
      badgeHtml = `<span class="card-badge badge-pdf">PDF${countStr}</span>`;
    }

    card.innerHTML = `
      <div class="card-select-indicator" title="Seleccionar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
      <div class="card-top">
        <div class="card-icon">${icon}</div>
        ${badgeHtml}
      </div>
      <div class="card-body">
        <div class="card-title">${item.name || item.title}</div>
        <div class="card-date">${new Date(item.updatedAt || item.createdAt).toLocaleDateString()}</div>
      </div>
      <div class="card-actions">
        <button class="btn-card-action btn-rename" title="Renombrar">✏️</button>
        <button class="btn-card-action btn-move" title="Mover">📦</button>
        <button class="btn-card-action btn-del" title="Eliminar">🗑️</button>
      </div>
    `;

    // Long press & click
    attachCardLongPress(
      card,
      item.id,
      () => {
        if (!isBatchSelectionMode) {
          enterFmSelectionMode(item.id);
        } else {
          toggleFmSelection(item.id);
        }
      },
      () => {
        if (isSplit) {
          openSplitSession(item);
        } else {
          openDocument(item);
        }
      }
    );

    card.querySelector('.btn-rename').onclick = async (e) => {
      e.stopPropagation();
      if (state.deviceDirHandle) await verifyDirectoryPermission(state.deviceDirHandle, true);
      const res = await showRenameModal(item.name, false);
      if (res && res.name && res.name !== item.name) {
        const oldDiskFileName = item._diskFileName || (item.type === 'note' ? getNoteFileName(item) : `${(item.name || 'documento').replace(/[/\\?%*:|"<>]/g, '_')}.pdf`);
        if (state.deviceDirHandle) {
          try {
            const targetDirHandle = await getDirectoryHandleForFolder(item.parentId);
            if (targetDirHandle && oldDiskFileName) {
              await targetDirHandle.removeEntry(oldDiskFileName).catch(() => {});
            }
          } catch (err) {}
        }
        item.name = res.name;
        item._diskFileName = null;
        await dbSaveItem(item);
        await refreshFileManager();
      }
    };

    card.querySelector('.btn-move').onclick = (e) => {
      e.stopPropagation();
      openMoveModal(item.id, 'item');
    };

    card.querySelector('.btn-del').onclick = async (e) => {
      e.stopPropagation();
      if (state.deviceDirHandle) await verifyDirectoryPermission(state.deviceDirHandle, true);
      const confirmed = await showDeleteConfirmModal(item.name, 'archivo');
      if (confirmed) {
        await dbDeleteItem(item.id);
        await refreshFileManager();
      }
    };

    grid.appendChild(card);
  });

  updateFmSelectionUI();
}

function initFileManagerEvents() {
  // Botones de Modo Selección Múltiple y Barra Flotante
  const btnSelectMode = document.getElementById('btn-fm-select-mode');
  if (btnSelectMode) {
    btnSelectMode.onclick = () => {
      if (isBatchSelectionMode) {
        exitFmSelectionMode();
      } else {
        enterFmSelectionMode();
      }
    };
  }

  const btnSelAll = document.getElementById('btn-fm-sel-all') || document.getElementById('btn-sel-all');
  if (btnSelAll) {
    btnSelAll.onclick = (e) => {
      if (e) e.stopPropagation();
      toggleSelectAllFm();
    };
  }

  const btnSelMove = document.getElementById('btn-fm-sel-move') || document.getElementById('btn-sel-move');
  if (btnSelMove) {
    btnSelMove.onclick = (e) => {
      if (e) e.stopPropagation();
      openBatchMoveModal();
    };
  }

  const btnSelCopy = document.getElementById('btn-fm-sel-copy') || document.getElementById('btn-sel-copy');
  if (btnSelCopy) {
    btnSelCopy.onclick = (e) => {
      if (e) e.stopPropagation();
      batchCopySelected();
    };
  }

  const btnSelDelete = document.getElementById('btn-fm-sel-delete') || document.getElementById('btn-sel-delete');
  if (btnSelDelete) {
    btnSelDelete.onclick = (e) => {
      if (e) e.stopPropagation();
      batchDeleteSelected();
    };
  }

  const btnSelCancel = document.getElementById('btn-fm-sel-cancel') || document.getElementById('btn-sel-cancel');
  if (btnSelCancel) {
    btnSelCancel.onclick = (e) => {
      if (e) e.stopPropagation();
      exitFmSelectionMode();
    };
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isBatchSelectionMode) {
      exitFmSelectionMode();
    }
  });

  const modalNote = document.getElementById('modal-new-note');
  const btnNewNote = document.getElementById('btn-fm-new-note'); if (btnNewNote) btnNewNote.onclick = () => {
    document.getElementById('input-note-name').value = '';
    modalNote.classList.add('open');
    document.getElementById('input-note-name').focus();
  };
  const btnCloseNote = document.getElementById('btn-close-modal-note'); if (btnCloseNote) btnCloseNote.onclick = () => modalNote.classList.remove('open');
  const btnCancelNote = document.getElementById('btn-cancel-modal-note'); if (btnCancelNote) btnCancelNote.onclick = () => modalNote.classList.remove('open');

  const updateNewNoteDimPreview = () => {
    const selectedSize = document.querySelector('input[name="note-paper-size"]:checked')?.value || 'a4';
    const selectedOrient = document.querySelector('input[name="note-orientation"]:checked')?.value || 'portrait';
    const orientGroup = document.getElementById('note-orientation-group');
    if (orientGroup) {
      orientGroup.style.display = selectedSize === 'infinite' ? 'none' : 'block';
    }

    const paper = PAPER_SIZES[selectedSize] || PAPER_SIZES.a4;
    const dimLabel = document.getElementById('new-note-paper-dim-label');
    if (!dimLabel) return;

    if (selectedSize === 'infinite') {
      dimLabel.textContent = 'Espacio Libre Infinito';
    } else {
      let w = paper.widthPx;
      let h = paper.heightPx;
      if (selectedOrient === 'landscape') {
        const temp = w;
        w = h;
        h = temp;
      }
      dimLabel.textContent = `${formatPxToUnit(w)} × ${formatPxToUnit(h)}`;
    }
  };

  document.querySelectorAll('.paper-size-card').forEach(card => {
    card.onclick = () => {
      document.querySelectorAll('.paper-size-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
      updateNewNoteDimPreview();
    };
  });

  document.querySelectorAll('.orient-option-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.orient-option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const radio = btn.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
      updateNewNoteDimPreview();
    };
  });

  const formNewNote = document.getElementById('form-new-note'); if (formNewNote) formNewNote.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('input-note-name').value.trim();
    const paperSize = document.querySelector('input[name="note-paper-size"]:checked')?.value || 'a4';
    const orientation = document.querySelector('input[name="note-orientation"]:checked')?.value || 'portrait';
    if (!name) return;

    if (state.deviceDirHandle) {
      await verifyDirectoryPermission(state.deviceDirHandle, true);
    }

    modalNote.classList.remove('open');
    const newNote = await dbCreateNote(name, paperSize, orientation, state.currentFolderId);
    await refreshFileManager();
    openDocument(newNote);
  };

  const FOLDER_PALETTE_COLORS = [
    '#2563eb', '#0284c7', '#06b6d4', '#0d9488', '#10b981', 
    '#16a34a', '#84cc16', '#eab308', '#f59e0b', '#f97316', 
    '#ef4444', '#e11d48', '#ec4899', '#f43f5e', '#a855f7', 
    '#7c3aed', '#4f46e5', '#92400e', '#475569', '#0f172a'
  ];

  const modalFolder = document.getElementById('modal-new-folder');
  const btnNewFolder = document.getElementById('btn-fm-new-folder'); if (btnNewFolder) btnNewFolder.onclick = () => {
    document.getElementById('input-folder-name').value = '';
    const nextColor = FOLDER_PALETTE_COLORS[state.folders.length % FOLDER_PALETTE_COLORS.length] || '#2563eb';
    state.selectedFolderColor = nextColor;
    document.querySelectorAll('#new-folder-color-picker .folder-color-dot').forEach(dot => {
      dot.classList.toggle('active', dot.dataset.color === nextColor);
    });
    modalFolder.classList.add('open');
    document.getElementById('input-folder-name').focus();
  };
  const btnCloseFolder = document.getElementById('btn-close-modal-folder'); if (btnCloseFolder) btnCloseFolder.onclick = () => modalFolder.classList.remove('open');
  const btnCancelFolder = document.getElementById('btn-cancel-modal-folder'); if (btnCancelFolder) btnCancelFolder.onclick = () => modalFolder.classList.remove('open');

  const formNewFolder = document.getElementById('form-new-folder'); if (formNewFolder) formNewFolder.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('input-folder-name').value.trim();
    if (!name) return;

    if (state.deviceDirHandle) {
      await verifyDirectoryPermission(state.deviceDirHandle, true);
    }

    modalFolder.classList.remove('open');
    await dbCreateFolder(name, state.selectedFolderColor, state.currentFolderId);
    await refreshFileManager();
  };

  const pdfInput = document.getElementById('fm-pdf-file-input');
  const btnImportPdf = document.getElementById('btn-fm-import-pdf'); if (btnImportPdf) btnImportPdf.onclick = () => pdfInput.click();
  pdfInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      await openPdfImportPreviewModal(file);
    }
    pdfInput.value = '';
  };

  attachViewportTouchScroller(document.getElementById('fm-content-area'));
}

function openMoveModal(elementId, elementType) {
  const modal = document.getElementById('modal-move-item');
  const list = document.getElementById('move-destinations-list');
  list.innerHTML = '';

  const rootOption = document.createElement('div');
  rootOption.className = 'dest-row';
  rootOption.innerHTML = '<span>🏠 Raíz</span>';
  rootOption.onclick = async () => {
    if (elementType === 'folder') await dbMoveFolder(elementId, null);
    else await dbMoveItem(elementId, null);
    modal.classList.remove('open');
    await refreshFileManager();
  };
  list.appendChild(rootOption);

  state.folders.forEach(f => {
    if (elementType === 'folder' && f.id === elementId) return;
    const opt = document.createElement('div');
    opt.className = 'dest-row';
    opt.innerHTML = `<span style="color: ${f.color || '#f59e0b'};">📁</span> <span>${f.name}</span>`;
    opt.onclick = async () => {
      if (elementType === 'folder') await dbMoveFolder(elementId, f.id);
      else await dbMoveItem(elementId, f.id);
      modal.classList.remove('open');
      await refreshFileManager();
    };
    list.appendChild(opt);
  });

  modal.classList.add('open');
  document.getElementById('btn-close-modal-move').onclick = () => modal.classList.remove('open');
  document.getElementById('btn-cancel-modal-move').onclick = () => modal.classList.remove('open');
}

// 2. PROTOCOLO DE CIERRE / APERTURA DE LIENZO:
// Garantiza independencia absoluta por lienzo, guardado automático y purga total de memoria
async function closeActiveDocument() {
  if (!state.activeItem) return;
  const currentDoc = state.activeItem;

  // Paso 1 (Guardado automático): Guarda el estado completo (strokes, images, viewport, undo/redo)
  try {
    if (currentDoc.type === 'note' || currentDoc.type === 'notebook') {
      const titleInput = document.getElementById('notes-doc-title');
      if (titleInput && titleInput.value.trim()) {
        const newName = titleInput.value.trim();
        if (newName !== currentDoc.name) {
          const oldDiskFileName = currentDoc._diskFileName || getNoteFileName(currentDoc);
          if (state.deviceDirHandle) {
            try {
              const targetDirHandle = await getDirectoryHandleForFolder(currentDoc.parentId);
              if (targetDirHandle && oldDiskFileName) {
                await targetDirHandle.removeEntry(oldDiskFileName).catch(() => {});
              }
            } catch (e) {}
          }
          currentDoc.name = newName;
          currentDoc.title = newName;
          currentDoc._diskFileName = null;
        }
      }

      const viewport = document.getElementById('notes-viewport');
      if (viewport) {
        currentDoc.viewport = {
          x: viewport.scrollLeft || 0,
          y: viewport.scrollTop || 0,
          zoom: (state.notes && state.notes.scale) || 1.0
        };
      }

      if (state.notes) {
        currentDoc.undoStack = Array.isArray(state.notes.undoStack) ? [...state.notes.undoStack] : [];
        currentDoc.redoStack = Array.isArray(state.notes.redoStack) ? [...state.notes.redoStack] : [];
      }
    } else if (currentDoc.type === 'pdf') {
      const titleInput = document.getElementById('pdf-doc-title');
      if (titleInput && titleInput.value.trim()) {
        currentDoc.name = titleInput.value.trim();
        currentDoc.title = currentDoc.name;
      }
      const viewport = document.getElementById('pdf-continuous-viewport');
      if (viewport) {
        currentDoc.viewport = {
          x: viewport.scrollLeft || 0,
          y: viewport.scrollTop || 0,
          zoom: (state.pdf && state.pdf.scale) || 1.0
        };
      }
    }

    await dbSaveItem(currentDoc);
  } catch (err) {
    console.warn('Error en auto-guardado al cerrar lienzo:', err);
  }

  // Destruir controladores de dibujo activos y cancelar cualquier loop o animación pendiente
  if (noteDrawingEngine && typeof noteDrawingEngine.destroy === 'function') {
    noteDrawingEngine.destroy();
    noteDrawingEngine = null;
  }
  if (state.pdf && state.pdf.pageCanvasControllers) {
    for (const ctrl of Object.values(state.pdf.pageCanvasControllers)) {
      if (ctrl && typeof ctrl.destroy === 'function') {
        ctrl.destroy();
      }
    }
    state.pdf.pageCanvasControllers = {};
  }

  // Paso 2 (Purga total de memoria): Vacía por completo las variables globales o de vista activa
  if (state.notes) {
    state.notes.undoStack = [];
    state.notes.redoStack = [];
    state.notes.selectedStrokeIds.clear();
    state.notes.selectedImageId = null;
    state.notes.selectionBounds = null;
    state.notes.isSelectionActive = false;
    state.notes.isDraggingSelection = false;
  }
  const selectionBar = document.getElementById('selection-actions-bar');
  if (selectionBar) selectionBar.style.display = 'none';

  // Paso 3 (Limpieza del Canvas): Ejecuta 'ctx.clearRect(0, 0, canvas.width, canvas.height)'
  const notesCanvas = document.getElementById('notes-canvas');
  if (notesCanvas) {
    const ctx = notesCanvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, notesCanvas.width, notesCanvas.height);
    }
  }
  const selCanvas = document.getElementById('notes-selection-canvas');
  if (selCanvas) {
    const sctx = selCanvas.getContext('2d');
    if (sctx) {
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    }
  }

  state.activeItem = null;
}

async function openDocument(item) {
  if (!item) return;

  if (item.type === 'split_session') {
    return openSplitSession(item);
  }

  // Si había un documento abierto previamente, cerrar y purgar completamente
  if (state.activeItem) {
    await closeActiveDocument();
  }

  normalizeDocumentState(item);
  state.activeItem = item;

  // Paso 4 (Carga limpia): Carga única y exclusivamente los datos vinculados al nuevo documentId
  if (item.type === 'note' || item.type === 'notebook') {
    await loadNoteEditor(item);
  } else if (item.type === 'pdf') {
    await loadPdfEditor(item);
  }
}

// ===== 6. ENTORNO DE TRABAJO: APUNTES (LIENZO CONTINUO, SELECCIÓN Y FONDOS) =====
let noteDrawingEngine = null;

function renderPageDividers(noteItem) {
  const layer = document.getElementById('notes-page-dividers');
  if (!layer) return;
  layer.innerHTML = '';
  if (!noteItem) return;

  const isInfinite = noteItem.noteMode === 'infinite' || noteItem.paperSize === 'infinite';
  const paper = PAPER_SIZES[noteItem.paperSize] || PAPER_SIZES.a4;
  const pageHeight = noteItem.pageHeight || (isInfinite ? 2500 : paper.heightPx);
  const canvasHeight = noteItem.canvasHeight || pageHeight;
  const paperName = (PAPER_SIZES[noteItem.paperSize] ? PAPER_SIZES[noteItem.paperSize].name : (noteItem.paperSize || 'A4')).toUpperCase();
  const totalPages = isInfinite ? 1 : Math.max(1, Math.ceil(canvasHeight / pageHeight));

  // Badge Página 1 arriba a la derecha
  const topBadge = document.createElement('div');
  topBadge.className = 'page-top-badge';
  topBadge.textContent = `Pág. 1 • ${paperName}`;
  layer.appendChild(topBadge);

  // Divisores y números de página sucesivos
  if (!isInfinite) {
    for (let p = 1; p < totalPages; p++) {
      const line = document.createElement('div');
      line.className = 'page-divider-line';
      line.style.top = `${p * pageHeight}px`;

      const badge = document.createElement('div');
      badge.className = 'page-divider-badge';
      badge.textContent = `Pág. ${p + 1} • ${paperName}`;
      line.appendChild(badge);

      layer.appendChild(line);
    }
  }
}

function loadNoteEditor(noteItem) {
  normalizeDocumentState(noteItem);
  switchView('notes-editor');
  renderToolbarTools();

  // Asegurar que la herramienta activa esté seleccionada y lista para pintar
  let activeTool = state.toolbarTools.find(t => t.id === state.activeToolId);
  if (!activeTool) {
    activeTool = state.toolbarTools[0] || DEFAULT_TOOLBAR_TOOLS[0];
    state.activeToolId = activeTool.id;
  }
  handleToolButtonClick(activeTool, null);

  const titleInput = document.getElementById('notes-doc-title');
  if (titleInput) titleInput.value = noteItem.title || noteItem.name || 'Sin título';

  const isInfinite = noteItem.noteMode === 'infinite' || noteItem.paperSize === 'infinite';
  const paper = PAPER_SIZES[noteItem.paperSize] || PAPER_SIZES.a4;
  const paperName = paper.name.toUpperCase();
  const orientName = noteItem.orientation === 'landscape' ? 'Horizontal' : 'Vertical';
  const modeBadge = document.getElementById('notes-mode-badge');
  if (modeBadge) modeBadge.textContent = isInfinite ? 'Lienzo Infinito' : `${paperName} Continuo (${orientName})`;

  // Configuración de Papel y Fondo
  const bgColor = noteItem.bgColor || '#fdf6e2';
  const patternType = noteItem.patternType || 'grid';
  const gridSize = noteItem.gridSize || 28;

  applyPaperStyle(bgColor, patternType, gridSize);
  syncPaperPopoverUI(bgColor, patternType, gridSize);

  // Vinculación estricta de las pilas de deshacer/rehacer del documento activo
  state.notes.undoStack = noteItem.undoStack || [];
  state.notes.redoStack = noteItem.redoStack || [];
  state.notes.selectedStrokeIds.clear();
  state.notes.selectedImageId = null;
  state.notes.selectionBounds = null;
  state.notes.isSelectionActive = false;
  state.notes.isDraggingSelection = false;
  const actionsBar = document.getElementById('selection-actions-bar');
  if (actionsBar) actionsBar.style.display = 'none';

  const canvas = document.getElementById('notes-canvas');
  const selCanvas = document.getElementById('notes-selection-canvas');
  const container = document.getElementById('notes-container');
  const viewport = document.getElementById('notes-viewport');
  const dpr = Math.max(window.devicePixelRatio || 1, 2);

  let width = noteItem.canvasWidth || (isInfinite ? 2500 : paper.widthPx);
  const pageHeight = noteItem.pageHeight || (isInfinite ? 2500 : paper.heightPx);
  let height = noteItem.canvasHeight || pageHeight;

  container.style.width = `${width}px`;
  container.style.height = `${height}px`;

  // Limpieza absoluta del buffer de canvas antes de renderizar el nuevo lienzo
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  selCanvas.width = Math.floor(width * dpr);
  selCanvas.height = Math.floor(height * dpr);
  selCanvas.style.width = `${width}px`;
  selCanvas.style.height = `${height}px`;
  const sctx = selCanvas.getContext('2d');
  if (sctx) {
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, selCanvas.width, selCanvas.height);
  }

  renderPageDividers(noteItem);

  // Pre-cargar imágenes exclusivas del nuevo lienzo
  ensureDocImagesLoaded(noteItem);

  // Restaurar posición y escala del viewport
  if (noteItem.viewport) {
    if (typeof noteItem.viewport.zoom === 'number') {
      const currentZoom = Math.min(3.5, Math.max(0.5, noteItem.viewport.zoom));
      if (container) {
        container.style.transform = `scale(${currentZoom})`;
        container.style.transformOrigin = '0 0';
      }
      state.notes.scale = currentZoom;
    }
    if (viewport) {
      viewport.scrollLeft = noteItem.viewport.x || 0;
      viewport.scrollTop = noteItem.viewport.y || 0;
    }
  }

  // Si había un controlador anterior, destruirlo
  if (noteDrawingEngine && typeof noteDrawingEngine.destroy === 'function') {
    noteDrawingEngine.destroy();
  }

  // Instanciar motor de dibujo conectado única y exclusivamente a los datos de este documento
  noteDrawingEngine = setupDrawingEngine(
    canvas,
    selCanvas,
    () => (state.activeItem && state.activeItem.id === noteItem.id ? state.activeItem.strokes : noteItem.strokes) || [],
    (newStrokes, persist = true) => {
      noteItem.strokes = newStrokes;
      if (state.activeItem && state.activeItem.id === noteItem.id) {
        state.activeItem.strokes = newStrokes;
      }
      if (persist) {
        dbSaveItem(state.activeItem && state.activeItem.id === noteItem.id ? state.activeItem : noteItem);
      }
    },
    // Auto-extensión vertical continua hacia abajo
    !isInfinite ? (lowestY) => {
      if (lowestY > height - 450) {
        height += pageHeight;
        noteItem.canvasHeight = height;
        container.style.height = `${height}px`;
        canvas.height = Math.floor(height * dpr);
        canvas.style.height = `${height}px`;
        selCanvas.height = Math.floor(height * dpr);
        selCanvas.style.height = `${height}px`;
        renderPageDividers(noteItem);
        noteDrawingEngine.redraw();
        dbSaveItem(noteItem);
      }
    } : null,
    viewport,
    container,
    () => (state.activeItem && state.activeItem.id === noteItem.id ? state.activeItem.images : noteItem.images) || [],
    (newImages, persist = true) => {
      noteItem.images = newImages;
      if (state.activeItem && state.activeItem.id === noteItem.id) {
        state.activeItem.images = newImages;
      }
      if (persist) {
        dbSaveItem(state.activeItem && state.activeItem.id === noteItem.id ? state.activeItem : noteItem);
      }
    }
  );

  // Repintar desde cero únicamente los trazos e imágenes de este documento
  noteDrawingEngine.redraw();

  // Scroll continuo hacia abajo (Creación automática fluida de hojas)
  if (viewport) {
    viewport.onscroll = () => {
      if (!isInfinite && viewport.scrollTop + viewport.clientHeight > viewport.scrollHeight - 500) {
        height += pageHeight;
        noteItem.canvasHeight = height;
        container.style.height = `${height}px`;
        canvas.height = Math.floor(height * dpr);
        canvas.style.height = `${height}px`;
        selCanvas.height = Math.floor(height * dpr);
        selCanvas.style.height = `${height}px`;
        renderPageDividers(noteItem);
        noteDrawingEngine.redraw();
        dbSaveItem(noteItem);
      }
    };
    attachViewportTouchScroller(viewport);
  }

  updateToolBadges();
  renderBrushShelves();
  updateAllMeasurementLabels();
}

// Aplicar fondo de papel y cuadrícula con tamaño dinámico y contraste adaptativo
function applyPaperStyle(bgColor, patternType, gridSize) {
  const container = document.getElementById('notes-container');
  const bgLayer = document.getElementById('notes-paper-bg');
  const chip = document.getElementById('paper-preview-chip');

  if (container) container.style.backgroundColor = bgColor;
  if (chip) chip.style.backgroundColor = bgColor;
  if (!bgLayer) return;

  const isDark = isColorDark(bgColor);
  const strokeColor = isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(15, 23, 42, 0.14)';

  // Auto-adaptación de color de trazo si el fondo y la tinta chocan:
  if (isDark && (state.notes.color === '#0f172a' || state.notes.color === '#000000' || state.notes.color === '#111827' || state.notes.color === '#1e293b')) {
    setBrushColorDirect('#ffffff');
  } else if (!isDark && state.notes.color === '#ffffff') {
    setBrushColorDirect('#0f172a');
  }

  bgLayer.style.backgroundImage = 'none';

  if (patternType === 'grid') {
    bgLayer.style.backgroundImage = `
      linear-gradient(to right, ${strokeColor} 1px, transparent 1px),
      linear-gradient(to bottom, ${strokeColor} 1px, transparent 1px)
    `;
    bgLayer.style.backgroundSize = `${gridSize}px ${gridSize}px`;
  } else if (patternType === 'lines') {
    bgLayer.style.backgroundImage = `
      linear-gradient(to bottom, transparent ${gridSize - 1}px, ${strokeColor} ${gridSize}px)
    `;
    bgLayer.style.backgroundSize = `100% ${gridSize}px`;
  } else if (patternType === 'dots') {
    bgLayer.style.backgroundImage = `radial-gradient(circle, ${isDark ? 'rgba(255,255,255,0.30)' : 'rgba(15,23,42,0.22)'} 1.5px, transparent 1.5px)`;
    bgLayer.style.backgroundSize = `${gridSize}px ${gridSize}px`;
  } else {
    // Liso / Sin patrón
    bgLayer.style.backgroundImage = 'none';
  }

  if (noteDrawingEngine && typeof noteDrawingEngine.redraw === 'function') {
    noteDrawingEngine.redraw();
  }
}

function isColorDark(hex) {
  if (!hex || hex.length < 6) return false;
  const c = hex.replace('#', '');
  const r = parseInt(c.substr(0, 2), 16);
  const g = parseInt(c.substr(2, 2), 16);
  const b = parseInt(c.substr(4, 2), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
}

function getPageEffectiveRotation(page, userRotation = 0) {
  const intrinsic = (page && typeof page.rotate === 'number') ? page.rotate : 0;
  return (intrinsic + (userRotation || 0)) % 360;
}

function applyPatternToElement(el, patternType = 'grid', bgColor = '#ffffff', gridSize = 28) {
  if (!el) return;
  el.style.backgroundColor = bgColor;
  const isDark = isColorDark(bgColor);
  const strokeColor = isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(15, 23, 42, 0.14)';
  
  if (patternType === 'grid') {
    el.style.backgroundImage = `
      linear-gradient(to right, ${strokeColor} 1px, transparent 1px),
      linear-gradient(to bottom, ${strokeColor} 1px, transparent 1px)
    `;
    el.style.backgroundSize = `${gridSize}px ${gridSize}px`;
  } else if (patternType === 'lines') {
    el.style.backgroundImage = `
      linear-gradient(to bottom, transparent ${gridSize - 1}px, ${strokeColor} ${gridSize}px)
    `;
    el.style.backgroundSize = `100% ${gridSize}px`;
  } else if (patternType === 'dots') {
    el.style.backgroundImage = `radial-gradient(circle, ${isDark ? 'rgba(255,255,255,0.30)' : 'rgba(15,23,42,0.22)'} 1.5px, transparent 1.5px)`;
    el.style.backgroundSize = `${gridSize}px ${gridSize}px`;
  } else {
    el.style.backgroundImage = 'none';
  }
}

function drawCanvasPattern(ctx, x, y, width, height, patternType = 'grid', bgColor = '#ffffff', gridSize = 28) {
  ctx.save();
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, width, height);

  const isDark = isColorDark(bgColor);
  const strokeColor = isDark ? 'rgba(255, 255, 255, 0.20)' : 'rgba(15, 23, 42, 0.14)';
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;

  if (patternType === 'grid') {
    ctx.beginPath();
    for (let cx = x; cx <= x + width; cx += gridSize) {
      ctx.moveTo(cx, y);
      ctx.lineTo(cx, y + height);
    }
    for (let cy = y; cy <= y + height; cy += gridSize) {
      ctx.moveTo(x, cy);
      ctx.lineTo(x + width, cy);
    }
    ctx.stroke();
  } else if (patternType === 'lines') {
    ctx.beginPath();
    for (let cy = y + gridSize; cy <= y + height; cy += gridSize) {
      ctx.moveTo(x, cy);
      ctx.lineTo(x + width, cy);
    }
    ctx.stroke();
  } else if (patternType === 'dots') {
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(15,23,42,0.22)';
    for (let cx = x + gridSize / 2; cx < x + width; cx += gridSize) {
      for (let cy = y + gridSize / 2; cy < y + height; cy += gridSize) {
        ctx.beginPath();
        ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function syncPaperPopoverUI(bgColor, patternType, gridSize) {
  document.querySelectorAll('.paper-color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color.toLowerCase() === bgColor.toLowerCase());
  });
  const customColorInput = document.getElementById('input-custom-bg-color');
  if (customColorInput) {
    customColorInput.value = bgColor.startsWith('#') ? bgColor : '#fdf6e2';
  }

  document.querySelectorAll('.pattern-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pattern === patternType);
  });

  const gridSlider = document.getElementById('input-grid-size');
  if (gridSlider) gridSlider.value = gridSize;
  const gridText = document.getElementById('grid-size-text');
  if (gridText) gridText.textContent = `${gridSize}px (${formatPxToUnit(gridSize)})`;
}

function updateToolBadges() {
  const penColor = state.notes.color;
  const penColorBadge = document.getElementById('notes-pen-color-badge');
  if (penColorBadge) penColorBadge.style.backgroundColor = penColor;

  const pdfPenBadge = document.getElementById('pdf-pen-color-badge');
  if (pdfPenBadge) pdfPenBadge.style.backgroundColor = penColor;

  const eraserBadge = document.getElementById('notes-eraser-size-badge');
  if (eraserBadge) eraserBadge.textContent = `${state.notes.eraserSize}`;

  const pdfEraserBadge = document.getElementById('pdf-eraser-size-badge');
  if (pdfEraserBadge) pdfEraserBadge.textContent = `${state.notes.eraserSize}`;
}

// ===== GESTIÓN DE POPOVERS Y PINCELES INTERACTIVOS =====
function closeAllToolPopovers() {
  const popovers = [
    'popover-brush-settings',
    'popover-eraser-settings',
    'popover-palette-settings',
    'popover-shapes-settings',
    'popover-fill-settings',
    'paper-config-popover'
  ];
  popovers.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function togglePopover(popoverEl, anchorEl) {
  if (!popoverEl) return;
  const isShown = popoverEl.style.display === 'block';
  closeAllToolPopovers();
  if (!isShown) {
    popoverEl.style.display = 'block';
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const popWidth = popoverEl.offsetWidth || 340;
      let left = rect.left + (rect.width / 2) - (popWidth / 2);
      left = Math.max(12, Math.min(window.innerWidth - popWidth - 16, left));
      popoverEl.style.left = `${left}px`;
      popoverEl.style.top = `${rect.bottom + 8}px`;
    }
  }
}

function initToolPopoversEvents() {
  // Cerrar popovers al pulsar sus botones X
  const closeButtons = [
    { btn: 'btn-close-brush-popover', pop: 'popover-brush-settings' },
    { btn: 'btn-close-eraser-popover', pop: 'popover-eraser-settings' },
    { btn: 'btn-close-palette-popover', pop: 'popover-palette-settings' },
    { btn: 'btn-close-shapes-popover', pop: 'popover-shapes-settings' },
    { btn: 'btn-close-fill-popover', pop: 'popover-fill-settings' }
  ];

  closeButtons.forEach(({ btn, pop }) => {
    const b = document.getElementById(btn);
    if (b) {
      b.onclick = () => {
        const p = document.getElementById(pop);
        if (p) p.style.display = 'none';
      };
    }
  });

  // Cerrar cualquier popover / selector al hacer clic o tocar fuera de él
  document.addEventListener('pointerdown', (e) => {
    const isInsidePopover = !!e.target.closest('.tool-config-popover, #paper-config-popover, .modal-overlay, #modal-crop-image');
    const isTriggerBtn = !!e.target.closest('.tool-btn, .btn-paper-config, .btn-add-tool-circle, #btn-open-palette-modal, #btn-open-pdf-palette-modal, .brush-chip');
    if (!isInsidePopover && !isTriggerBtn) {
      closeAllToolPopovers();
    }
  });

  // Selector de Tipo de Pincel (Bolígrafo, Pluma, Pincel, Lápiz, Marcador)
  document.querySelectorAll('.brush-type-btn').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.type;
      document.querySelectorAll('.brush-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      state.notes.brushType = type;
      state.pdf.brushType = type;
      state.notes.tool = type === 'highlighter' ? 'highlighter' : 'pen';
      state.pdf.tool = state.notes.tool;

      // Sincronizar la herramienta activa en la barra superior
      const activeTool = state.toolbarTools.find(t => t.id === state.activeToolId);
      if (activeTool && (activeTool.type === 'pen' || activeTool.type === 'highlighter' || activeTool.brushType)) {
        activeTool.brushType = type;
        activeTool.type = type === 'highlighter' ? 'highlighter' : 'pen';
        if (activeTool.isBuiltin) {
          if (type === 'fountain') activeTool.name = 'Pluma';
          else if (type === 'brush') activeTool.name = 'Pincel';
          else if (type === 'pencil') activeTool.name = 'Lápiz';
          else if (type === 'highlighter') activeTool.name = 'Subrayador';
          else activeTool.name = 'Bolígrafo';
        }
        saveToolBarTools();
        renderToolbarTools();

        // Re-marcar el botón de tipo de trazo activo en el popover
        document.querySelectorAll('.brush-type-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.type === type);
        });
      }

      updateLiveBrushPreview();
    };
  });

  // Selector de Grosor de Pincel (Presets)
  document.querySelectorAll('#brush-size-presets .size-pill-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#brush-size-presets .size-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sz = parseInt(btn.dataset.size);
      state.notes.size = sz;
      state.pdf.size = sz;
      const valEl = document.getElementById('brush-size-val');
      if (valEl) valEl.textContent = formatPxToUnit(sz);
      const slider = document.getElementById('input-brush-size-slider');
      if (slider) slider.value = sz;
      updateLiveBrushPreview();
      updateToolBadges();
    };
  });

  // Slider de Grosor de Pincel
  const brushSlider = document.getElementById('input-brush-size-slider');
  if (brushSlider) {
    brushSlider.oninput = (e) => {
      const sz = parseInt(e.target.value);
      state.notes.size = sz;
      state.pdf.size = sz;
      const valEl = document.getElementById('brush-size-val');
      if (valEl) valEl.textContent = formatPxToUnit(sz);
      document.querySelectorAll('#brush-size-presets .size-pill-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.size) === sz);
      });
      updateLiveBrushPreview();
      updateToolBadges();
    };
  }

  // Selector de Grosor de Goma (Presets)
  document.querySelectorAll('#eraser-size-presets .size-pill-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#eraser-size-presets .size-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sz = parseInt(btn.dataset.size);
      state.notes.eraserSize = sz;
      state.pdf.eraserSize = sz;
      const valEl = document.getElementById('eraser-size-val');
      if (valEl) valEl.textContent = formatPxToUnit(sz);
      const slider = document.getElementById('input-eraser-size-slider');
      if (slider) slider.value = sz;
      updateToolBadges();
    };
  });

  // Slider de Grosor de Goma
  const eraserSlider = document.getElementById('input-eraser-size-slider');
  if (eraserSlider) {
    eraserSlider.oninput = (e) => {
      const sz = parseInt(e.target.value);
      state.notes.eraserSize = sz;
      state.pdf.eraserSize = sz;
      const valEl = document.getElementById('eraser-size-val');
      if (valEl) valEl.textContent = formatPxToUnit(sz);
      document.querySelectorAll('#eraser-size-presets .size-pill-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.size) === sz);
      });
      updateToolBadges();
    };
  }

  // Modos de Borrado
  const modeStrokeBtn = document.getElementById('eraser-mode-stroke');
  const modeAreaBtn = document.getElementById('eraser-mode-area');
  if (modeStrokeBtn) {
    modeStrokeBtn.onclick = () => {
      state.notes.eraserMode = 'stroke';
      state.pdf.eraserMode = 'stroke';
      modeStrokeBtn.classList.add('active');
      if (modeAreaBtn) modeAreaBtn.classList.remove('active');
    };
  }
  if (modeAreaBtn) {
    modeAreaBtn.onclick = () => {
      state.notes.eraserMode = 'area';
      state.pdf.eraserMode = 'area';
      modeAreaBtn.classList.add('active');
      if (modeStrokeBtn) modeStrokeBtn.classList.remove('active');
    };
  }

  // Formas Estándar Selector
  document.querySelectorAll('.shape-type-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.shape-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.notes.shapeType = btn.dataset.shape;
    };
  });

  document.querySelectorAll('.fill-mode-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.fill-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.notes.shapeFill = btn.dataset.fill;
    };
  });

  document.querySelectorAll('#shape-size-presets .size-pill-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#shape-size-presets .size-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.notes.shapeSize = parseInt(btn.dataset.size);
      const valEl = document.getElementById('shape-size-val');
      if (valEl) valEl.textContent = formatPxToUnit(state.notes.shapeSize);
    };
  });

  // Bote de Relleno Opacidad
  document.querySelectorAll('.bucket-opacity-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.bucket-opacity-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.notes.fillOpacity = parseFloat(btn.dataset.opacity);
    };
  });

  // Limpiar Lienzo
  const clearBtn = document.getElementById('btn-clear-canvas-notes');
  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (!state.activeItem) return;
      const confirm = await showDeleteConfirmModal('¿Limpiar todo el lienzo?', 'borrado');
      if (confirm) {
        state.notes.undoStack.push([...state.activeItem.strokes]);
        state.activeItem.strokes = [];
        dbSaveItem(state.activeItem);
        if (noteDrawingEngine) noteDrawingEngine.redraw();
        const p = document.getElementById('popover-eraser-settings');
        if (p) p.style.display = 'none';
      }
    };
  }

  // Guardar Pincel como Nuevo
  const saveBrushHandler = () => {
    const newBrush = {
      id: `b_${Date.now()}`,
      name: `Pincel ${state.customBrushes.length + 1}`,
      type: state.notes.brushType || 'pen',
      color: state.notes.color,
      size: state.notes.size,
      opacity: state.notes.opacity || 1.0
    };
    state.customBrushes.push(newBrush);
    saveUserBrushes();
    renderBrushShelves();
    showAlertModal(`¡Pincel guardado en tu barra de herramientas!`, 'Pincel Añadido');
  };

  const saveCurBtn = document.getElementById('btn-save-current-as-brush');
  if (saveCurBtn) saveCurBtn.onclick = saveBrushHandler;
  const addCustBtn = document.getElementById('btn-add-custom-brush');
  if (addCustBtn) addCustBtn.onclick = saveBrushHandler;

  // Paleta de Colores Modal
  const openPalBtn = document.getElementById('btn-open-palette-modal');
  if (openPalBtn) {
    openPalBtn.onclick = (e) => {
      togglePopover(document.getElementById('popover-palette-settings'), e.currentTarget);
    };
  }
  const pdfPaletteBtn = document.getElementById('btn-open-pdf-palette-modal');
  if (pdfPaletteBtn) {
    pdfPaletteBtn.onclick = (e) => {
      togglePopover(document.getElementById('popover-palette-settings'), e.currentTarget);
    };
  }

  // Selector libre de Color Nativo & Hex
  const colorPicker = document.getElementById('input-full-custom-color');
  const hexInput = document.getElementById('input-color-hex-text');
  if (colorPicker) {
    colorPicker.oninput = (e) => {
      const col = e.target.value;
      if (hexInput) hexInput.value = col.toUpperCase();
      applySelectedColor(col);
    };
  }
  if (hexInput) {
    hexInput.onchange = (e) => {
      let col = e.target.value.trim();
      if (!col.startsWith('#')) col = '#' + col;
      if (/^#[0-9A-F]{6}$/i.test(col)) {
        if (colorPicker) colorPicker.value = col;
        applySelectedColor(col);
      }
    };
  }

  // Guardar Favorito
  const addFavBtn = document.getElementById('btn-add-fav-color');
  if (addFavBtn) {
    addFavBtn.onclick = () => {
      const col = colorPicker ? colorPicker.value : state.notes.color;
      if (!state.favColors.includes(col)) {
        state.favColors.push(col);
        saveUserFavColors();
        renderExtendedPalettes();
      }
    };
  }
}

function applySelectedColor(col) {
  state.notes.color = col;
  state.pdf.color = col;

  document.querySelectorAll('#notes-palette .dot-btn').forEach(d => {
    d.classList.toggle('active', d.dataset.color.toLowerCase() === col.toLowerCase());
  });
  document.querySelectorAll('#pdf-palette .dot-btn').forEach(d => {
    d.classList.toggle('active', d.dataset.color.toLowerCase() === col.toLowerCase());
  });

  updateToolBadges();
  updateLiveBrushPreview();
}

function updateLiveBrushPreview() {
  const previewCanvas = document.getElementById('brush-preview-canvas');
  if (!previewCanvas) return;
  const ctx = previewCanvas.getContext('2d');
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  ctx.save();
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const type = state.notes.brushType || 'pen';
  const size = state.notes.size || 3;
  const color = state.notes.color || '#0f172a';

  if (type === 'highlighter') {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.min(size * 2.8, 30);
  } else if (type === 'pencil') {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = size;
  } else if (type === 'fountain') {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = size * 1.25;
  } else if (type === 'brush') {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = size * 1.5;
  } else {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = size;
  }

  ctx.moveTo(25, 23);
  ctx.bezierCurveTo(80, 5, 180, 42, 255, 23);
  ctx.stroke();
  ctx.restore();
}

function renderBrushShelves() {
  const shelf = document.getElementById('notes-brush-shelf');
  if (!shelf) return;
  shelf.innerHTML = '';

  state.customBrushes.forEach((b, idx) => {
    const chip = document.createElement('div');
    chip.className = 'brush-chip';
    chip.innerHTML = `
      <span class="brush-chip-color" style="background-color: ${b.color};"></span>
      <span>${b.name || `Pincel ${idx + 1}`}</span>
      <span class="brush-chip-delete" title="Eliminar pincel">&times;</span>
    `;

    chip.onclick = (e) => {
      if (e.target.classList.contains('brush-chip-delete')) {
        e.stopPropagation();
        state.customBrushes.splice(idx, 1);
        saveUserBrushes();
        renderBrushShelves();
        return;
      }

      state.notes.tool = b.type === 'highlighter' ? 'highlighter' : 'pen';
      state.notes.brushType = b.type;
      state.notes.color = b.color;
      state.notes.size = b.size;
      state.notes.opacity = b.opacity || 1.0;

      document.querySelectorAll('.brush-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      document.querySelectorAll('.brush-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === b.type);
      });

      const sizeSlider = document.getElementById('input-brush-size-slider');
      if (sizeSlider) sizeSlider.value = b.size;
      const sizeVal = document.getElementById('brush-size-val');
      if (sizeVal) sizeVal.textContent = formatPxToUnit(b.size);

      updateToolBadges();
      updateLiveBrushPreview();
    };

    shelf.appendChild(chip);
  });
}

function renderExtendedPalettes() {
  const curatedColors = [
    '#0f172a', '#334155', '#64748b', '#ffffff',
    '#1e3a8a', '#2563eb', '#38bdf8', '#06b6d4',
    '#15803d', '#22c55e', '#84cc16', '#eab308',
    '#f97316', '#ef4444', '#ec4899', '#a855f7'
  ];
  const grid = document.getElementById('extended-palette-grid');
  if (grid) {
    grid.innerHTML = '';
    const allColors = [...new Set([...curatedColors, ...(state.favColors || [])])];
    allColors.forEach(c => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `dot-btn ${state.notes.color.toLowerCase() === c.toLowerCase() ? 'active' : ''}`;
      dot.style.backgroundColor = c;
      if (c === '#ffffff') dot.style.borderColor = '#64748b';
      dot.title = c;
      dot.onclick = () => {
        applySelectedColor(c);
      };
      grid.appendChild(dot);
    });
  }
}

// ===== GESTIÓN DE HERRAMIENTAS DINÁMICAS, REORDENABLES Y AMPLIABLES (+) =====
function getToolIconSvg(tool) {
  const type = tool.brushType || tool.type;
  if (type === 'pen') {
    return `<span class="tool-emoji-icon" title="Bolígrafo">🖊️</span>`;
  } else if (type === 'fountain') {
    return `<span class="tool-emoji-icon" title="Pluma">✒️</span>`;
  } else if (type === 'brush') {
    return `<span class="tool-emoji-icon" title="Pincel">🖌️</span>`;
  } else if (type === 'pencil') {
    return `<span class="tool-emoji-icon" title="Lápiz">✏️</span>`;
  } else if (type === 'highlighter') {
    return `<span class="tool-emoji-icon" title="Marcador">🖍️</span>`;
  } else if (type === 'eraser') {
    return `<span class="tool-emoji-icon" title="Goma de Borrar">🧹</span>`;
  } else if (type === 'lasso') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" class="tool-custom-lasso-icon" title="Lazo de Selección Libre">
      <path d="M7 19.5C3.2 17.5 2.8 11.8 6.8 7.2C10.8 2.6 17.2 3.2 19.8 7.2C22.4 11.2 21 16.8 15.8 18.5C12.2 19.7 9 18.6 7 19.5Z" stroke="#3b82f6" stroke-width="2.2" stroke-dasharray="3.5 2.5" stroke-linecap="round"/>
      <path d="M7 19.5L4 22" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M5 16.5L3 19" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
  } else if (type === 'shapes') {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tool-custom-shapes-icon" title="Formas Geométricas">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <circle cx="16.5" cy="7.5" r="4.5" />
      <polygon points="12 14 6 21 18 21" />
    </svg>`;
  } else if (type === 'fill') {
    return `<span class="tool-emoji-icon" title="Bote de Relleno">🪣</span>`;
  } else if (type === 'pan') {
    return `<span class="tool-emoji-icon" title="Desplazar Lienzo">🖐️</span>`;
  } else if (type === 'image') {
    return `<span class="tool-emoji-icon" title="Insertar Imagen">🖼️</span>`;
  }
  return `<span class="tool-emoji-icon">🖊️</span>`;
}

let draggedToolId = null;

function renderToolbarTools() {
  const notesList = document.getElementById('notes-tools-draggable-list');
  const pdfList = document.getElementById('pdf-tools-draggable-list');
  const splitList = document.getElementById('split-tools-draggable-list');

  [notesList, pdfList, splitList].forEach(list => {
    if (!list) return;
    list.innerHTML = '';

    state.toolbarTools.forEach((tool) => {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.setAttribute('draggable', 'true');
      btn.dataset.toolId = tool.id;
      btn.title = `${tool.name} (Arrastra para mover el orden / Toca para activar o configurar)`;

      const isCurrentActive = state.activeToolId === tool.id;
      if (isCurrentActive) btn.classList.add('active');

      let badgeHtml = '';
      if (tool.color) {
        badgeHtml = `<span class="tool-badge-color" style="background-color: ${tool.color};"></span>`;
      } else if (tool.type === 'eraser') {
        badgeHtml = `<span class="tool-badge-size">${state.notes.eraserSize || 20}</span>`;
      }

      btn.innerHTML = `${getToolIconSvg(tool)}${badgeHtml}`;

      // Drag & Drop para mover el orden de las herramientas
      btn.ondragstart = (e) => {
        draggedToolId = tool.id;
        btn.classList.add('dragging');
        e.dataTransfer.setData('text/plain', tool.id);
      };

      btn.ondragover = (e) => {
        e.preventDefault();
        btn.classList.add('drag-over');
      };

      btn.ondragleave = () => {
        btn.classList.remove('drag-over');
      };

      btn.ondrop = (e) => {
        e.preventDefault();
        btn.classList.remove('drag-over');
        if (draggedToolId && draggedToolId !== tool.id) {
          reorderTools(draggedToolId, tool.id);
        }
      };

      btn.ondragend = () => {
        btn.classList.remove('dragging');
        draggedToolId = null;
      };

      // Click: Activar herramienta (si ya estaba seleccionada y se pulsa de nuevo, abre sus ajustes)
      btn.onclick = (e) => {
        handleToolButtonClick(tool, e.currentTarget);
      };

      list.appendChild(btn);
    });
  });

  initBrushPopoverColorGrid();
}

function reorderTools(sourceId, targetId) {
  const srcIdx = state.toolbarTools.findIndex(t => t.id === sourceId);
  const tgtIdx = state.toolbarTools.findIndex(t => t.id === targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;

  const [moved] = state.toolbarTools.splice(srcIdx, 1);
  state.toolbarTools.splice(tgtIdx, 0, moved);
  saveToolBarTools();
  renderToolbarTools();
}

function handleToolButtonClick(tool, btnElement, forceOpen = false) {
  if (tool.type === 'image') {
    const inputId = state.currentView === 'pdf-editor' ? 'input-pdf-image' : 'input-notes-image';
    const inputEl = document.getElementById(inputId);
    if (inputEl) {
      inputEl.value = '';
      inputEl.click();
    }
    return;
  }

  const isAlreadyActive = state.activeToolId === tool.id;
  state.activeToolId = tool.id;

  // Actualizar estado activo
  state.notes.tool = tool.type;
  if (tool.brushType) state.notes.brushType = tool.brushType;
  if (tool.color) {
    state.notes.color = tool.color;
    state.pdf.color = tool.color;
  }
  if (tool.size) {
    state.notes.size = tool.size;
    state.pdf.size = tool.size;
  }
  if (tool.opacity) state.notes.opacity = tool.opacity;

  if (tool.type !== 'lasso') {
    state.notes.selectedStrokeIds.clear();
    state.notes.selectedImageId = null;
    state.notes.selectionBounds = null;
    state.notes.isSelectionActive = false;
    const bar = document.getElementById('selection-actions-bar');
    if (bar) bar.style.display = 'none';
    if (noteDrawingEngine) noteDrawingEngine.clearSelectionOverlay();
  }

  // Actualizar clases activas
  document.querySelectorAll('.tool-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.toolId === tool.id);
  });

  // Solo abrir el popover si hay un botón real presionado por el usuario (btnElement !== null)
  // y se solicita explícitamente forceOpen o la herramienta ya estaba seleccionada
  const shouldOpenPopover = Boolean(btnElement) && (forceOpen || isAlreadyActive);

  if (shouldOpenPopover) {
    if (tool.type === 'pen' || tool.type === 'highlighter') {
      const pTitle = document.getElementById('brush-popover-title');
      if (pTitle) pTitle.textContent = `Ajustes de ${tool.name || 'Pincel'}`;

      document.querySelectorAll('.brush-type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === (tool.brushType || tool.type));
      });
      const sizeSlider = document.getElementById('input-brush-size-slider');
      if (sizeSlider) sizeSlider.value = state.notes.size || 3;
      const sizeVal = document.getElementById('brush-size-val');
      if (sizeVal) sizeVal.textContent = formatPxToUnit(state.notes.size || 3);
      document.querySelectorAll('#brush-size-presets .size-pill-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.size) === (state.notes.size || 3));
      });

      const delBtn = document.getElementById('btn-delete-custom-tool');
      if (delBtn) delBtn.style.display = state.toolbarTools.length > 1 ? 'inline-block' : 'none';

      updateLiveBrushPreview();
      togglePopover(document.getElementById('popover-brush-settings'), btnElement);
    } else if (tool.type === 'eraser') {
      togglePopover(document.getElementById('popover-eraser-settings'), btnElement);
    } else if (tool.type === 'shapes') {
      togglePopover(document.getElementById('popover-shapes-settings'), btnElement);
    } else if (tool.type === 'fill') {
      togglePopover(document.getElementById('popover-fill-settings'), btnElement);
    } else {
      closeAllToolPopovers();
    }
  } else {
    closeAllToolPopovers();
  }
}

function hexToRgb(hex) {
  let c = (hex || '#000000').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v) || 0));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function showColorPickerDialog(initialColor = '#2563eb') {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-custom-color-picker');
    if (!modal) return resolve(null);

    let originalColor = (initialColor && initialColor.startsWith('#')) ? initialColor.toLowerCase() : '#2563eb';
    let currentColor = originalColor;

    const swatchOrig = document.getElementById('color-preview-original');
    const hexOrig = document.getElementById('color-hex-original');
    const swatchNew = document.getElementById('color-preview-new');
    const hexNew = document.getElementById('color-hex-new');
    const nativeInput = document.getElementById('modal-color-native-input');
    const hexInput = document.getElementById('modal-color-hex-input');
    const sliderR = document.getElementById('modal-rgb-r');
    const sliderG = document.getElementById('modal-rgb-g');
    const sliderB = document.getElementById('modal-rgb-b');
    const valR = document.getElementById('modal-rgb-r-val');
    const valG = document.getElementById('modal-rgb-g-val');
    const valB = document.getElementById('modal-rgb-b-val');
    const quickGrid = document.getElementById('modal-quick-swatches');

    const btnClose = document.getElementById('btn-close-modal-color-picker');
    const btnCancel = document.getElementById('btn-cancel-modal-color');
    const btnAccept = document.getElementById('btn-accept-modal-color');

    // Visualización del color original
    if (swatchOrig) swatchOrig.style.backgroundColor = originalColor;
    if (hexOrig) hexOrig.textContent = originalColor.toUpperCase();

    const updateColorUI = (col, syncInputs = true) => {
      currentColor = col.toLowerCase();
      if (swatchNew) swatchNew.style.backgroundColor = currentColor;
      if (hexNew) hexNew.textContent = currentColor.toUpperCase();

      const rgb = hexToRgb(currentColor);
      if (valR) valR.textContent = rgb.r;
      if (valG) valG.textContent = rgb.g;
      if (valB) valB.textContent = rgb.b;

      if (syncInputs) {
        if (nativeInput) nativeInput.value = currentColor;
        if (hexInput) hexInput.value = currentColor.replace('#', '').toUpperCase();
        if (sliderR) sliderR.value = rgb.r;
        if (sliderG) sliderG.value = rgb.g;
        if (sliderB) sliderB.value = rgb.b;
      }
    };

    updateColorUI(originalColor, true);

    if (nativeInput) {
      nativeInput.oninput = (e) => {
        updateColorUI(e.target.value, true);
      };
    }

    if (hexInput) {
      hexInput.oninput = (e) => {
        let val = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
        hexInput.value = val.toUpperCase();
        if (val.length === 6 || val.length === 3) {
          updateColorUI('#' + val, false);
          if (nativeInput) nativeInput.value = currentColor;
          const rgb = hexToRgb(currentColor);
          if (sliderR) sliderR.value = rgb.r;
          if (sliderG) sliderG.value = rgb.g;
          if (sliderB) sliderB.value = rgb.b;
        }
      };
    }

    const onRgbSliderChange = () => {
      const r = parseInt(sliderR.value) || 0;
      const g = parseInt(sliderG.value) || 0;
      const b = parseInt(sliderB.value) || 0;
      const col = rgbToHex(r, g, b);
      updateColorUI(col, false);
      if (nativeInput) nativeInput.value = col;
      if (hexInput) hexInput.value = col.replace('#', '').toUpperCase();
    };

    if (sliderR) sliderR.oninput = onRgbSliderChange;
    if (sliderG) sliderG.oninput = onRgbSliderChange;
    if (sliderB) sliderB.oninput = onRgbSliderChange;

    const SUGGESTED_TONES = [
      '#0f172a', '#334155', '#475569', '#64748b', '#94a3b8', '#ffffff',
      '#dc2626', '#ef4444', '#f87171', '#f97316', '#fb923c', '#fbbf24',
      '#16a34a', '#22c55e', '#4ade80', '#06b6d4', '#22d3ee', '#0284c7',
      '#2563eb', '#3b82f6', '#60a5fa', '#6366f1', '#818cf8', '#9333ea',
      '#c084fc', '#ec4899', '#f472b6', '#db2777', '#881337', '#e11d48'
    ];

    if (quickGrid) {
      quickGrid.innerHTML = '';
      SUGGESTED_TONES.forEach(tone => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'quick-swatch-dot';
        dot.style.backgroundColor = tone;
        if (tone === '#ffffff') dot.style.borderColor = '#94a3b8';
        dot.title = tone;
        dot.onclick = () => {
          updateColorUI(tone, true);
        };
        quickGrid.appendChild(dot);
      });
    }

    modal.classList.add('open');

    const cleanup = () => {
      modal.classList.remove('open');
      if (btnClose) btnClose.onclick = null;
      if (btnCancel) btnCancel.onclick = null;
      if (btnAccept) btnAccept.onclick = null;
    };

    if (btnCancel) {
      btnCancel.onclick = () => {
        cleanup();
        resolve(null); // Cancelar: no guarda nada
      };
    }

    if (btnClose) {
      btnClose.onclick = () => {
        cleanup();
        resolve(null);
      };
    }

    if (btnAccept) {
      btnAccept.onclick = () => {
        cleanup();
        resolve(currentColor); // Aceptar: devuelve el nuevo color
      };
    }
  });
}

const BRUSH_PALETTE_COLORS = [
  '#0f172a', '#334155', '#475569', '#ffffff',
  '#dc2626', '#ef4444', '#f97316', '#eab308',
  '#16a34a', '#22c55e', '#06b6d4', '#2563eb',
  '#3b82f6', '#6366f1', '#9333ea', '#ec4899'
];

function initBrushPopoverColorGrid() {
  const container = document.getElementById('brush-popover-colors');
  if (!container) return;
  container.innerHTML = '';

  // 1. Colores predeterminados de la paleta base
  BRUSH_PALETTE_COLORS.forEach(c => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `dot-btn ${state.notes.color.toLowerCase() === c.toLowerCase() ? 'active' : ''}`;
    dot.style.backgroundColor = c;
    if (c === '#ffffff') dot.style.borderColor = '#64748b';
    dot.title = c;
    dot.onclick = () => {
      setBrushColorDirect(c);
    };
    container.appendChild(dot);
  });

  // 2. Colores personalizados guardados (con botón ✕ para eliminar)
  const customSaved = (state.favColors || []).filter(c => !BRUSH_PALETTE_COLORS.map(x => x.toLowerCase()).includes(c.toLowerCase()));
  customSaved.forEach((c) => {
    const wrap = document.createElement('div');
    wrap.className = 'dot-btn-wrap';

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `dot-btn ${state.notes.color.toLowerCase() === c.toLowerCase() ? 'active' : ''}`;
    dot.style.backgroundColor = c;
    if (c.toLowerCase() === '#ffffff') dot.style.borderColor = '#64748b';
    dot.title = `${c} (Personalizado)`;
    dot.onclick = () => {
      setBrushColorDirect(c);
    };

    const delBtn = document.createElement('span');
    delBtn.className = 'dot-btn-del';
    delBtn.innerHTML = '&times;';
    delBtn.title = `Eliminar color ${c}`;
    delBtn.onclick = (e) => {
      e.stopPropagation();
      const favIdx = state.favColors.findIndex(x => x.toLowerCase() === c.toLowerCase());
      if (favIdx !== -1) {
        state.favColors.splice(favIdx, 1);
        saveUserFavColors();
        initBrushPopoverColorGrid();
      }
    };

    wrap.appendChild(dot);
    wrap.appendChild(delBtn);
    container.appendChild(wrap);
  });

  // 3. Botón para abrir el selector libre con Aceptar y Cancelar
  const btnOpenBrushColorPicker = document.getElementById('btn-open-brush-color-picker');
  if (btnOpenBrushColorPicker) {
    btnOpenBrushColorPicker.onclick = async () => {
      const chosen = await showColorPickerDialog(state.notes.color);
      if (chosen) {
        setBrushColorDirect(chosen);
        // Guardar en favoritos si es nuevo
        const baseLower = BRUSH_PALETTE_COLORS.map(x => x.toLowerCase());
        const favLower = (state.favColors || []).map(x => x.toLowerCase());
        if (!baseLower.includes(chosen.toLowerCase()) && !favLower.includes(chosen.toLowerCase())) {
          if (!state.favColors) state.favColors = [];
          state.favColors.push(chosen.toLowerCase());
          saveUserFavColors();
        }
        initBrushPopoverColorGrid();
      }
    };
  }
}

function setBrushColorDirect(col) {
  state.notes.color = col;
  state.pdf.color = col;

  // Actualizar la herramienta activa en la barra si es un pincel
  const activeTool = state.toolbarTools.find(t => t.id === state.activeToolId);
  if (activeTool && (activeTool.type === 'pen' || activeTool.type === 'highlighter')) {
    activeTool.color = col;
    saveToolBarTools();
  }

  // Actualizar badges en los botones de la barra
  document.querySelectorAll(`.tool-btn[data-tool-id="${state.activeToolId}"] .tool-badge-color`).forEach(b => {
    b.style.backgroundColor = col;
  });

  // Actualizar dots activos en el popover
  document.querySelectorAll('#brush-popover-colors .dot-btn').forEach(d => {
    const isAct = d.title.toLowerCase().startsWith(col.toLowerCase());
    d.classList.toggle('active', isAct);
  });

  updateLiveBrushPreview();
}

function initAddCustomToolEvents() {
  const modal = document.getElementById('modal-add-custom-tool');
  if (!modal) return;

  const btnOpenNotes = document.getElementById('btn-add-tool-to-bar');
  const btnOpenPdf = document.getElementById('btn-add-pdf-tool-to-bar');
  const btnClose = document.getElementById('btn-close-modal-add-tool');
  const btnCancel = document.getElementById('btn-cancel-add-tool');
  const form = document.getElementById('form-add-custom-tool');

  let selectedType = 'pen';
  let selectedColor = '#2563eb';

  const renderManageToolsList = () => {
    const listEl = document.getElementById('manage-tools-current-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    state.toolbarTools.forEach((tool, idx) => {
      const item = document.createElement('div');
      item.className = 'manage-tool-item';

      let colorDot = '';
      if (tool.color) {
        colorDot = `<span class="manage-tool-color-dot" style="background-color: ${tool.color};"></span>`;
      }

      item.innerHTML = `
        <div class="manage-tool-info">
          <span class="manage-tool-icon">${getToolIconSvg(tool)}</span>
          <span class="manage-tool-name" title="${tool.name || 'Herramienta'}">${tool.name || 'Herramienta'}</span>
          ${colorDot}
        </div>
        <button type="button" class="btn-delete-manage-tool" title="Eliminar de la barra" ${state.toolbarTools.length <= 1 ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''}>🗑️</button>
      `;

      const delBtn = item.querySelector('.btn-delete-manage-tool');
      if (delBtn && state.toolbarTools.length > 1) {
        delBtn.onclick = (e) => {
          e.stopPropagation();
          const isDeletedActive = state.activeToolId === tool.id;
          state.toolbarTools.splice(idx, 1);
          saveToolBarTools();
          if (isDeletedActive) {
            const fallback = state.toolbarTools[0] || DEFAULT_TOOLBAR_TOOLS[0];
            state.activeToolId = fallback.id;
            handleToolButtonClick(fallback, null);
          }
          renderToolbarTools();
          renderManageToolsList();
        };
      }

      listEl.appendChild(item);
    });
  };

  const renderNewToolColors = () => {
    const colorsRow = document.getElementById('new-tool-colors-row');
    if (!colorsRow) return;
    colorsRow.innerHTML = '';
    const allPalettes = [...new Set([...BRUSH_PALETTE_COLORS, ...(state.favColors || [])])];
    allPalettes.forEach(c => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `dot-btn ${c.toLowerCase() === selectedColor.toLowerCase() ? 'active' : ''}`;
      dot.style.backgroundColor = c;
      dot.title = c;
      dot.onclick = () => {
        selectedColor = c;
        colorsRow.querySelectorAll('.dot-btn').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
      };
      colorsRow.appendChild(dot);
    });
  };

  const openModal = () => {
    selectedType = 'pen';
    selectedColor = '#2563eb';
    document.getElementById('input-new-tool-name').value = '';
    document.querySelectorAll('#new-tool-type-picker .brush-type-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.type === 'pen');
    });

    renderNewToolColors();

    const sizeInput = document.getElementById('input-new-tool-size');
    const sizeVal = document.getElementById('new-tool-size-val');
    if (sizeInput && sizeVal) {
      sizeInput.value = 3;
      sizeVal.textContent = formatPxToUnit(3);
      sizeInput.oninput = (e) => {
        sizeVal.textContent = formatPxToUnit(parseInt(e.target.value) || 1);
      };
    }

    renderManageToolsList();
    modal.classList.add('open');
  };

  const btnOpenNewToolColorPicker = document.getElementById('btn-open-new-tool-color-picker');
  if (btnOpenNewToolColorPicker) {
    btnOpenNewToolColorPicker.onclick = async () => {
      const chosen = await showColorPickerDialog(selectedColor);
      if (chosen) {
        selectedColor = chosen;
        // Auto-guardar en favoritos
        const baseLower = BRUSH_PALETTE_COLORS.map(x => x.toLowerCase());
        const favLower = (state.favColors || []).map(x => x.toLowerCase());
        if (!baseLower.includes(chosen.toLowerCase()) && !favLower.includes(chosen.toLowerCase())) {
          if (!state.favColors) state.favColors = [];
          state.favColors.push(chosen.toLowerCase());
          saveUserFavColors();
        }
        renderNewToolColors();
      }
    };
  }

  const closeModal = () => modal.classList.remove('open');

  if (btnOpenNotes) btnOpenNotes.onclick = openModal;
  if (btnOpenPdf) btnOpenPdf.onclick = openModal;
  if (btnClose) btnClose.onclick = closeModal;
  if (btnCancel) btnCancel.onclick = closeModal;

  const btnResetTools = document.getElementById('btn-reset-default-tools');
  if (btnResetTools) {
    btnResetTools.onclick = () => {
      state.toolbarTools = JSON.parse(JSON.stringify(DEFAULT_TOOLBAR_TOOLS));
      state.activeToolId = state.toolbarTools[0].id;
      saveToolBarTools();
      renderToolbarTools();
      handleToolButtonClick(state.toolbarTools[0], null);
      renderManageToolsList();
    };
  }

  document.querySelectorAll('#new-tool-type-picker .brush-type-btn').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#new-tool-type-picker .brush-type-btn').forEach(btn => btn.classList.remove('active'));
      b.classList.add('active');
      selectedType = b.dataset.type;
    };
  });

  form.onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('input-new-tool-name').value.trim() || 'Nuevo Pincel';
    const size = parseInt(document.getElementById('input-new-tool-size').value) || 3;

    const newTool = {
      id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: selectedType === 'highlighter' ? 'highlighter' : 'pen',
      brushType: selectedType,
      name,
      color: selectedColor,
      size,
      opacity: selectedType === 'highlighter' ? 0.45 : 1.0,
      isBuiltin: false
    };

    state.toolbarTools.push(newTool);
    saveToolBarTools();
    renderToolbarTools();
    handleToolButtonClick(newTool, null);
    closeModal();
  };

  // Botón Eliminar Herramienta desde el popover
  const btnDeleteCustom = document.getElementById('btn-delete-custom-tool');
  if (btnDeleteCustom) {
    btnDeleteCustom.onclick = () => {
      if (state.toolbarTools.length <= 1) return;
      const idx = state.toolbarTools.findIndex(t => t.id === state.activeToolId);
      if (idx !== -1) {
        state.toolbarTools.splice(idx, 1);
        saveToolBarTools();
        const fallback = state.toolbarTools[0] || DEFAULT_TOOLBAR_TOOLS[0];
        state.activeToolId = fallback.id;
        renderToolbarTools();
        handleToolButtonClick(fallback, null);
        closeAllToolPopovers();
      }
    };
  }

  // Guardar actual como pincel favorito desde el popover
  const saveAsBtn = document.getElementById('btn-save-current-as-brush');
  if (saveAsBtn) {
    saveAsBtn.onclick = () => {
      const curType = state.notes.brushType || 'pen';
      const newTool = {
        id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: curType === 'highlighter' ? 'highlighter' : 'pen',
        brushType: curType,
        name: `Pincel ${state.toolbarTools.length + 1}`,
        color: state.notes.color,
        size: state.notes.size || 3,
        opacity: curType === 'highlighter' ? 0.45 : 1.0,
        isBuiltin: false
      };
      state.toolbarTools.push(newTool);
      saveToolBarTools();
      renderToolbarTools();
      handleToolButtonClick(newTool, null);
      closeAllToolPopovers();
    };
  }
}

// ===== ROTACIÓN Y TRANSFORMACIÓN VECTORIAL / BITMAP DE ELEMENTOS =====
function rotateImageStrokeBitmap(imgStroke, degrees = 90) {
  return new Promise((resolve) => {
    const src = imgStroke.src || imgStroke.dataUrl;
    if (!src) return resolve();
    const img = new Image();
    img.onload = () => {
      const is90or270 = Math.abs(degrees) % 180 === 90;
      const naturalW = img.naturalWidth || img.width || 100;
      const naturalH = img.naturalHeight || img.height || 100;
      const off = document.createElement('canvas');
      off.width = is90or270 ? naturalH : naturalW;
      off.height = is90or270 ? naturalW : naturalH;
      const ctx = off.getContext('2d');
      ctx.translate(off.width / 2, off.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -naturalW / 2, -naturalH / 2);

      const newUrl = off.toDataURL('image/png');
      imgStroke.dataUrl = newUrl;
      imgStroke.src = newUrl;

      // Mantener el centro visual en el lienzo y adaptar proporciones
      const oldW = imgStroke.width || naturalW;
      const oldH = imgStroke.height || naturalH;
      const cx = (imgStroke.x || 0) + oldW / 2;
      const cy = (imgStroke.y || 0) + oldH / 2;

      if (is90or270) {
        imgStroke.width = oldH;
        imgStroke.height = oldW;
      }
      imgStroke.x = cx - imgStroke.width / 2;
      imgStroke.y = cy - imgStroke.height / 2;

      globalImageCache.delete(src);
      const newImg = new Image();
      newImg.onload = () => {
        globalImageCache.set(newUrl, newImg);
        imgStroke.element = newImg;
        resolve();
      };
      newImg.onerror = () => resolve();
      newImg.src = newUrl;
    };
    img.onerror = () => resolve();
    img.src = src;
  });
}

function rotateStrokePoints(stroke, centerX, centerY, degrees) {
  if (!stroke.points || stroke.points.length === 0) return;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  stroke.points.forEach(p => {
    const dx = p.x - centerX;
    const dy = p.y - centerY;
    p.x = centerX + (dx * cos - dy * sin);
    p.y = centerY + (dx * sin + dy * cos);
  });
}

async function rotateSelectedItems(degrees = 90) {
  if (!state.activeItem) return;
  pushDocumentUndo(state.activeItem);

  const bounds = state.notes.selectionBounds;
  const centerX = bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
  const centerY = bounds ? (bounds.minY + bounds.maxY) / 2 : 0;

  const selectedImages = (state.activeItem.images || []).filter(img => 
    state.notes.selectedStrokeIds.has(img.id) || state.notes.selectedImageId === img.id
  );
  const selectedStrokes = (state.activeItem.strokes || []).filter(s => 
    state.notes.selectedStrokeIds.has(s.id)
  );

  const rotatePromises = [];
  selectedImages.forEach(img => {
    rotatePromises.push(rotateImageStrokeBitmap(img, degrees));
  });

  selectedStrokes.forEach(s => {
    if (s.isImage) {
      rotatePromises.push(rotateImageStrokeBitmap(s, degrees));
    } else {
      rotateStrokePoints(s, centerX, centerY, degrees);
    }
  });

  await Promise.all(rotatePromises);
  dbSaveItem(state.activeItem);
  if (noteDrawingEngine) {
    noteDrawingEngine.redraw();
    noteDrawingEngine.updateSelectionBounds();
  }
}

// ===== DUPLICAR TRAZOS E IMÁGENES CORREGIDO Y ROBUSTO =====
function duplicateSelectedStrokes() {
  if (!state.activeItem || state.notes.selectedStrokeIds.size === 0) return;
  const currentDoc = state.activeItem;
  const selectedStrokes = (currentDoc.strokes || []).filter(s => state.notes.selectedStrokeIds.has(s.id));
  const selectedImages = (currentDoc.images || []).filter(img => state.notes.selectedStrokeIds.has(img.id) || state.notes.selectedImageId === img.id);
  if (selectedStrokes.length === 0 && selectedImages.length === 0) return;

  pushDocumentUndo(currentDoc);

  const newIds = new Set();
  let duplicatedImgId = null;

  if (selectedStrokes.length > 0) {
    const duplicates = JSON.parse(JSON.stringify(selectedStrokes));
    duplicates.forEach(s => {
      s.id = `s_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      if (s.points && s.points.length > 0) {
        s.points.forEach(p => {
          p.x += 15;
          p.y += 15;
        });
      }
      currentDoc.strokes.push(s);
      newIds.add(s.id);
    });
  }

  if (selectedImages.length > 0) {
    selectedImages.forEach(imgData => {
      const { element, ...cleanData } = imgData;
      const dup = JSON.parse(JSON.stringify(cleanData));
      dup.id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      dup.x = (dup.x || 0) + 15;
      dup.y = (dup.y || 0) + 15;
      if (dup.points) {
        dup.points.forEach(p => { p.x += 15; p.y += 15; });
      }
      if (!Array.isArray(currentDoc.images)) currentDoc.images = [];
      currentDoc.images.push(dup);
      newIds.add(dup.id);
      duplicatedImgId = dup.id;
    });
    ensureDocImagesLoaded(currentDoc);
  }

  // La selección activa pasa inmediatamente a los nuevos elementos duplicados
  state.notes.selectedStrokeIds = newIds;
  state.notes.selectedImageId = duplicatedImgId;
  state.notes.isSelectionActive = true;
  dbSaveItem(currentDoc);

  if (noteDrawingEngine) {
    noteDrawingEngine.redraw();
    noteDrawingEngine.updateSelectionBounds();
  }
}

// Inserción de Imágenes en el Lienzo de Apuntes (Aislada exclusivamente al lienzo activo actual)
function insertImageIntoNotes(file) {
  if (!state.activeItem || (state.activeItem.type !== 'note' && state.activeItem.type !== 'notebook')) return;
  const currentDoc = state.activeItem;
  const reader = new FileReader();
  reader.onload = (e) => {
    // Si el usuario cambió de lienzo durante la lectura del archivo, abortar para evitar contaminación
    if (!state.activeItem || state.activeItem.id !== currentDoc.id) return;
    const src = e.target.result;
    const img = new Image();
    img.onload = () => {
      if (!state.activeItem || state.activeItem.id !== currentDoc.id) return;
      globalImageCache.set(src, img);

      const maxW = Math.min(480, (currentDoc.canvasWidth || 840) - 80);
      let w = img.naturalWidth || 300;
      let h = img.naturalHeight || 200;
      if (w > maxW) {
        h = Math.round(h * (maxW / w));
        w = maxW;
      }

      const viewport = document.getElementById('notes-viewport');
      const scrollTop = viewport ? viewport.scrollTop : 0;
      const scrollLeft = viewport ? viewport.scrollLeft : 0;
      const posX = Math.max(40, Math.floor(scrollLeft + ((viewport ? viewport.clientWidth : 800) - w) / 2));
      const posY = Math.max(40, Math.floor(scrollTop + 70));

      const newImage = {
        id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        isImage: true,
        src: src,
        dataUrl: src,
        x: posX,
        y: posY,
        width: w,
        height: h,
        element: img,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        aspectRatio: (img.naturalWidth && img.naturalHeight) ? (img.naturalWidth / img.naturalHeight) : (w / h),
        points: [
          { x: posX, y: posY },
          { x: posX + w, y: posY },
          { x: posX + w, y: posY + h },
          { x: posX, y: posY + h }
        ]
      };

      pushDocumentUndo(currentDoc);

      // Exclusivo de este documento: solo se agrega a su propio array 'images'
      if (!Array.isArray(currentDoc.images)) currentDoc.images = [];
      currentDoc.images.push(newImage);
      dbSaveItem(currentDoc);

      // Manipulación Inmediata: Seleccionar la imagen automáticamente
      state.notes.selectedImageId = newImage.id;
      state.notes.selectedStrokeIds.clear();
      state.notes.selectedStrokeIds.add(newImage.id);
      state.notes.isSelectionActive = true;

      // Conmutar a herramienta Lazo para permitir mover y ajustar inmediatamente
      state.notes.tool = 'lasso';
      state.activeToolId = 'tool_lasso';
      document.querySelectorAll('.tool-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.toolId === 'tool_lasso');
      });

      if (noteDrawingEngine) {
        noteDrawingEngine.redraw();
        noteDrawingEngine.updateSelectionBounds();
      }
    };
    img.src = src;
  };
  reader.readAsDataURL(file);
}

// Inserción de Imágenes en el Visor / Anotador de PDF (Fluido y Sin Alertas)
function insertImageIntoPdf(file) {
  if (!state.activeItem || state.activeItem.type !== 'pdf' || !state.pdf.doc) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      const viewport = document.getElementById('pdf-continuous-viewport');
      let targetPage = 1;
      if (viewport) {
        const pages = document.querySelectorAll('.pdf-page-wrapper');
        const viewCenter = viewport.scrollTop + viewport.clientHeight / 3;
        pages.forEach((p, idx) => {
          if (p.offsetTop <= viewCenter) {
            targetPage = idx + 1;
          }
        });
      }

      const maxW = 320;
      let w = img.naturalWidth || 200;
      let h = img.naturalHeight || 150;
      if (w > maxW) {
        h = Math.round(h * (maxW / w));
        w = maxW;
      }

      const posX = 40;
      const posY = 60;

      const imageStroke = {
        id: `img_pdf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        isImage: true,
        dataUrl,
        x: posX,
        y: posY,
        width: w,
        height: h,
        points: [
          { x: posX, y: posY },
          { x: posX + w, y: posY },
          { x: posX + w, y: posY + h },
          { x: posX, y: posY + h }
        ]
      };

      if (!state.activeItem.pdfData.annotations) state.activeItem.pdfData.annotations = {};
      if (!state.activeItem.pdfData.annotations[targetPage]) state.activeItem.pdfData.annotations[targetPage] = [];

      state.activeItem.pdfData.annotations[targetPage].push(imageStroke);
      dbSaveItem(state.activeItem);

      const controller = state.pdf.pageCanvasControllers[targetPage];
      if (controller) {
        controller.redraw();
      }
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
}

function initNotesEditorEvents() {
  document.getElementById('btn-notes-back').onclick = async () => {
    await closeActiveDocument();
    await refreshFileManager();
    switchView('file-manager');
  };

  document.getElementById('notes-doc-title').onchange = async (e) => {
    if (state.activeItem) {
      const newName = e.target.value.trim();
      if (newName && newName !== state.activeItem.name) {
        const oldDiskFileName = state.activeItem._diskFileName || getNoteFileName(state.activeItem);
        if (state.deviceDirHandle) {
          try {
            const targetDirHandle = await getDirectoryHandleForFolder(state.activeItem.parentId);
            if (targetDirHandle && oldDiskFileName) {
              await targetDirHandle.removeEntry(oldDiskFileName).catch(() => {});
            }
          } catch (e) {}
        }
        state.activeItem.name = newName;
        state.activeItem._diskFileName = null;
      }
      await dbSaveItem(state.activeItem);
    }
  };

  // Insertar Imagen en el Lienzo de Apuntes
  const inputNotesImg = document.getElementById('input-notes-image');
  if (inputNotesImg) {
    inputNotesImg.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        insertImageIntoNotes(e.target.files[0]);
      }
    };
  }

  // Toggle Modo Solo Lápiz en Apuntes
  const btnStylusNotes = document.getElementById('btn-toggle-stylus-mode-notes');
  if (btnStylusNotes) {
    btnStylusNotes.onclick = () => toggleStylusMode();
  }

  // Paleta de Colores Directa
  const dots = document.querySelectorAll('#notes-palette .dot-btn');
  dots.forEach(d => {
    d.onclick = () => applySelectedColor(d.dataset.color);
  });

  // Popover de Configuración de Papel y Cuadrícula
  const popover = document.getElementById('paper-config-popover');
  const togglePaperBtn = document.getElementById('btn-toggle-paper-panel');
  if (togglePaperBtn) {
    togglePaperBtn.onclick = (e) => {
      togglePopover(popover, e.currentTarget);
    };
  }
  const closePaperBtn = document.getElementById('btn-close-paper-popover');
  if (closePaperBtn) {
    closePaperBtn.onclick = () => {
      if (popover) popover.style.display = 'none';
    };
  }

  // Presets de Color de Fondo
  document.querySelectorAll('.paper-color-btn').forEach(btn => {
    btn.onclick = () => {
      if (!state.activeItem) return;
      const color = btn.dataset.color;
      state.activeItem.bgColor = color;
      applyPaperStyle(color, state.activeItem.patternType || 'grid', state.activeItem.gridSize || 28);
      syncPaperPopoverUI(color, state.activeItem.patternType || 'grid', state.activeItem.gridSize || 28);
      dbSaveItem(state.activeItem);
    };
  });

  // Color Libre Personalizado
  const customBgInput = document.getElementById('input-custom-bg-color');
  if (customBgInput) {
    customBgInput.oninput = (e) => {
      if (!state.activeItem) return;
      const color = e.target.value;
      state.activeItem.bgColor = color;
      applyPaperStyle(color, state.activeItem.patternType || 'grid', state.activeItem.gridSize || 28);
      syncPaperPopoverUI(color, state.activeItem.patternType || 'grid', state.activeItem.gridSize || 28);
      dbSaveItem(state.activeItem);
    };
  }

  // Tipo de Cuadrícula
  document.querySelectorAll('.pattern-type-btn').forEach(btn => {
    btn.onclick = () => {
      if (!state.activeItem) return;
      const pattern = btn.dataset.pattern;
      state.activeItem.patternType = pattern;
      applyPaperStyle(state.activeItem.bgColor || '#fdf6e2', pattern, state.activeItem.gridSize || 28);
      syncPaperPopoverUI(state.activeItem.bgColor || '#fdf6e2', pattern, state.activeItem.gridSize || 28);
      dbSaveItem(state.activeItem);
    };
  });

  // Tamaño de Cuadrícula
  const gridSlider = document.getElementById('input-grid-size');
  if (gridSlider) {
    gridSlider.oninput = (e) => {
      if (!state.activeItem) return;
      const size = parseInt(e.target.value);
      state.activeItem.gridSize = size;
      const txt = document.getElementById('grid-size-text');
      if (txt) txt.textContent = `${size}px (${formatPxToUnit(size)})`;
      applyPaperStyle(state.activeItem.bgColor || '#fdf6e2', state.activeItem.patternType || 'grid', size);
      dbSaveItem(state.activeItem);
    };
  }

  // Botón manual de Extender Altura (+ 1 Página)
  const expandBtn = document.getElementById('btn-expand-notes');
  if (expandBtn) {
    expandBtn.onclick = () => {
      if (!state.activeItem) return;
      const container = document.getElementById('notes-container');
      const canvas = document.getElementById('notes-canvas');
      const selCanvas = document.getElementById('notes-selection-canvas');
      const dpr = Math.max(window.devicePixelRatio || 1, 2);

      const paper = PAPER_SIZES[state.activeItem.paperSize] || PAPER_SIZES.a4;
      const isInfinite = state.activeItem.noteMode === 'infinite' || state.activeItem.paperSize === 'infinite';
      const pageHeight = state.activeItem.pageHeight || (isInfinite ? 2500 : paper.heightPx);

      let h = (state.activeItem.canvasHeight || pageHeight) + pageHeight;
      state.activeItem.canvasHeight = h;
      container.style.height = `${h}px`;
      canvas.height = Math.floor(h * dpr);
      canvas.style.height = `${h}px`;
      selCanvas.height = Math.floor(h * dpr);
      selCanvas.style.height = `${h}px`;
      renderPageDividers(state.activeItem);
      noteDrawingEngine.redraw();
      dbSaveItem(state.activeItem);
    };
  }

  // Rotación y Transformación de Elementos Seleccionados (Imágenes y Trazos)
  const selRotLeftBtn = document.getElementById('btn-sel-rotate-left');
  if (selRotLeftBtn) {
    selRotLeftBtn.onclick = async () => {
      await rotateSelectedItems(-90);
    };
  }

  const selRotRightBtn = document.getElementById('btn-sel-rotate-right');
  if (selRotRightBtn) {
    selRotRightBtn.onclick = async () => {
      await rotateSelectedItems(90);
    };
  }

  // Acciones de Selección (Copiar, Pegar, Duplicar, Eliminar)
  const selCopyBtn = document.getElementById('btn-sel-copy');
  if (selCopyBtn) {
    selCopyBtn.onclick = () => {
      if (!state.activeItem) return;
      const selectedStrokes = (state.activeItem.strokes || []).filter(s => state.notes.selectedStrokeIds.has(s.id));
      const selectedImages = (state.activeItem.images || []).filter(img => state.notes.selectedStrokeIds.has(img.id) || state.notes.selectedImageId === img.id);
      const cleanImages = selectedImages.map(img => {
        const { element, ...rest } = img;
        return rest;
      });
      state.notes.clipboardStrokes = JSON.parse(JSON.stringify([...selectedStrokes, ...cleanImages]));
      showAlertModal('Elementos copiados al portapapeles', 'Copiar');
    };
  }

  const selPasteBtn = document.getElementById('btn-sel-paste');
  if (selPasteBtn) {
    selPasteBtn.onclick = () => {
      if (!state.activeItem || !state.notes.clipboardStrokes || state.notes.clipboardStrokes.length === 0) return;
      pushDocumentUndo(state.activeItem);

      const itemsToPaste = JSON.parse(JSON.stringify(state.notes.clipboardStrokes));
      state.notes.selectedStrokeIds.clear();
      let lastPastedImageId = null;

      itemsToPaste.forEach(s => {
        if (s.isImage) {
          s.id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          s.x = (s.x || 0) + 35;
          s.y = (s.y || 0) + 35;
          if (s.points) {
            s.points.forEach(p => { p.x += 35; p.y += 35; });
          }
          if (!Array.isArray(state.activeItem.images)) state.activeItem.images = [];
          state.activeItem.images.push(s);
          state.notes.selectedStrokeIds.add(s.id);
          lastPastedImageId = s.id;
        } else {
          s.id = `s_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          if (s.points) {
            s.points.forEach(p => { p.x += 35; p.y += 35; });
          }
          if (!Array.isArray(state.activeItem.strokes)) state.activeItem.strokes = [];
          state.activeItem.strokes.push(s);
          state.notes.selectedStrokeIds.add(s.id);
        }
      });

      ensureDocImagesLoaded(state.activeItem);
      state.notes.selectedImageId = lastPastedImageId;
      state.notes.isSelectionActive = true;
      dbSaveItem(state.activeItem);
      if (noteDrawingEngine) {
        noteDrawingEngine.redraw();
        noteDrawingEngine.updateSelectionBounds();
      }
    };
  }

  const selDupBtn = document.getElementById('btn-sel-duplicate');
  if (selDupBtn) {
    selDupBtn.onclick = () => {
      duplicateSelectedStrokes();
    };
  }

  const selDelBtn = document.getElementById('btn-sel-delete');
  if (selDelBtn) {
    selDelBtn.onclick = () => {
      if (!state.activeItem) return;
      pushDocumentUndo(state.activeItem);

      state.activeItem.strokes = (state.activeItem.strokes || []).filter(s => !state.notes.selectedStrokeIds.has(s.id));
      state.activeItem.images = (state.activeItem.images || []).filter(img => !state.notes.selectedStrokeIds.has(img.id) && state.notes.selectedImageId !== img.id);

      if (noteDrawingEngine && typeof noteDrawingEngine.deselectAll === 'function') {
        noteDrawingEngine.deselectAll();
      } else {
        state.notes.selectedStrokeIds.clear();
        state.notes.selectedImageId = null;
        state.notes.selectionBounds = null;
        state.notes.isSelectionActive = false;
        state.notes.isDraggingSelection = false;
        const bar = document.getElementById('selection-actions-bar');
        if (bar) bar.style.display = 'none';
        if (noteDrawingEngine) noteDrawingEngine.clearSelectionOverlay();
      }
      dbSaveItem(state.activeItem);
      if (noteDrawingEngine) noteDrawingEngine.redraw();
    };
  }

  const selClearBtn = document.getElementById('btn-sel-clear');
  if (selClearBtn) {
    selClearBtn.onclick = () => {
      if (noteDrawingEngine && typeof noteDrawingEngine.deselectAll === 'function') {
        noteDrawingEngine.deselectAll();
      } else {
        state.notes.selectedStrokeIds.clear();
        state.notes.selectedImageId = null;
        state.notes.selectionBounds = null;
        state.notes.isSelectionActive = false;
        state.notes.isDraggingSelection = false;
        const bar = document.getElementById('selection-actions-bar');
        if (bar) bar.style.display = 'none';
        if (noteDrawingEngine) noteDrawingEngine.clearSelectionOverlay();
      }
    };
  }

  // Deshacer / Rehacer exclusivo por documento
  const undoBtn = document.getElementById('btn-notes-undo');
  if (undoBtn) {
    undoBtn.onclick = () => {
      if (!state.activeItem) return;
      performUndo(state.activeItem);
    };
  }

  const redoBtn = document.getElementById('btn-notes-redo');
  if (redoBtn) {
    redoBtn.onclick = () => {
      if (!state.activeItem) return;
      performRedo(state.activeItem);
    };
  }

  // Exportar Archivo
  const exportBtn = document.getElementById('btn-notes-export');
  if (exportBtn) {
    exportBtn.onclick = () => {
      if (!state.activeItem) return;
      openExportModal('notes');
    };
  }
}

// ===== GESTIÓN DE RECORTE INTERACTIVO DE FOTOGRAFÍAS =====
let cropState = {
  stroke: null,
  image: null,
  aspectRatio: 'free',
  rotation: 0,
  cropBox: { x: 20, y: 20, w: 200, h: 200 },
  imgDisplay: { x: 0, y: 0, w: 300, h: 200, scale: 1 },
  isDraggingBox: false,
  activeHandle: null,
  dragStart: { x: 0, y: 0 },
  initialBox: null
};

function openCropModalForImage(imageStroke) {
  if (!imageStroke || !imageStroke.dataUrl) return;
  cropState.stroke = imageStroke;
  cropState.rotation = 0;
  cropState.aspectRatio = 'free';

  document.querySelectorAll('.crop-ratio-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.ratio === 'free');
  });

  const modal = document.getElementById('modal-crop-image');
  const img = new Image();
  img.onload = () => {
    cropState.image = img;
    setupCropCanvasSize();
    resetCropBoxToImage();
    drawCropCanvas();
    modal.classList.add('open');
  };
  img.src = imageStroke.dataUrl;
}

function setupCropCanvasSize() {
  const container = document.getElementById('crop-workspace-container');
  const canvas = document.getElementById('crop-image-canvas');
  if (!container || !canvas || !cropState.image) return;

  const maxW = container.clientWidth || 580;
  const maxH = container.clientHeight || 360;

  const imgW = cropState.image.width;
  const imgH = cropState.image.height;

  const scale = Math.min((maxW - 40) / imgW, (maxH - 40) / imgH, 1.0);
  const dispW = Math.round(imgW * scale);
  const dispH = Math.round(imgH * scale);
  const dispX = Math.round((maxW - dispW) / 2);
  const dispY = Math.round((maxH - dispH) / 2);

  canvas.width = maxW;
  canvas.height = maxH;
  canvas.style.width = `${maxW}px`;
  canvas.style.height = `${maxH}px`;

  cropState.imgDisplay = { x: dispX, y: dispY, w: dispW, h: dispH, scale };
}

function resetCropBoxToImage() {
  const d = cropState.imgDisplay;
  cropState.cropBox = {
    x: d.x + 10,
    y: d.y + 10,
    w: Math.max(30, d.w - 20),
    h: Math.max(30, d.h - 20)
  };
  applyRatioToCropBox();
}

function applyRatioToCropBox() {
  const r = cropState.aspectRatio;
  const d = cropState.imgDisplay;
  if (r === 'free' || !r) return;

  let targetRatio = 1.0;
  if (r === '1:1') targetRatio = 1.0;
  else if (r === '4:3') targetRatio = 4 / 3;
  else if (r === '16:9') targetRatio = 16 / 9;
  else if (r === '3:2') targetRatio = 3 / 2;

  let newW = cropState.cropBox.w;
  let newH = newW / targetRatio;

  if (cropState.cropBox.y + newH > d.y + d.h) {
    newH = d.y + d.h - cropState.cropBox.y;
    newW = newH * targetRatio;
  }
  if (cropState.cropBox.x + newW > d.x + d.w) {
    newW = d.x + d.w - cropState.cropBox.x;
    newH = newW / targetRatio;
  }

  cropState.cropBox.w = Math.max(30, Math.round(newW));
  cropState.cropBox.h = Math.max(30, Math.round(newH));
}

function rotateCropImage(angleDeg = 90) {
  if (!cropState.image) return;
  const off = document.createElement('canvas');
  off.width = cropState.image.height;
  off.height = cropState.image.width;
  const ctx = off.getContext('2d');
  ctx.translate(off.width / 2, off.height / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.drawImage(cropState.image, -cropState.image.width / 2, -cropState.image.height / 2);

  const rotatedImg = new Image();
  rotatedImg.onload = () => {
    cropState.image = rotatedImg;
    setupCropCanvasSize();
    resetCropBoxToImage();
    drawCropCanvas();
  };
  rotatedImg.src = off.toDataURL('image/png');
}

function drawCropCanvas() {
  const canvas = document.getElementById('crop-image-canvas');
  if (!canvas || !cropState.image) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const d = cropState.imgDisplay;
  const b = cropState.cropBox;

  // 1. Imagen de fondo
  ctx.drawImage(cropState.image, d.x, d.y, d.w, d.h);

  // 2. Máscara Oscura exterior
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.fill('evenodd');
  ctx.restore();

  // 3. Borde de la Caja de Recorte
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y, b.w, b.h);

  // Líneas guía (Regla de los Tercios)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(b.x + b.w / 3, b.y);
  ctx.lineTo(b.x + b.w / 3, b.y + b.h);
  ctx.moveTo(b.x + (b.w * 2) / 3, b.y);
  ctx.lineTo(b.x + (b.w * 2) / 3, b.y + b.h);
  ctx.moveTo(b.x, b.y + b.h / 3);
  ctx.lineTo(b.x + b.w, b.y + b.h / 3);
  ctx.moveTo(b.x, b.y + (b.h * 2) / 3);
  ctx.lineTo(b.x + b.w, b.y + (b.h * 2) / 3);
  ctx.stroke();

  // 4. Tiradores de Esquinas y Lados
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2.5;

  const handles = [
    { id: 'tl', x: b.x, y: b.y },
    { id: 'tr', x: b.x + b.w, y: b.y },
    { id: 'br', x: b.x + b.w, y: b.y + b.h },
    { id: 'bl', x: b.x, y: b.y + b.h },
    { id: 'mt', x: b.x + b.w / 2, y: b.y },
    { id: 'mr', x: b.x + b.w, y: b.y + b.h / 2 },
    { id: 'mb', x: b.x + b.w / 2, y: b.y + b.h },
    { id: 'ml', x: b.x, y: b.y + b.h / 2 }
  ];

  handles.forEach(h => {
    ctx.beginPath();
    ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();

  // Indicador de dimensiones reales recortadas
  const dimInd = document.getElementById('crop-dim-indicator');
  if (dimInd && cropState.imgDisplay.scale > 0) {
    const realW = Math.round(b.w / cropState.imgDisplay.scale);
    const realH = Math.round(b.h / cropState.imgDisplay.scale);
    dimInd.textContent = `${realW} × ${realH} px (${formatPxToUnit(realW)})`;
  }
}

function getCropHandleAt(pt) {
  const b = cropState.cropBox;
  const threshold = 18;
  const handles = [
    { id: 'tl', x: b.x, y: b.y },
    { id: 'tr', x: b.x + b.w, y: b.y },
    { id: 'br', x: b.x + b.w, y: b.y + b.h },
    { id: 'bl', x: b.x, y: b.y + b.h },
    { id: 'mt', x: b.x + b.w / 2, y: b.y },
    { id: 'mr', x: b.x + b.w, y: b.y + b.h / 2 },
    { id: 'mb', x: b.x + b.w / 2, y: b.y + b.h },
    { id: 'ml', x: b.x, y: b.y + b.h / 2 }
  ];

  for (const h of handles) {
    if (Math.hypot(pt.x - h.x, pt.y - h.y) <= threshold) {
      return h.id;
    }
  }

  if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
    return 'box';
  }
  return null;
}

function setupCropCanvasInteractions(canvas) {
  function getCanvasPt(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: e.clientX - r.left,
      y: e.clientY - r.top
    };
  }

  canvas.onpointerdown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    const pt = getCanvasPt(e);
    const handle = getCropHandleAt(pt);

    if (handle) {
      cropState.activeHandle = handle;
      cropState.dragStart = pt;
      cropState.initialBox = Object.assign({}, cropState.cropBox);
    }
  };

  canvas.onpointermove = (e) => {
    if (!cropState.activeHandle || !cropState.initialBox) return;
    const pt = getCanvasPt(e);
    const dx = pt.x - cropState.dragStart.x;
    const dy = pt.y - cropState.dragStart.y;
    const d = cropState.imgDisplay;
    const init = cropState.initialBox;
    const b = cropState.cropBox;

    if (cropState.activeHandle === 'box') {
      let newX = Math.max(d.x, Math.min(d.x + d.w - init.w, init.x + dx));
      let newY = Math.max(d.y, Math.min(d.y + d.h - init.h, init.y + dy));
      b.x = newX;
      b.y = newY;
    } else {
      let newX = init.x;
      let newY = init.y;
      let newW = init.w;
      let newH = init.h;

      if (cropState.activeHandle.includes('r')) {
        newW = Math.max(30, Math.min(d.x + d.w - init.x, init.w + dx));
      }
      if (cropState.activeHandle.includes('l')) {
        const maxDx = init.w - 30;
        const clampedDx = Math.min(maxDx, Math.max(d.x - init.x, dx));
        newX = init.x + clampedDx;
        newW = init.w - clampedDx;
      }
      if (cropState.activeHandle.includes('b')) {
        newH = Math.max(30, Math.min(d.y + d.h - init.y, init.h + dy));
      }
      if (cropState.activeHandle.includes('t')) {
        const maxDy = init.h - 30;
        const clampedDy = Math.min(maxDy, Math.max(d.y - init.y, dy));
        newY = init.y + clampedDy;
        newH = init.h - clampedDy;
      }

      b.x = newX;
      b.y = newY;
      b.w = newW;
      b.h = newH;

      applyRatioToCropBox();
    }

    drawCropCanvas();
  };

  const onStop = (e) => {
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    cropState.activeHandle = null;
    cropState.initialBox = null;
  };

  canvas.onpointerup = onStop;
  canvas.onpointercancel = onStop;
}

function applyCropResult() {
  if (!cropState.stroke || !cropState.image || !cropState.imgDisplay.scale) return;
  const d = cropState.imgDisplay;
  const b = cropState.cropBox;

  const srcX = Math.max(0, Math.round((b.x - d.x) / d.scale));
  const srcY = Math.max(0, Math.round((b.y - d.y) / d.scale));
  const srcW = Math.min(cropState.image.width - srcX, Math.round(b.w / d.scale));
  const srcH = Math.min(cropState.image.height - srcY, Math.round(b.h / d.scale));

  if (srcW <= 10 || srcH <= 10) return;

  const off = document.createElement('canvas');
  off.width = srcW;
  off.height = srcH;
  const ctx = off.getContext('2d');
  ctx.drawImage(cropState.image, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

  const croppedDataUrl = off.toDataURL('image/png');

  pushDocumentUndo(state.activeItem);

  const ratio = srcW / srcH;
  const currentW = cropState.stroke.width || 300;
  cropState.stroke.dataUrl = croppedDataUrl;
  cropState.stroke.src = croppedDataUrl;
  cropState.stroke.width = currentW;
  cropState.stroke.height = Math.round(currentW / ratio);

  const croppedImgEl = new Image();
  croppedImgEl.src = croppedDataUrl;
  globalImageCache.set(croppedDataUrl, croppedImgEl);
  cropState.stroke.element = croppedImgEl;

  const px = cropState.stroke.x !== undefined ? cropState.stroke.x : 0;
  const py = cropState.stroke.y !== undefined ? cropState.stroke.y : 0;
  cropState.stroke.points = [
    { x: px, y: py },
    { x: px + cropState.stroke.width, y: py },
    { x: px + cropState.stroke.width, y: py + cropState.stroke.height },
    { x: px, y: py + cropState.stroke.height }
  ];

  dbSaveItem(state.activeItem);
  if (noteDrawingEngine) {
    noteDrawingEngine.redraw();
    noteDrawingEngine.updateSelectionBounds();
  }
}

function initImageCropEvents() {
  const modal = document.getElementById('modal-crop-image');
  if (!modal) return;
  const btnClose = document.getElementById('btn-close-modal-crop');
  const btnCancel = document.getElementById('btn-cancel-modal-crop');
  const btnApply = document.getElementById('btn-apply-crop');
  const btnRotate = document.getElementById('btn-crop-rotate');
  const btnReset = document.getElementById('btn-crop-reset');
  const canvas = document.getElementById('crop-image-canvas');

  const closeModal = () => modal.classList.remove('open');
  if (btnClose) btnClose.onclick = closeModal;
  if (btnCancel) btnCancel.onclick = closeModal;

  document.querySelectorAll('.crop-ratio-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.crop-ratio-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cropState.aspectRatio = btn.dataset.ratio;
      applyRatioToCropBox();
      drawCropCanvas();
    };
  });

  if (btnRotate) {
    btnRotate.onclick = () => {
      rotateCropImage(90);
    };
  }

  if (btnReset) {
    btnReset.onclick = () => {
      resetCropBoxToImage();
      drawCropCanvas();
    };
  }

  if (btnApply) {
    btnApply.onclick = () => {
      applyCropResult();
      closeModal();
    };
  }

  if (canvas) {
    setupCropCanvasInteractions(canvas);
  }
}


// ===== MENÚ DE EXPORTACIÓN MULTIFORMATO Y RANGO DE PÁGINAS =====
let exportModalSource = 'notes';

function openExportModal(sourceType = 'notes') {
  exportModalSource = sourceType;
  const modal = document.getElementById('modal-export-document');
  if (!modal) return;

  const titleEl = document.getElementById('export-modal-title');
  const totalBadge = document.getElementById('export-total-pages-badge');
  const currentBadge = document.getElementById('export-current-page-badge');
  const bgOptItem = document.getElementById('export-opt-bg-item');
  const statusBox = document.getElementById('export-status-box');
  if (statusBox) statusBox.style.display = 'none';

  let totalPages = 1;
  let currentPage = 1;

  if (sourceType === 'notes') {
    if (titleEl) titleEl.textContent = 'Exportar Apunte Manuscrito';
    if (bgOptItem) bgOptItem.style.display = 'flex';
    const isA4 = state.activeItem && state.activeItem.noteMode === 'a4_continuous';
    const canvasH = (state.activeItem && state.activeItem.canvasHeight) || 1400;
    totalPages = isA4 ? Math.max(1, Math.ceil(canvasH / 1400)) : 1;

    const viewport = document.getElementById('notes-viewport');
    if (viewport && isA4) {
      currentPage = Math.min(totalPages, Math.max(1, Math.floor(viewport.scrollTop / 1200) + 1));
    }
  } else if (sourceType === 'pdf') {
    if (titleEl) titleEl.textContent = 'Exportar Documento PDF Anotado';
    if (bgOptItem) bgOptItem.style.display = 'none';
    totalPages = (state.pdf && state.pdf.totalPages) || 1;

    const viewport = document.getElementById('pdf-continuous-viewport');
    if (viewport) {
      const pages = document.querySelectorAll('.pdf-page-wrapper');
      const viewCenter = viewport.scrollTop + viewport.clientHeight / 3;
      pages.forEach((p, idx) => {
        if (p.offsetTop <= viewCenter) {
          currentPage = idx + 1;
        }
      });
    }
  }

  if (totalBadge) totalBadge.textContent = `${totalPages} ${totalPages === 1 ? 'página' : 'páginas'}`;
  if (currentBadge) currentBadge.textContent = `Página ${currentPage}`;

  document.querySelectorAll('input[name="export-pages-range"]').forEach(r => {
    r.checked = r.value === 'all';
  });
  const customInput = document.getElementById('export-pages-custom-input');
  if (customInput) {
    customInput.value = '';
    customInput.disabled = true;
  }

  modal.classList.add('open');
}

function initExportModalEvents() {
  const modal = document.getElementById('modal-export-document');
  if (!modal) return;

  const btnClose = document.getElementById('btn-close-modal-export');
  const btnCancel = document.getElementById('btn-cancel-modal-export');
  const btnConfirm = document.getElementById('btn-confirm-export');

  const closeModal = () => modal.classList.remove('open');
  if (btnClose) btnClose.onclick = closeModal;
  if (btnCancel) btnCancel.onclick = closeModal;

  document.querySelectorAll('.export-format-card').forEach(card => {
    card.onclick = () => {
      document.querySelectorAll('.export-format-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    };
  });

  document.querySelectorAll('input[name="export-pages-range"]').forEach(radio => {
    radio.onchange = () => {
      const customInput = document.getElementById('export-pages-custom-input');
      if (customInput) {
        customInput.disabled = radio.value !== 'custom';
        if (radio.value === 'custom') customInput.focus();
      }
    };
  });

  if (btnConfirm) {
    btnConfirm.onclick = async () => {
      await executeDocumentExport();
    };
  }
}

// Generador de PDF estándar (100% Puro JavaScript, Offline y Ligero)
function buildPdfFromCanvases(pagesData) {
  let pdfChunks = [];
  let byteOffset = 0;
  const offsets = [];

  function addChunk(strOrUint8) {
    let u8;
    if (typeof strOrUint8 === 'string') {
      const encoder = new TextEncoder();
      u8 = encoder.encode(strOrUint8);
    } else {
      u8 = strOrUint8;
    }
    pdfChunks.push(u8);
    byteOffset += u8.byteLength;
    return u8.byteLength;
  }

  function startObject(objNum) {
    offsets[objNum] = byteOffset;
    addChunk(`${objNum} 0 obj\n`);
  }

  function endObject() {
    addChunk(`endobj\n`);
  }

  addChunk('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // Object 1: Catalog
  startObject(1);
  addChunk(`<< /Type /Catalog /Pages 2 0 R >>\n`);
  endObject();

  const numPages = pagesData.length;
  const pageKids = [];
  for (let i = 0; i < numPages; i++) {
    pageKids.push(`${3 + i * 3} 0 R`);
  }

  // Object 2: Pages
  startObject(2);
  addChunk(`<< /Type /Pages /Kids [ ${pageKids.join(' ')} ] /Count ${numPages} >>\n`);
  endObject();

  for (let i = 0; i < numPages; i++) {
    const p = pagesData[i];
    const pageObjNum = 3 + i * 3;
    const contentObjNum = pageObjNum + 1;
    const imageObjNum = pageObjNum + 2;

    const wPt = p.widthPt || 595.28;
    const hPt = p.heightPt || 841.89;

    startObject(pageObjNum);
    addChunk(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt.toFixed(2)} ${hPt.toFixed(2)}] /Contents ${contentObjNum} 0 R /Resources << /XObject << /Im${i + 1} ${imageObjNum} 0 R >> /ProcSet [/PDF /ImageC] >> >>\n`);
    endObject();

    const contentStr = `q\n${wPt.toFixed(2)} 0 0 ${hPt.toFixed(2)} 0 0 cm\n/Im${i + 1} Do\nQ\n`;
    const contentBytes = new TextEncoder().encode(contentStr);

    startObject(contentObjNum);
    addChunk(`<< /Length ${contentBytes.byteLength} >>\nstream\n`);
    addChunk(contentBytes);
    addChunk(`\nendstream\n`);
    endObject();

    startObject(imageObjNum);
    addChunk(`<< /Type /XObject /Subtype /Image /Width ${p.imgWidth} /Height ${p.imgHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegData.byteLength} >>\nstream\n`);
    addChunk(p.jpegData);
    addChunk(`\nendstream\n`);
    endObject();
  }

  const totalObjs = 2 + numPages * 3;
  const startXref = byteOffset;
  addChunk(`xref\n0 ${totalObjs + 1}\n`);
  addChunk(`0000000000 65535 f \n`);
  for (let i = 1; i <= totalObjs; i++) {
    const off = offsets[i] || 0;
    addChunk(`${off.toString().padStart(10, '0')} 00000 n \n`);
  }

  addChunk(`trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);

  return new Blob(pdfChunks, { type: 'application/pdf' });
}

function canvasToJpegData(canvas, quality = 0.92) {
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1];
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return {
    jpegData: bytes,
    imgWidth: canvas.width,
    imgHeight: canvas.height
  };
}

// ===== SELECTOR DE GUARDADO CON RUTA / CARPETA NATIVA (Guardar como...) =====
async function promptSaveFile(blobOrString, suggestedName, mimeType, ext) {
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [{
          description: 'Documento Exportado',
          accept: { [mimeType]: [`.${ext}`] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blobOrString);
      await writable.close();
      return true;
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.code === 20)) {
        // El usuario canceló la ventana de selección de archivo
        return false;
      }
      console.warn('showSaveFilePicker no disponible o denegado, usando descarga estándar:', err);
    }
  }

  // Fallback seguro mediante enlace de descarga
  const blob = typeof blobOrString === 'string'
    ? new Blob([blobOrString], { type: mimeType })
    : blobOrString;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = suggestedName;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 2000);
  return true;
}

async function executeDocumentExport() {
  if (!state.activeItem) return;

  const statusBox = document.getElementById('export-status-box');
  const statusText = document.getElementById('export-status-text');
  const formatEl = document.querySelector('input[name="export-format"]:checked');
  const rangeEl = document.querySelector('input[name="export-pages-range"]:checked');
  const includeBgEl = document.getElementById('export-opt-include-bg');
  const highResEl = document.getElementById('export-opt-high-res');

  const format = formatEl ? formatEl.value : 'pdf';
  const rangeType = rangeEl ? rangeEl.value : 'all';
  const includeBg = includeBgEl ? includeBgEl.checked : true;
  const scaleMultiplier = highResEl && highResEl.checked ? 2 : 1;
  const baseName = (state.activeItem.name || 'documento').replace(/[/\\?%*:|"<>]/g, '_');

  if (statusBox) statusBox.style.display = 'flex';
  if (statusText) statusText.textContent = 'Procesando páginas...';

  try {
    // 1. Exportar JSON directo si fue elegido
    if (format === 'json') {
      const jsonText = JSON.stringify(state.activeItem, null, 2);
      const jsonBlob = new Blob([jsonText], { type: 'application/json' });
      await promptSaveFile(jsonBlob, `${baseName}.tablet-note.json`, 'application/json', 'json');
      document.getElementById('modal-export-document').classList.remove('open');
      return;
    }

    // 2. Determinar las páginas a exportar
    let totalPages = 1;
    let currentPage = 1;

    if (exportModalSource === 'notes') {
      const isInfinite = state.activeItem.noteMode === 'infinite' || state.activeItem.paperSize === 'infinite';
      const paper = PAPER_SIZES[state.activeItem.paperSize] || PAPER_SIZES.a4;
      const pageW = state.activeItem.canvasWidth || (isInfinite ? 2500 : paper.widthPx);
      const pageH = state.activeItem.pageHeight || (isInfinite ? (state.activeItem.canvasHeight || 2500) : paper.heightPx);
      const canvasH = state.activeItem.canvasHeight || pageH;
      totalPages = isInfinite ? 1 : Math.max(1, Math.ceil(canvasH / pageH));

      const viewport = document.getElementById('notes-viewport');
      if (viewport && !isInfinite) {
        currentPage = Math.min(totalPages, Math.max(1, Math.floor(viewport.scrollTop / pageH) + 1));
      }
    } else if (exportModalSource === 'pdf') {
      totalPages = (state.pdf && state.pdf.totalPages) || 1;
      const viewport = document.getElementById('pdf-continuous-viewport');
      if (viewport) {
        const pages = document.querySelectorAll('.pdf-page-wrapper');
        const viewCenter = viewport.scrollTop + viewport.clientHeight / 3;
        pages.forEach((p, idx) => {
          if (p.offsetTop <= viewCenter) {
            currentPage = idx + 1;
          }
        });
      }
    }

    let targetPages = [];
    if (rangeType === 'all') {
      for (let i = 1; i <= totalPages; i++) targetPages.push(i);
    } else if (rangeType === 'current') {
      targetPages.push(currentPage);
    } else if (rangeType === 'custom') {
      const customStr = (document.getElementById('export-pages-custom-input').value || '').trim();
      const parts = customStr.split(/[,;\s]+/);
      parts.forEach(p => {
        if (p.includes('-')) {
          const [start, end] = p.split('-').map(n => parseInt(n.trim()));
          if (!isNaN(start) && !isNaN(end)) {
            for (let k = Math.max(1, start); k <= Math.min(totalPages, end); k++) {
              if (!targetPages.includes(k)) targetPages.push(k);
            }
          }
        } else {
          const num = parseInt(p.trim());
          if (!isNaN(num) && num >= 1 && num <= totalPages && !targetPages.includes(num)) {
            targetPages.push(num);
          }
        }
      });
      if (targetPages.length === 0) {
        for (let i = 1; i <= totalPages; i++) targetPages.push(i);
      }
    }

    // 3. Renderizar cada página en Canvas
    const renderedCanvases = [];
    const srcCanvas = document.getElementById('notes-canvas');
    const noteDpr = Math.max(window.devicePixelRatio || 1, 2);

    for (let i = 0; i < targetPages.length; i++) {
      const pageNum = targetPages[i];
      if (statusText) statusText.textContent = `Generando página ${pageNum} de ${totalPages}...`;

      if (exportModalSource === 'notes') {
        const isInfinite = state.activeItem.noteMode === 'infinite' || state.activeItem.paperSize === 'infinite';
        const paper = PAPER_SIZES[state.activeItem.paperSize] || PAPER_SIZES.a4;
        const pageW = state.activeItem.canvasWidth || (isInfinite ? 2500 : paper.widthPx);
        const pageH = state.activeItem.pageHeight || (isInfinite ? (state.activeItem.canvasHeight || 2500) : paper.heightPx);
        const offsetY = isInfinite ? 0 : (pageNum - 1) * pageH;

        const pCanvas = document.createElement('canvas');
        pCanvas.width = pageW * scaleMultiplier;
        pCanvas.height = pageH * scaleMultiplier;
        const ctx = pCanvas.getContext('2d');
        ctx.scale(scaleMultiplier, scaleMultiplier);

        // Fondo
        if (includeBg) {
          const bgColor = state.activeItem.bgColor || '#fdf6e2';
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, pageW, pageH);

          const pattern = state.activeItem.patternType || 'grid';
          const size = state.activeItem.gridSize || 28;
          const isDark = isColorDark(bgColor);
          const strokeColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

          if (pattern === 'grid') {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = 0; x <= pageW; x += size) { ctx.moveTo(x, 0); ctx.lineTo(x, pageH); }
            for (let y = 0; y <= pageH; y += size) { ctx.moveTo(0, y); ctx.lineTo(pageW, y); }
            ctx.stroke();
          } else if (pattern === 'lines') {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let y = size; y <= pageH; y += size) { ctx.moveTo(0, y); ctx.lineTo(pageW, y); }
            ctx.stroke();
          }
        } else if (format === 'jpg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, pageW, pageH);
        }

        // Trazos
        if (srcCanvas) {
          ctx.drawImage(
            srcCanvas,
            0, offsetY * noteDpr,
            pageW * noteDpr, pageH * noteDpr,
            0, 0,
            pageW, pageH
          );
        }

        renderedCanvases.push({
          canvas: pCanvas,
          pageNum,
          widthPt: (pageW * 72) / 96,
          heightPt: (pageH * 72) / 96
        });
      } else if (exportModalSource === 'pdf') {
        const page = await state.pdf.doc.getPage(pageNum);
        const userRot = ((state.activeItem.pdfData && state.activeItem.pdfData.rotation) || 0) % 360;
        const totalRot = getPageEffectiveRotation(page, userRot);
        const unscaled = page.getViewport({ scale: 1.0, rotation: totalRot });
        const renderScale = 2.0 * scaleMultiplier;
        const viewport = page.getViewport({ scale: renderScale, rotation: totalRot });

        const sideCfg = (state.activeItem.pdfData && state.activeItem.pdfData.sideCanvas) || { position: 'none', width: 350, pattern: 'grid', bgColor: '#ffffff' };
        const unscaledSideW = (sideCfg.position && sideCfg.position !== 'none') ? (sideCfg.width || 350) : 0;
        const unscaledLeftW = (sideCfg.position === 'left' || sideCfg.position === 'both') ? unscaledSideW : 0;
        const unscaledRightW = (sideCfg.position === 'right' || sideCfg.position === 'both') ? unscaledSideW : 0;
        const totalUnscaledW = unscaledLeftW + unscaled.width + unscaledRightW;

        const renderLeftW = Math.round(unscaledLeftW * renderScale);
        const renderRightW = Math.round(unscaledRightW * renderScale);
        const renderTotalW = renderLeftW + viewport.width + renderRightW;
        const renderTotalH = viewport.height;

        const pCanvas = document.createElement('canvas');
        pCanvas.width = Math.floor(renderTotalW);
        pCanvas.height = Math.floor(renderTotalH);
        const ctx = pCanvas.getContext('2d');

        // Fondo y cuadrícula para el margen izquierdo
        if (renderLeftW > 0) {
          drawCanvasPattern(ctx, 0, 0, renderLeftW, renderTotalH, sideCfg.pattern, sideCfg.bgColor || '#ffffff', (sideCfg.gridSize || 28) * renderScale);
        }

        // Renderizado de la página PDF
        ctx.save();
        ctx.translate(renderLeftW, 0);
        await page.render({ canvasContext: ctx, viewport }).promise;
        ctx.restore();

        // Fondo y cuadrícula para el margen derecho
        if (renderRightW > 0) {
          drawCanvasPattern(ctx, renderLeftW + viewport.width, 0, renderRightW, renderTotalH, sideCfg.pattern, sideCfg.bgColor || '#ffffff', (sideCfg.gridSize || 28) * renderScale);
        }

        // Dibujar anotaciones táctiles en todo el ancho
        const overlayStrokes = (state.activeItem.pdfData && state.activeItem.pdfData.annotations && state.activeItem.pdfData.annotations[pageNum]) || [];
        if (overlayStrokes.length > 0) {
          const dpr = Math.max(window.devicePixelRatio || 1, 2);
          const currentScale = state.pdf.scale || 1.0;
          const ratio = (renderTotalW / (totalUnscaledW * currentScale));

          ctx.save();
          ctx.scale(ratio / dpr, ratio / dpr);

          overlayStrokes.forEach(s => {
            if (s.isImage && (s.src || s.dataUrl)) {
              const img = new Image();
              img.src = s.src || s.dataUrl;
              const ix = s.x || 0;
              const iy = s.y || 0;
              const iw = s.width || 100;
              const ih = s.height || 100;
              ctx.drawImage(img, ix, iy, iw, ih);
              return;
            }
            if (!s.points || s.points.length === 0) return;
            ctx.save();
            ctx.beginPath();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            if (s.tool === 'highlighter' || s.brushType === 'highlighter') {
              ctx.strokeStyle = s.color;
              ctx.globalAlpha = 0.45;
              ctx.lineWidth = (s.size || 3) * 3.2;
            } else if (s.tool === 'eraser') {
              ctx.globalCompositeOperation = 'destination-out';
              ctx.lineWidth = (s.size || 20) * 2;
            } else {
              ctx.strokeStyle = s.color;
              ctx.globalAlpha = 1;
              ctx.lineWidth = s.size || 3;
            }

            const pts = s.points;
            if (pts.length === 1) {
              ctx.arc(pts[0].x, pts[0].y, (s.size || 3) / 2, 0, Math.PI * 2);
              ctx.fillStyle = s.color;
              ctx.fill();
            } else {
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let j = 1; j < pts.length - 1; j++) {
                const xc = (pts[j].x + pts[j + 1].x) / 2;
                const yc = (pts[j].y + pts[j + 1].y) / 2;
                ctx.quadraticCurveTo(pts[j].x, pts[j].y, xc, yc);
              }
              if (pts.length > 1) {
                ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
              }
              ctx.stroke();
            }
            ctx.restore();
          });
          ctx.restore();
        }

        renderedCanvases.push({
          canvas: pCanvas,
          pageNum,
          widthPt: (totalUnscaledW * 72) / 96,
          heightPt: (unscaled.height * 72) / 96
        });
      }
    }

    // 4. Empaquetar y Guardar con selector nativo de destino
    if (format === 'pdf') {
      if (statusText) statusText.textContent = 'Construyendo archivo PDF...';
      const pagesData = [];
      for (const item of renderedCanvases) {
        const jpeg = canvasToJpegData(item.canvas, 0.94);
        pagesData.push({
          jpegData: jpeg.jpegData,
          imgWidth: jpeg.imgWidth,
          imgHeight: jpeg.imgHeight,
          widthPt: item.widthPt,
          heightPt: item.heightPt
        });
      }

      const pdfBlob = buildPdfFromCanvases(pagesData);

      // Si la carpeta física de la tablet está vinculada, guardar también en la subcarpeta correspondiente
      if (state.deviceDirHandle && state.activeItem) {
        try {
          const targetDir = await getDirectoryHandleForFolder(state.activeItem.parentId);
          if (targetDir) {
            const pdfHandle = await targetDir.getFileHandle(`${baseName}.pdf`, { create: true });
            const writable = await pdfHandle.createWritable();
            await writable.write(pdfBlob);
            await writable.close();
          }
        } catch (e) {
          console.warn('No se pudo guardar PDF exportado en subcarpeta física:', e);
        }
      }

      await promptSaveFile(pdfBlob, `${baseName}.pdf`, 'application/pdf', 'pdf');
    } else if (format === 'png' || format === 'jpg') {
      const mime = format === 'png' ? 'image/png' : 'image/jpeg';
      const ext = format === 'png' ? 'png' : 'jpg';

      if (renderedCanvases.length === 1) {
        const blob = await new Promise(res => renderedCanvases[0].canvas.toBlob(res, mime, 0.95));
        await promptSaveFile(blob, `${baseName}_pag_${renderedCanvases[0].pageNum}.${ext}`, mime, ext);
      } else {
        // Guardar cada página con el selector
        for (const item of renderedCanvases) {
          const blob = await new Promise(res => item.canvas.toBlob(res, mime, 0.95));
          const ok = await promptSaveFile(blob, `${baseName}_pag_${item.pageNum}.${ext}`, mime, ext);
          if (!ok) break;
          await new Promise(r => setTimeout(r, 150));
        }
      }
    }

    document.getElementById('modal-export-document').classList.remove('open');
  } catch (err) {
    console.error('Error exportando documento:', err);
    if (statusText) statusText.textContent = 'Error al exportar documento.';
    showAlertModal(`Hubo un problema al generar la exportación: ${err.message || err}`, 'Error de Exportación');
  } finally {
    if (statusBox) statusBox.style.display = 'none';
  }
}


// ===== 8. ENTORNO DE TRABAJO: PANTALLA DIVIDIDA (SPLIT-VIEW / SESIÓN DUAL) =====
// =============================================================================

// 1. ESTRUCTURAS DE ESTADO SEPARADAS E INDEPENDIENTES POR PANEL
const panels = {
  left: {
    canvas: null,
    selCanvas: null,
    ctx: null,
    selCtx: null,
    doc: null,
    strokes: [],
    images: [],
    undoStack: [],
    redoStack: [],
    isDrawing: false,
    currentStroke: null,
    abortController: null,
    scale: 1.0,
    container: null,
    engine: null
  },
  right: {
    canvas: null,
    selCanvas: null,
    ctx: null,
    selCtx: null,
    doc: null,
    strokes: [],
    images: [],
    undoStack: [],
    redoStack: [],
    isDrawing: false,
    currentStroke: null,
    abortController: null,
    scale: 1.0,
    container: null,
    engine: null
  }
};

// 2. DIBUJADO MODULAR Y PURO EN CONTEXTO 2D
function dibujarImagenEnContexto(ctx, s) {
  if (!s || !ctx) return;
  const src = s.src || s.dataUrl;
  if (!src) return;

  let img = s.element;
  if (!img || !(img instanceof HTMLImageElement)) {
    img = globalImageCache.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      globalImageCache.set(src, img);
    }
    s.element = img;
  }

  if (img.complete && img.naturalWidth > 0) {
    syncImageStroke(s, img);
    ctx.save();
    ctx.drawImage(img, s.x, s.y, s.width, s.height);
    ctx.restore();
  } else if (!img.onload) {
    img.onload = () => {
      syncImageStroke(s, img);
      if (state.currentView === 'split-editor') {
        redrawPanel('left');
        redrawPanel('right');
      } else if (noteDrawingEngine) {
        noteDrawingEngine.redraw();
      }
    };
  }
}

function dibujarTrazoEnContexto(ctx, s) {
  if (!s || !ctx || s.tool === 'eraser' || s.isImage) return;
  if (!s.points || s.points.length === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const brush = s.brushType || s.tool;

  // Relleno de Formas si aplica
  if (s.isShape && (s.fillMode === 'semi' || s.fillMode === 'solid')) {
    ctx.fillStyle = s.fillColor || s.color;
    ctx.globalAlpha = s.fillMode === 'semi' ? 0.35 : (s.opacity || 1.0);
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
  }

  // Relleno por Bote de Pintura
  if (s.isFill) {
    ctx.fillStyle = s.fillColor || s.color;
    ctx.globalAlpha = s.fillOpacity || 1.0;
    ctx.moveTo(s.points[0].x, s.points[0].y);
    for (let i = 1; i < s.points.length; i++) {
      ctx.lineTo(s.points[i].x, s.points[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  // Estilos de pincel y grosor
  if (brush === 'highlighter' || s.tool === 'highlighter') {
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = (s.size || 6) * 3.2;
  } else if (brush === 'pencil') {
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = s.size || 2;
  } else if (brush === 'fountain') {
    ctx.strokeStyle = s.color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = (s.size || 3) * 1.25;
  } else {
    ctx.strokeStyle = s.color || '#0f172a';
    ctx.globalAlpha = 1;
    ctx.lineWidth = s.size || 3;
  }

  const pts = s.points;
  if (pts.length === 1) {
    ctx.arc(pts[0].x, pts[0].y, (s.size || 3) / 2, 0, Math.PI * 2);
    ctx.fillStyle = s.color || '#0f172a';
    ctx.fill();
  } else if (s.isShape) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
  } else if (pts.length === 2) {
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.stroke();
  } else {
    // Curvas Bézier cuadráticas ultrasuaves con puntos medios
    ctx.moveTo(pts[0].x, pts[0].y);
    const mid0 = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    ctx.lineTo(mid0.x, mid0.y);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  }
  ctx.restore();
}

// 3. AISLAMIENTO DEL CICLO DE DIBUJO Y REPINTADO POR PANEL
function redrawPanel(side) {
  const p = panels[side];
  if (!p || !p.canvas || !p.ctx) return;
  const dpr = Math.max(window.devicePixelRatio || 1, 2);
  p.ctx.setTransform(1, 0, 0, 1, 0, 0);
  p.ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
  p.ctx.scale(dpr, dpr);

  // 1. Dibujar ÚNICAMENTE las imágenes de este lado
  const images = p.images || [];
  for (const img of images) {
    dibujarImagenEnContexto(p.ctx, img);
  }

  // 2. Dibujar ÚNICAMENTE los trazos de este lado
  const strokes = p.strokes || [];
  for (const stroke of strokes) {
    dibujarTrazoEnContexto(p.ctx, stroke);
  }

  // 3. Dibujar el trazo en progreso de este lado
  if (p.isDrawing && p.currentStroke) {
    dibujarTrazoEnContexto(p.ctx, p.currentStroke);
  }
}

// Historial Undo / Redo independiente por panel
function pushPanelUndo(side) {
  const p = panels[side];
  if (!p || !p.doc) return;
  if (!Array.isArray(p.undoStack)) p.undoStack = [];
  p.redoStack = [];
  const snapshot = {
    strokes: JSON.parse(JSON.stringify(p.strokes || [])),
    images: (p.images || []).map(img => {
      const { element, ...rest } = img;
      return JSON.parse(JSON.stringify(rest));
    })
  };
  p.undoStack.push(snapshot);
  if (p.undoStack.length > 50) p.undoStack.shift();
  p.doc.undoStack = p.undoStack;
  p.doc.redoStack = p.redoStack;
}

function performPanelUndo(side) {
  const p = panels[side];
  if (!p || !p.undoStack || p.undoStack.length === 0) return;
  if (!Array.isArray(p.redoStack)) p.redoStack = [];

  const currentSnapshot = {
    strokes: JSON.parse(JSON.stringify(p.strokes || [])),
    images: (p.images || []).map(img => {
      const { element, ...rest } = img;
      return JSON.parse(JSON.stringify(rest));
    })
  };
  p.redoStack.push(currentSnapshot);

  const prev = p.undoStack.pop();
  if (prev) {
    p.strokes = p.doc.strokes = prev.strokes || [];
    p.images = p.doc.images = prev.images || [];
    ensureDocImagesLoaded(p.doc);
    dbSaveItem(p.doc);
    redrawPanel(side);
  }
}

function performPanelRedo(side) {
  const p = panels[side];
  if (!p || !p.redoStack || p.redoStack.length === 0) return;
  if (!Array.isArray(p.undoStack)) p.undoStack = [];

  const currentSnapshot = {
    strokes: JSON.parse(JSON.stringify(p.strokes || [])),
    images: (p.images || []).map(img => {
      const { element, ...rest } = img;
      return JSON.parse(JSON.stringify(rest));
    })
  };
  p.undoStack.push(currentSnapshot);

  const next = p.redoStack.pop();
  if (next) {
    p.strokes = p.doc.strokes = next.strokes || [];
    p.images = p.doc.images = next.images || [];
    ensureDocImagesLoaded(p.doc);
    dbSaveItem(p.doc);
    redrawPanel(side);
  }
}

function eraseInPanel(pane, startPt, endPt) {
  const p = panels[pane];
  if (!p || !p.strokes) return;
  const radius = (state.notes && state.notes.eraserSize ? state.notes.eraserSize / 2 : 12);
  const radiusSq = radius * radius;
  let modified = false;

  const remainingStrokes = [];
  for (const s of p.strokes) {
    if (s.isImage) {
      remainingStrokes.push(s);
      continue;
    }
    const hit = s.points && s.points.some(pt => distSqToSegment(pt, startPt, endPt) <= radiusSq);
    if (hit) {
      modified = true;
    } else {
      remainingStrokes.push(s);
    }
  }

  if (modified) {
    p.strokes = p.doc.strokes = remainingStrokes;
    dbSaveItem(p.doc);
    redrawPanel(pane);
  }
}

function renderSplitNoteDividers(pane, inner, curH, pageHeight, isInfinite, paperSize) {
  let layer = inner.querySelector('.split-note-dividers');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'split-note-dividers';
    layer.style.position = 'absolute';
    layer.style.top = '0';
    layer.style.left = '0';
    layer.style.width = '100%';
    layer.style.height = '100%';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = '3';
    inner.appendChild(layer);
  }
  layer.innerHTML = '';

  const paperName = (PAPER_SIZES[paperSize] ? PAPER_SIZES[paperSize].name : (paperSize || 'A4')).toUpperCase();
  const totalPages = isInfinite ? 1 : Math.max(1, Math.ceil(curH / pageHeight));

  const topBadge = document.createElement('div');
  topBadge.className = 'page-top-badge';
  topBadge.textContent = isInfinite ? 'Lienzo Infinito' : `Pág. 1 • ${paperName}`;
  layer.appendChild(topBadge);

  if (!isInfinite) {
    for (let pNum = 1; pNum < totalPages; pNum++) {
      const line = document.createElement('div');
      line.className = 'page-divider-line';
      line.style.top = `${pNum * pageHeight}px`;

      const badge = document.createElement('div');
      badge.className = 'page-divider-badge';
      badge.textContent = `Pág. ${pNum + 1} • ${paperName}`;
      line.appendChild(badge);

      layer.appendChild(line);
    }
  }
}

function setupSplitNotePanel(pane, doc, canvas, selCanvas, container, inner, curH, pageHeight, isInfinite, paperWidth, dpr) {
  const p = panels[pane];
  if (p.abortController) {
    p.abortController.abort();
  }
  p.abortController = new AbortController();
  const { signal } = p.abortController;

  p.canvas = canvas;
  p.selCanvas = selCanvas;
  p.ctx = canvas.getContext('2d');
  p.selCtx = selCanvas.getContext('2d');
  p.doc = doc;
  p.strokes = doc.strokes = Array.isArray(doc.strokes) ? doc.strokes : [];
  p.images = doc.images = Array.isArray(doc.images) ? doc.images : [];
  p.undoStack = doc.undoStack = Array.isArray(doc.undoStack) ? doc.undoStack : [];
  p.redoStack = doc.redoStack = Array.isArray(doc.redoStack) ? doc.redoStack : [];
  p.isDrawing = false;
  p.currentStroke = null;
  p.container = container;

  const maxSafeHeight = 80000;
  let currentHeight = curH;
  let isExpanding = false;

  // Variables para desplazamiento táctil suave / inercia en este panel
  let isSingleTouchPanning = false;
  let lastTouchPos = { x: 0, y: 0 };
  let touchVelocityX = 0;
  let touchVelocityY = 0;
  let lastTouchTime = 0;
  let momentumAnimId = null;
  const activeTouches = new Map();
  let isPinchingOrPanning = false;
  let initialPinchDist = 0;
  let initialPinchZoom = 1.0;
  let lastPinchCenter = { x: 0, y: 0 };

  function stopMomentum() {
    if (momentumAnimId) {
      cancelAnimationFrame(momentumAnimId);
      momentumAnimId = null;
    }
  }

  function startMomentum() {
    stopMomentum();
    if (Math.abs(touchVelocityY) < 0.2 && Math.abs(touchVelocityX) < 0.2) return;
    let vx = touchVelocityX;
    let vy = touchVelocityY;
    function step() {
      vx *= 0.92;
      vy *= 0.92;
      container.scrollLeft -= vx;
      container.scrollTop -= vy;
      if (Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1) {
        momentumAnimId = requestAnimationFrame(step);
      } else {
        momentumAnimId = null;
      }
    }
    momentumAnimId = requestAnimationFrame(step);
  }

  function expandPages() {
    if (isExpanding || currentHeight + pageHeight > maxSafeHeight) return;
    isExpanding = true;
    currentHeight += pageHeight;
    doc.canvasHeight = currentHeight;
    canvas.height = Math.floor(currentHeight * dpr);
    canvas.style.height = `${currentHeight}px`;
    selCanvas.height = Math.floor(currentHeight * dpr);
    selCanvas.style.height = `${currentHeight}px`;
    inner.style.minHeight = `${currentHeight}px`;
    inner.style.height = `${currentHeight}px`;
    renderSplitNoteDividers(pane, inner, currentHeight, pageHeight, isInfinite, doc.paperSize);
    redrawPanel(pane);
    dbSaveItem(doc);
    setTimeout(() => { isExpanding = false; }, 80);
  }

  // Helper para obtener coordenadas relativas exclusivamente al canvas de este panel
  function getPanelPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const cssWidth = parseFloat(canvas.style.width) || (rect.width > 0 ? (canvas.width / dpr) : canvas.width);
    const cssHeight = parseFloat(canvas.style.height) || (rect.height > 0 ? (canvas.height / dpr) : canvas.height);
    const scaleX = rect.width > 0 ? (cssWidth / rect.width) : 1;
    const scaleY = rect.height > 0 ? (cssHeight / rect.height) : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      pressure: (e.pressure !== undefined && e.pressure > 0) ? e.pressure : 0.5
    };
  }

  // Pointer Down en el canvas de este panel
  canvas.addEventListener('pointerdown', (e) => {
    setActiveSplitPane(pane);

    if (e.pointerType === 'touch') {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    stopMomentum();

    // 1. Gestos de 2 dedos: Paneo y zoom con dos dedos en el panel
    if (activeTouches.size >= 2) {
      isSingleTouchPanning = false;
      if (p.isDrawing || p.currentStroke) {
        p.isDrawing = false;
        p.currentStroke = null;
        redrawPanel(pane);
      }
      isPinchingOrPanning = true;
      const touches = Array.from(activeTouches.values());
      const t1 = touches[0];
      const t2 = touches[1];
      initialPinchDist = Math.hypot(t2.x - t1.x, t2.y - t1.y) || 1;
      initialPinchZoom = (pane === 'left' ? state.split.leftScale : state.split.rightScale) || 1.0;
      lastPinchCenter = { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 };
      return;
    }

    const isTouchInput = e.pointerType === 'touch';
    const isStylusOnlyMode = state.settings ? state.settings.stylusOnly !== false : true;
    const isPanTool = (state.notes && state.notes.tool === 'pan');

    // 2. Modo Desplazamiento Vertical con Dedo (Stylus Only o Herramienta Mano)
    if ((isStylusOnlyMode && isTouchInput) || isPanTool) {
      isSingleTouchPanning = true;
      lastTouchPos = { x: e.clientX, y: e.clientY };
      lastTouchTime = performance.now();
      touchVelocityX = 0;
      touchVelocityY = 0;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      return;
    }

    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;

    // 3. Modo Dibujo (Stylus activo o Dedo cuando stylusOnly está desactivado)
    e.preventDefault();

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}

    const pt = getPanelPoint(e);

    // MODO BORRADOR: Afecta ÚNICAMENTE a p.strokes de este panel
    if (state.notes.tool === 'eraser') {
      pushPanelUndo(pane);
      p.isDrawing = true;
      eraseInPanel(pane, pt, pt);
      return;
    }

    // MODO DIBUJO: Empujar puntos ÚNICAMENTE a panels[pane].currentStroke
    pushPanelUndo(pane);
    p.isDrawing = true;
    p.currentStroke = {
      id: `s_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      tool: state.notes.tool,
      brushType: state.notes.brushType || 'pen',
      color: state.notes.color,
      size: state.notes.size,
      opacity: state.notes.opacity || 1.0,
      points: [pt]
    };

    redrawPanel(pane);
  }, { signal });

  // Pointer Move en el canvas de este panel
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && activeTouches.has(e.pointerId)) {
      activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Gestos de 2 dedos: Paneo y zoom
    if (activeTouches.size >= 2) {
      isSingleTouchPanning = false;
      if (p.isDrawing || p.currentStroke) {
        p.isDrawing = false;
        p.currentStroke = null;
        redrawPanel(pane);
      }
      isPinchingOrPanning = true;

      const touches = Array.from(activeTouches.values());
      const t1 = touches[0];
      const t2 = touches[1];
      const currentDist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
      const currentCenter = { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 };

      const panDx = currentCenter.x - lastPinchCenter.x;
      const panDy = currentCenter.y - lastPinchCenter.y;

      let targetZoom = (pane === 'left' ? state.split.leftScale : state.split.rightScale) || 1.0;
      if (initialPinchDist > 10 && currentDist > 10) {
        const factor = currentDist / initialPinchDist;
        targetZoom = Math.min(2.5, Math.max(0.4, initialPinchZoom * factor));
      }

      applyPaneZoom(pane, targetZoom, currentCenter, panDx, panDy);
      lastPinchCenter = currentCenter;
      return;
    }

    // Desplazamiento táctil fluido vertical/horizontal
    if (isSingleTouchPanning) {
      const now = performance.now();
      const dt = Math.max(1, now - lastTouchTime);
      const dx = e.clientX - lastTouchPos.x;
      const dy = e.clientY - lastTouchPos.y;
      lastTouchPos = { x: e.clientX, y: e.clientY };
      lastTouchTime = now;

      touchVelocityX = touchVelocityX * 0.35 + (dx / dt) * 16 * 0.65;
      touchVelocityY = touchVelocityY * 0.35 + (dy / dt) * 16 * 0.65;

      container.scrollLeft -= dx;
      container.scrollTop -= dy;
      return;
    }

    if (!p.isDrawing) return;

    e.preventDefault();

    const pt = getPanelPoint(e);

    if (state.notes.tool === 'eraser') {
      eraseInPanel(pane, pt, pt);
      return;
    }

    if (p.currentStroke) {
      const lastPt = p.currentStroke.points[p.currentStroke.points.length - 1];
      if (!lastPt || Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y) >= 0.5) {
        p.currentStroke.points.push(pt);
        redrawPanel(pane);
      }
    }
  }, { signal });

  // Pointer Up / Cancel en este panel
  const stopPanelDrawing = (e) => {
    if (e.pointerType === 'touch') {
      activeTouches.delete(e.pointerId);
    }

    try {
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch (err) {}

    if (isSingleTouchPanning) {
      isSingleTouchPanning = false;
      startMomentum();
      return;
    }

    if (activeTouches.size === 0) {
      isPinchingOrPanning = false;
    }

    if (!p.isDrawing) return;
    p.isDrawing = false;

    if (p.currentStroke && p.currentStroke.points.length > 0) {
      let maxY = 0;
      for (const pt of p.currentStroke.points) {
        if (pt.y > maxY) maxY = pt.y;
      }

      // Guardar trazo ÚNICAMENTE en panels[pane].strokes y doc.strokes
      p.strokes.push(p.currentStroke);
      p.doc.strokes = p.strokes;
      p.currentStroke = null;

      dbSaveItem(p.doc);

      if (!isInfinite && maxY > currentHeight - 450) {
        expandPages();
      }
    }

    redrawPanel(pane);
  };

  canvas.addEventListener('pointerup', stopPanelDrawing, { signal });
  canvas.addEventListener('pointercancel', stopPanelDrawing, { signal });
  window.addEventListener('pointerup', stopPanelDrawing, { signal });
  window.addEventListener('pointercancel', stopPanelDrawing, { signal });

  redrawPanel(pane);

  const engineObj = {
    redraw: () => redrawPanel(pane),
    destroy: () => {
      stopMomentum();
      p.abortController.abort();
      p.isDrawing = false;
      p.currentStroke = null;
    }
  };

  p.engine = engineObj;
  return engineObj;
}

async function closeSplitView() {
  if (state.currentView !== 'split-editor') return;

  // Paso 1: Autoguardado individual del documento izquierdo
  if (panels.left.doc) {
    try {
      const leftVp = document.getElementById('split-content-left');
      if (leftVp) {
        panels.left.doc.viewport = {
          x: leftVp.scrollLeft || 0,
          y: leftVp.scrollTop || 0,
          zoom: state.split.leftScale || 1.0
        };
      }
      await dbSaveItem(panels.left.doc);
    } catch (e) {
      console.warn('Error guardando documento izquierdo:', e);
    }
  }

  // Paso 2: Autoguardado individual del documento derecho
  if (panels.right.doc) {
    try {
      const rightVp = document.getElementById('split-content-right');
      if (rightVp) {
        panels.right.doc.viewport = {
          x: rightVp.scrollLeft || 0,
          y: rightVp.scrollTop || 0,
          zoom: state.split.rightScale || 1.0
        };
      }
      await dbSaveItem(panels.right.doc);
    } catch (e) {
      console.warn('Error guardando documento derecho:', e);
    }
  }

  // Paso 3: Si proviene de una sesión guardada, actualizar viewports y proporción
  if (state.split.activeSessionItem) {
    try {
      const titleInput = document.getElementById('split-doc-title');
      if (titleInput && titleInput.value.trim()) {
        state.split.activeSessionItem.title = titleInput.value.trim();
        state.split.activeSessionItem.name = titleInput.value.trim();
      }
      state.split.activeSessionItem.splitRatio = state.split.ratio;
      state.split.activeSessionItem.leftViewport = {
        scrollX: document.getElementById('split-content-left')?.scrollLeft || 0,
        scrollY: document.getElementById('split-content-left')?.scrollTop || 0,
        zoom: state.split.leftScale || 1.0
      };
      state.split.activeSessionItem.rightViewport = {
        scrollX: document.getElementById('split-content-right')?.scrollLeft || 0,
        scrollY: document.getElementById('split-content-right')?.scrollTop || 0,
        zoom: state.split.rightScale || 1.0
      };
      await dbSaveItem(state.split.activeSessionItem);
    } catch (e) {
      console.warn('Error actualizando sesión dual al cerrar:', e);
    }
  }

  // Paso 4: Destruir abortControllers y purgar memoria de ambos lados
  if (panels.left.abortController) panels.left.abortController.abort();
  if (panels.right.abortController) panels.right.abortController.abort();
  if (panels.left.engine && typeof panels.left.engine.destroy === 'function') panels.left.engine.destroy();
  if (panels.right.engine && typeof panels.right.engine.destroy === 'function') panels.right.engine.destroy();

  panels.left = { canvas: null, selCanvas: null, ctx: null, selCtx: null, doc: null, strokes: [], images: [], undoStack: [], redoStack: [], isDrawing: false, currentStroke: null, abortController: null, scale: 1.0, container: null, engine: null };
  panels.right = { canvas: null, selCanvas: null, ctx: null, selCtx: null, doc: null, strokes: [], images: [], undoStack: [], redoStack: [], isDrawing: false, currentStroke: null, abortController: null, scale: 1.0, container: null, engine: null };

  state.split.leftEngine = null;
  state.split.rightEngine = null;

  // Limpiar contenedores
  const leftContent = document.getElementById('split-content-left');
  if (leftContent) leftContent.innerHTML = '';
  const rightContent = document.getElementById('split-content-right');
  if (rightContent) rightContent.innerHTML = '';

  state.split.leftDoc = null;
  state.split.rightDoc = null;
  state.split.activeSessionItem = null;
  state.activeItem = null;

  switchView('file-manager');
  await refreshFileManager();
}

async function openSplitSession(sessionItem) {
  if (!sessionItem) return;
  const leftDoc = state.items.find(i => i.id === sessionItem.leftDocumentId);
  const rightDoc = state.items.find(i => i.id === sessionItem.rightDocumentId);

  // Fallbacks si algún documento no se encuentra
  const finalLeft = leftDoc || (state.items.find(i => i.type === 'note' || i.type === 'notebook') || await dbCreateNote('Nota Izquierda'));
  const finalRight = rightDoc || (state.items.find(i => i.type === 'pdf' || ((i.type === 'note' || i.type === 'notebook') && i.id !== finalLeft.id)) || await dbCreateNote('Nota Derecha'));

  await openSplitViewWithDocs(
    finalLeft,
    finalRight,
    sessionItem,
    sessionItem.splitRatio || 50,
    sessionItem.leftViewport,
    sessionItem.rightViewport
  );
}

async function openSplitViewWithDocs(leftDoc, rightDoc, sessionItem = null, ratio = 50, leftVp = null, rightVp = null) {
  if (state.activeItem) {
    await closeActiveDocument();
  }
  if (state.currentView === 'split-editor') {
    await closeSplitView();
  }

  // CLONADO PROFUNDO PARA AISLAMIENTO TOTAL: si son el mismo documento, garantizar instancias separadas en memoria
  let isolatedLeft = leftDoc ? JSON.parse(JSON.stringify(leftDoc)) : null;
  let isolatedRight = rightDoc ? JSON.parse(JSON.stringify(rightDoc)) : null;

  if (isolatedLeft) normalizeDocumentState(isolatedLeft);
  if (isolatedRight) normalizeDocumentState(isolatedRight);

  state.split.leftDoc = isolatedLeft;
  state.split.rightDoc = isolatedRight;
  state.split.activeSessionItem = sessionItem;
  state.split.ratio = ratio || 50;
  state.split.activePane = 'left';
  state.activeItem = isolatedLeft;

  switchView('split-editor');

  const titleInput = document.getElementById('split-doc-title');
  if (titleInput) {
    titleInput.value = (sessionItem && (sessionItem.title || sessionItem.name)) || 
      `${(isolatedLeft && (isolatedLeft.title || isolatedLeft.name)) || 'Doc 1'} + ${(isolatedRight && (isolatedRight.title || isolatedRight.name)) || 'Doc 2'}`;
  }

  applySplitRatio(state.split.ratio);
  populateSplitDocSelectors();

  await mountPaneDocument('left', isolatedLeft, leftVp);
  await mountPaneDocument('right', isolatedRight, rightVp);

  setActiveSplitPane('left');
  syncSplitToolbarTools();
}

async function mountPaneDocument(pane, doc, savedVp = null) {
  const container = document.getElementById(`split-content-${pane}`);
  if (!container) return;
  container.innerHTML = '';

  if (!doc) {
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted); gap:12px;">
        <div style="font-size:36px;">📄</div>
        <div>No hay documento seleccionado</div>
        <button class="btn-modal-primary btn-create-blank-pane" style="font-size:13px; padding:6px 14px; background:#8b5cf6;">Crear Apunte en Blanco</button>
      </div>`;
    container.querySelector('.btn-create-blank-pane')?.addEventListener('click', async () => {
      const newNote = await dbCreateNote(`Nota ${pane === 'left' ? 'Izquierda' : 'Derecha'}`);
      if (pane === 'left') state.split.leftDoc = newNote;
      else state.split.rightDoc = newNote;
      populateSplitDocSelectors();
      await mountPaneDocument(pane, newNote);
    });
    return;
  }

  // Foco automático en el panel al hacer clic o toque
  container.onpointerdown = () => {
    setActiveSplitPane(pane);
  };

  if (doc.type === 'note' || doc.type === 'notebook') {
    normalizeDocumentState(doc);
    ensureDocImagesLoaded(doc);

    const isInfinite = doc.noteMode === 'infinite' || doc.paperSize === 'infinite';
    const paper = PAPER_SIZES[doc.paperSize] || PAPER_SIZES.a4;
    const isLandscape = doc.orientation === 'landscape';
    const paperWidth = isLandscape ? paper.heightPx : paper.widthPx;
    const pageHeight = doc.pageHeight || (isInfinite ? 2500 : (isLandscape ? paper.widthPx : paper.heightPx));
    const maxSafeHeight = 80000;
    const canvasHeight = Math.max(pageHeight, Math.min(maxSafeHeight, doc.canvasHeight || pageHeight));

    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    let curHeight = canvasHeight;

    const inner = document.createElement('div');
    inner.className = 'notes-viewport-inner';
    inner.style.position = 'relative';
    inner.style.width = `${paperWidth}px`;
    inner.style.minHeight = `${curHeight}px`;
    inner.style.height = `${curHeight}px`;
    inner.style.margin = '20px auto';
    inner.style.boxShadow = 'var(--shadow-paper)';
    inner.style.borderRadius = '4px';
    inner.style.background = doc.bgColor || '#ffffff';

    const canvas = document.createElement('canvas');
    canvas.className = 'notes-canvas-main';
    canvas.width = Math.floor(paperWidth * dpr);
    canvas.height = Math.floor(curHeight * dpr);
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = `${paperWidth}px`;
    canvas.style.height = `${curHeight}px`;
    canvas.style.touchAction = 'none';
    inner.appendChild(canvas);

    const selCanvas = document.createElement('canvas');
    selCanvas.className = 'notes-canvas-selection';
    selCanvas.width = Math.floor(paperWidth * dpr);
    selCanvas.height = Math.floor(curHeight * dpr);
    selCanvas.style.position = 'absolute';
    selCanvas.style.top = '0';
    selCanvas.style.left = '0';
    selCanvas.style.width = `${paperWidth}px`;
    selCanvas.style.height = `${curHeight}px`;
    selCanvas.style.pointerEvents = 'none';
    inner.appendChild(selCanvas);

    container.appendChild(inner);

    const initZoom = (savedVp && savedVp.zoom) || (doc.viewport && doc.viewport.zoom) || 1.0;
    if (pane === 'left') state.split.leftScale = initZoom;
    else state.split.rightScale = initZoom;
    applyPaneZoom(pane, initZoom);

    const paperName = (PAPER_SIZES[doc.paperSize] ? PAPER_SIZES[doc.paperSize].name : (doc.paperSize || 'A4')).toUpperCase();

    // Fondo y cuadrícula de papel del apunte
    applyPatternToElement(inner, doc.patternType || 'grid', doc.bgColor || '#ffffff', (doc.gridSize || 28));

    // Capa de divisores y numeración de hojas
    renderSplitNoteDividers(pane, inner, curHeight, pageHeight, isInfinite, doc.paperSize);

    // Configurar motor de dibujo estrictamente aislado para este panel
    const engine = setupSplitNotePanel(pane, doc, canvas, selCanvas, container, inner, curHeight, pageHeight, isInfinite, paperWidth, dpr);

    // Auto-generación continua de hojas al hacer scroll en el panel
    let scrollRaf = null;
    let isExpanding = false;
    container.addEventListener('scroll', () => {
      if (scrollRaf !== null) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = null;
        if (!isExpanding && !isInfinite && (container.scrollTop + container.clientHeight >= container.scrollHeight - 500)) {
          if (curHeight + pageHeight <= maxSafeHeight) {
            isExpanding = true;
            curHeight += pageHeight;
            doc.canvasHeight = curHeight;
            canvas.height = Math.floor(curHeight * dpr);
            canvas.style.height = `${curHeight}px`;
            selCanvas.height = Math.floor(curHeight * dpr);
            selCanvas.style.height = `${curHeight}px`;
            inner.style.minHeight = `${curHeight}px`;
            inner.style.height = `${curHeight}px`;
            renderSplitNoteDividers(pane, inner, curHeight, pageHeight, isInfinite, doc.paperSize);
            redrawPanel(pane);
            dbSaveItem(doc);
            setTimeout(() => { isExpanding = false; }, 80);
          }
        }
      });
    }, { passive: true });
    attachViewportTouchScroller(container);

    if (pane === 'left') state.split.leftEngine = engine;
    else state.split.rightEngine = engine;

    // Botón / Barra al pie del panel para añadir nueva página
    const addPageBar = document.createElement('div');
    addPageBar.className = 'split-add-page-bar';
    addPageBar.innerHTML = `
      <button type="button" class="btn-split-add-page" id="btn-add-page-split-${pane}">
        <span class="btn-icon">➕</span>
        <span>Añadir Nueva Página (${paperName})</span>
      </button>
    `;
    const addBtn = addPageBar.querySelector('.btn-split-add-page');
    if (addBtn) {
      addBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        curHeight += pageHeight;
        doc.canvasHeight = curHeight;
        canvas.height = Math.floor(curHeight * dpr);
        canvas.style.height = `${curHeight}px`;
        selCanvas.height = Math.floor(curHeight * dpr);
        selCanvas.style.height = `${curHeight}px`;
        inner.style.minHeight = `${curHeight}px`;
        inner.style.height = `${curHeight}px`;
        renderSplitNoteDividers(pane, inner, curHeight, pageHeight, isInfinite, doc.paperSize);
        redrawPanel(pane);
        dbSaveItem(doc);
        setTimeout(() => {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          });
        }, 60);
      };
    }
    container.appendChild(addPageBar);

    redrawPanel(pane);

    if (savedVp && (savedVp.scrollX || savedVp.scrollY)) {
      setTimeout(() => {
        container.scrollLeft = savedVp.scrollX || 0;
        container.scrollTop = savedVp.scrollY || 0;
      }, 50);
    } else if (doc.viewport) {
      setTimeout(() => {
        container.scrollLeft = doc.viewport.x || 0;
        container.scrollTop = doc.viewport.y || 0;
      }, 50);
    }
  } else if (doc.type === 'pdf') {
    await renderPdfInPane(pane, doc, container, savedVp);
  }
}

async function renderPdfInPane(pane, doc, container, savedVp = null) {
  container.innerHTML = '<div style="color:#94a3b8; padding:30px; text-align:center;">Cargando documento PDF...</div>';
  let pdfLib = window.pdfjsLib;
  if (!pdfLib && typeof ensurePdfJsLib === 'function') {
    pdfLib = await ensurePdfJsLib();
  }
  if (!pdfLib) {
    container.innerHTML = '<div style="color:#ef4444; padding:30px; text-align:center;">No se puede inicializar el motor de lectura PDF.</div>';
    return;
  }

  setupPdfWorkerSrc(pdfLib);

  const rawData = (doc.pdfData && (doc.pdfData.arrayBuffer || doc.pdfData.base64 || doc.pdfData.data)) || doc.pdfData;
  const dataCopy = normalizePdfBinaryData(rawData);
  if (!dataCopy || dataCopy.length === 0) {
    container.innerHTML = '<div style="color:#ef4444; padding:30px; text-align:center;">No se pueden leer los datos binarios del archivo PDF.</div>';
    return;
  }

  try {
    const loadingTask = pdfLib.getDocument({
      data: dataCopy,
      isEvalSupported: false,
      disableAutoFetch: true,
      disableStream: true
    });
    const pdfDoc = await loadingTask.promise;
    const totalPages = pdfDoc.numPages;

    const stack = document.createElement('div');
    stack.className = 'pdf-pages-stack';
    container.innerHTML = '';
    container.appendChild(stack);

    const userRot = ((doc.pdfData && doc.pdfData.rotation) || 0) % 360;
    const firstPage = await pdfDoc.getPage(1);
    const firstTotalRot = getPageEffectiveRotation(firstPage, userRot);
    const unscaledVp = firstPage.getViewport({ scale: 1.0, rotation: firstTotalRot });
    const availableW = Math.max(300, container.clientWidth - 40);
    const initScale = (savedVp && savedVp.zoom) || Math.max(0.6, Math.min(1.5, availableW / unscaledVp.width));
    if (pane === 'left') state.split.leftScale = initScale;
    else state.split.rightScale = initScale;
    applyPaneZoom(pane, initScale);

    if (!doc.pdfData.annotations) doc.pdfData.annotations = {};
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const controllers = {};

    const sideCfg = (doc.pdfData && doc.pdfData.sideCanvas) || { position: 'none', width: 350, pattern: 'grid', bgColor: '#ffffff' };
    const sideW = (sideCfg.position && sideCfg.position !== 'none') ? Math.round((sideCfg.width || 350) * initScale) : 0;
    const leftW = (sideCfg.position === 'left' || sideCfg.position === 'both') ? sideW : 0;
    const rightW = (sideCfg.position === 'right' || sideCfg.position === 'both') ? sideW : 0;

    let totalCalculatedHeight = 0;
    const pageGap = 16;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const totalRot = getPageEffectiveRotation(page, userRot);
      const viewport = page.getViewport({ scale: initScale, rotation: totalRot });
      const renderViewport = page.getViewport({ scale: initScale * dpr, rotation: totalRot });

      const totalWidth = leftW + viewport.width + rightW;
      const totalHeight = viewport.height;
      totalCalculatedHeight += totalHeight + (pageNum < totalPages ? pageGap : 0);

      const pageWrap = document.createElement('div');
      pageWrap.className = 'pdf-page-wrapper';
      pageWrap.style.width = `${totalWidth}px`;
      pageWrap.style.height = `${totalHeight}px`;
      pageWrap.style.minWidth = `${totalWidth}px`;
      pageWrap.style.minHeight = `${totalHeight}px`;
      pageWrap.style.position = 'relative';
      pageWrap.style.margin = '0 auto 16px';
      pageWrap.style.boxShadow = 'var(--shadow-paper)';

      const numTag = document.createElement('div');
      numTag.className = 'pdf-page-number-tag';
      numTag.textContent = `${pageNum} / ${totalPages}`;
      pageWrap.appendChild(numTag);

      if (leftW > 0) {
        const leftMarginEl = document.createElement('div');
        leftMarginEl.className = 'pdf-side-margin pdf-side-margin-left';
        leftMarginEl.style.width = `${leftW}px`;
        applyPatternToElement(leftMarginEl, sideCfg.pattern || 'grid', sideCfg.bgColor || '#ffffff', (sideCfg.gridSize || 28) * initScale);
        pageWrap.appendChild(leftMarginEl);
      }

      const renderCanvas = document.createElement('canvas');
      renderCanvas.className = 'pdf-canvas-render';
      renderCanvas.width = Math.floor(renderViewport.width);
      renderCanvas.height = Math.floor(renderViewport.height);
      renderCanvas.style.width = `${viewport.width}px`;
      renderCanvas.style.height = `${viewport.height}px`;
      renderCanvas.style.left = `${leftW}px`;
      renderCanvas.style.top = '0px';
      pageWrap.appendChild(renderCanvas);

      const renderCtx = renderCanvas.getContext('2d');
      try {
        await page.render({ canvasContext: renderCtx, viewport: renderViewport }).promise;
      } catch (e) {
        console.warn(`Página split ${pageNum} render notice:`, e);
      }

      if (rightW > 0) {
        const rightMarginEl = document.createElement('div');
        rightMarginEl.className = 'pdf-side-margin pdf-side-margin-right';
        rightMarginEl.style.left = `${leftW + viewport.width}px`;
        rightMarginEl.style.width = `${rightW}px`;
        applyPatternToElement(rightMarginEl, sideCfg.pattern || 'grid', sideCfg.bgColor || '#ffffff', (sideCfg.gridSize || 28) * initScale);
        pageWrap.appendChild(rightMarginEl);
      }

      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.className = 'pdf-canvas-overlay';
      overlayCanvas.width = Math.floor(totalWidth * dpr);
      overlayCanvas.height = Math.floor(totalHeight * dpr);
      overlayCanvas.style.width = `${totalWidth}px`;
      overlayCanvas.style.height = `${totalHeight}px`;
      overlayCanvas.style.left = '0px';
      overlayCanvas.style.top = '0px';
      overlayCanvas.style.touchAction = 'none';
      pageWrap.appendChild(overlayCanvas);

      const pNum = pageNum;
      const ctrl = setupDrawingEngine(
        overlayCanvas,
        null,
        () => (doc.pdfData && doc.pdfData.annotations ? (doc.pdfData.annotations[pNum] || []) : []),
        (newStrokes, persist = true) => {
          if (!doc.pdfData) doc.pdfData = {};
          if (!doc.pdfData.annotations) doc.pdfData.annotations = {};
          doc.pdfData.annotations[pNum] = newStrokes;
          if (persist) dbSaveItem(doc);
        },
        null,
        container,
        stack,
        () => [],
        () => {},
        () => doc,
        pane
      );
      ctrl.redraw();
      controllers[pageNum] = ctrl;

      stack.appendChild(pageWrap);
    }

    if (totalCalculatedHeight > 0) {
      stack.style.height = `${totalCalculatedHeight}px`;
      stack.style.maxHeight = `${totalCalculatedHeight}px`;
    }

    const engineWrapper = {
      destroy: () => {
        for (const c of Object.values(controllers)) {
          if (c && typeof c.destroy === 'function') c.destroy();
        }
      },
      redraw: () => {
        for (const c of Object.values(controllers)) {
          if (c && typeof c.redraw === 'function') c.redraw();
        }
      }
    };
    if (pane === 'left') state.split.leftEngine = engineWrapper;
    else state.split.rightEngine = engineWrapper;

    if (savedVp && (savedVp.scrollX || savedVp.scrollY)) {
      setTimeout(() => {
        container.scrollLeft = savedVp.scrollX || 0;
        container.scrollTop = savedVp.scrollY || 0;
      }, 50);
    }
  } catch (err) {
    console.error('Error renderizando PDF en panel split:', err);
    container.innerHTML = `<div style="color:#ef4444; padding:24px; text-align:center;">Error al cargar PDF: ${err.message || ''}</div>`;
  }
}

function setActiveSplitPane(pane) {
  state.split.activePane = pane;
  document.getElementById('split-pane-left')?.classList.toggle('pane-active', pane === 'left');
  document.getElementById('split-pane-right')?.classList.toggle('pane-active', pane === 'right');
  document.getElementById('btn-focus-left')?.classList.toggle('active', pane === 'left');
  document.getElementById('btn-focus-right')?.classList.toggle('active', pane === 'right');

  const lblLeft = document.getElementById('split-ctrl-lbl-left');
  const lblRight = document.getElementById('split-ctrl-lbl-right');
  if (lblLeft) lblLeft.classList.toggle('active', pane === 'left');
  if (lblRight) lblRight.classList.toggle('active', pane === 'right');

  state.activeItem = pane === 'left' ? state.split.leftDoc : state.split.rightDoc;
  if (state.activeItem) {
    normalizeDocumentState(state.activeItem);
  }
}

function applySplitRatio(ratio) {
  state.split.ratio = ratio;
  const leftPane = document.getElementById('split-pane-left');
  if (leftPane) {
    leftPane.style.width = `${ratio}%`;
  }
  document.querySelectorAll('.btn-split-ratio').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.ratio, 10) === ratio);
  });
}

async function swapSplitPanes() {
  const tempDoc = state.split.leftDoc;
  state.split.leftDoc = state.split.rightDoc;
  state.split.rightDoc = tempDoc;

  populateSplitDocSelectors();
  await mountPaneDocument('left', state.split.leftDoc);
  await mountPaneDocument('right', state.split.rightDoc);
  setActiveSplitPane(state.split.activePane === 'left' ? 'right' : 'left');
  showToast('Paneles intercambiados', 'info');
}

function applyPaneZoom(pane, scale, focalPoint = null, panDx = 0, panDy = 0) {
  scale = Math.max(0.4, Math.min(2.5, scale));
  const prevScale = (pane === 'left' ? state.split.leftScale : state.split.rightScale) || 1.0;
  if (pane === 'left') state.split.leftScale = scale;
  else state.split.rightScale = scale;

  const textEl = document.getElementById(`split-${pane}-zoom-text`);
  if (textEl) textEl.textContent = `${Math.round(scale * 100)}%`;

  const container = document.getElementById(`split-content-${pane}`);
  if (!container) return;

  const inner = container.querySelector('.notes-viewport-inner, .pdf-pages-stack');
  if (inner) {
    if (focalPoint) {
      const innerRect = inner.getBoundingClientRect();
      const zoomRatio = scale / prevScale;
      const zoomDeltaX = (focalPoint.x - innerRect.left) * (zoomRatio - 1);
      const zoomDeltaY = (focalPoint.y - innerRect.top) * (zoomRatio - 1);
      inner.style.transformOrigin = '0 0';
      inner.style.transform = `scale(${scale})`;
      container.scrollLeft += zoomDeltaX - panDx;
      container.scrollTop += zoomDeltaY - panDy;
    } else {
      inner.style.transformOrigin = '0 0';
      inner.style.transform = `scale(${scale})`;
    }
  }
}

function populateSplitDocSelectors() {
  const selLeft = document.getElementById('split-hdr-select-left') || document.getElementById('split-select-doc-left');
  const selRight = document.getElementById('split-hdr-select-right') || document.getElementById('split-select-doc-right');
  if (!selLeft || !selRight) return;

  const docs = state.items.filter(i => i.type === 'note' || i.type === 'notebook' || i.type === 'pdf');

  function renderOptions(sel, currentDoc) {
    sel.innerHTML = '';
    
    if (currentDoc) {
      const curOpt = document.createElement('option');
      curOpt.value = currentDoc.id;
      curOpt.textContent = `${currentDoc.type === 'pdf' ? '📄' : '📝'} ${currentDoc.name || currentDoc.title}`;
      curOpt.selected = true;
      sel.appendChild(curOpt);
    }

    docs.forEach(d => {
      if (currentDoc && d.id === currentDoc.id) return;
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = `${d.type === 'pdf' ? '📄' : '📝'} ${d.name || d.title}`;
      sel.appendChild(opt);
    });

    const newNoteOpt = document.createElement('option');
    newNoteOpt.value = '__NEW_NOTE__';
    newNoteOpt.textContent = '➕ Crear Nueva Nota...';
    sel.appendChild(newNoteOpt);
  }

  renderOptions(selLeft, state.split.leftDoc);
  renderOptions(selRight, state.split.rightDoc);

  selLeft.onchange = async () => {
    if (selLeft.value === '__NEW_NOTE__') {
      const newNote = await dbCreateNote('Nueva Nota Izquierda');
      state.split.leftDoc = newNote;
    } else {
      const found = state.items.find(i => i.id === selLeft.value);
      if (found) state.split.leftDoc = found;
    }
    populateSplitDocSelectors();
    await mountPaneDocument('left', state.split.leftDoc);
    setActiveSplitPane('left');
  };

  selRight.onchange = async () => {
    if (selRight.value === '__NEW_NOTE__') {
      const newNote = await dbCreateNote('Nueva Nota Derecha');
      state.split.rightDoc = newNote;
    } else {
      const found = state.items.find(i => i.id === selRight.value);
      if (found) state.split.rightDoc = found;
    }
    populateSplitDocSelectors();
    await mountPaneDocument('right', state.split.rightDoc);
    setActiveSplitPane('right');
  };
}

async function saveSplitSessionPrompt() {
  if (!state.split.leftDoc || !state.split.rightDoc) {
    showAlertModal('Debes tener un documento cargado en ambos paneles para guardar la sesión dual.');
    return;
  }

  const titleInput = document.getElementById('split-doc-title');
  const title = (titleInput && titleInput.value.trim()) || 'Sesión de Estudio Dual';

  const leftVp = document.getElementById('split-content-left');
  const rightVp = document.getElementById('split-content-right');

  const sessionItem = state.split.activeSessionItem || {
    id: `split_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: 'split_session',
    createdAt: Date.now(),
    parentId: state.currentFolderId
  };

  sessionItem.title = title;
  sessionItem.name = title;
  sessionItem.leftDocumentId = state.split.leftDoc.id;
  sessionItem.rightDocumentId = state.split.rightDoc.id;
  sessionItem.splitRatio = state.split.ratio;
  sessionItem.leftViewport = {
    scrollX: leftVp ? leftVp.scrollLeft : 0,
    scrollY: leftVp ? leftVp.scrollTop : 0,
    zoom: state.split.leftScale || 1.0
  };
  sessionItem.rightViewport = {
    scrollX: rightVp ? rightVp.scrollLeft : 0,
    scrollY: rightVp ? rightVp.scrollTop : 0,
    zoom: state.split.rightScale || 1.0
  };
  sessionItem.updatedAt = Date.now();

  state.split.activeSessionItem = sessionItem;
  await dbSaveItem(sessionItem);
  showToast(`Espacio de trabajo "${title}" guardado`, 'success');
}

function syncSplitToolbarTools() {
  renderToolbarTools();
}

function initSplitResizerEvents() {
  const resizer = document.getElementById('split-resizer');
  const container = document.getElementById('split-container');
  const leftPane = document.getElementById('split-pane-left');
  if (!resizer || !container || !leftPane) return;

  let isDragging = false;

  resizer.addEventListener('pointerdown', (e) => {
    isDragging = true;
    resizer.classList.add('is-dragging');
    resizer.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  resizer.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const rect = container.getBoundingClientRect();
    const clientX = e.clientX;
    const offset = clientX - rect.left;
    let ratio = Math.round((offset / rect.width) * 100);
    ratio = Math.max(20, Math.min(80, ratio));
    applySplitRatio(ratio);
  });

  const endDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    resizer.classList.remove('is-dragging');
    try { resizer.releasePointerCapture(e.pointerId); } catch {}
  };

  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);

  resizer.addEventListener('dblclick', () => {
    applySplitRatio(50);
  });
}

function initSplitEditorEvents() {
  document.getElementById('btn-split-back')?.addEventListener('click', closeSplitView);
  document.getElementById('btn-split-save')?.addEventListener('click', saveSplitSessionPrompt);
  document.getElementById('btn-split-save-session')?.addEventListener('click', saveSplitSessionPrompt);
  document.getElementById('btn-split-swap')?.addEventListener('click', swapSplitPanes);

  // Cabecera superior: tema, ajustes, reporte, stylus, deshacer/rehacer y fullscreen
  document.getElementById('btn-theme-toggle-split')?.addEventListener('click', toggleTheme);
  document.getElementById('btn-split-settings')?.addEventListener('click', openSettings);
  document.getElementById('btn-split-report-bug')?.addEventListener('click', openBugReportModal);
  document.getElementById('btn-toggle-stylus-mode-split')?.addEventListener('click', toggleStylusMode);
  document.getElementById('btn-split-undo')?.addEventListener('click', () => {
    performPanelUndo(state.split.activePane || 'left');
  });
  document.getElementById('btn-split-redo')?.addEventListener('click', () => {
    performPanelRedo(state.split.activePane || 'left');
  });
  document.getElementById('btn-add-tool-split')?.addEventListener('click', (e) => {
    openBrushManagerModal(e.currentTarget);
  });
  document.getElementById('btn-toggle-fullscreen-split')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Botones de proporción rápida 50/50, 70/30, 30/70, 60/40, 40/60
  document.getElementById('btn-split-50')?.addEventListener('click', () => applySplitRatio(50));
  document.getElementById('btn-split-70')?.addEventListener('click', () => applySplitRatio(70));
  document.getElementById('btn-split-30')?.addEventListener('click', () => applySplitRatio(30));
  document.getElementById('btn-split-60')?.addEventListener('click', () => applySplitRatio(60));
  document.getElementById('btn-split-40')?.addEventListener('click', () => applySplitRatio(40));

  // Pastilla de foco activo
  document.getElementById('btn-focus-left')?.addEventListener('click', () => setActiveSplitPane('left'));
  document.getElementById('btn-focus-right')?.addEventListener('click', () => setActiveSplitPane('right'));

  // Aislamiento de puntero y activación de foco al tocar cada panel
  document.getElementById('split-pane-left')?.addEventListener('pointerdown', (e) => {
    if (state.split.activePane !== 'left') setActiveSplitPane('left');
  });
  document.getElementById('split-pane-right')?.addEventListener('pointerdown', (e) => {
    if (state.split.activePane !== 'right') setActiveSplitPane('right');
  });

  // Zoom independiente por panel
  document.getElementById('btn-split-left-zoom-in')?.addEventListener('click', () => {
    applyPaneZoom('left', (state.split.leftScale || 1.0) + 0.15);
  });
  document.getElementById('btn-split-left-zoom-out')?.addEventListener('click', () => {
    applyPaneZoom('left', (state.split.leftScale || 1.0) - 0.15);
  });
  document.getElementById('btn-split-right-zoom-in')?.addEventListener('click', () => {
    applyPaneZoom('right', (state.split.rightScale || 1.0) + 0.15);
  });
  document.getElementById('btn-split-right-zoom-out')?.addEventListener('click', () => {
    applyPaneZoom('right', (state.split.rightScale || 1.0) - 0.15);
  });

  initSplitResizerEvents();
}

function initSplitModalEvents() {
  const modal = document.getElementById('modal-new-split');
  const btnOpen = document.getElementById('btn-fm-new-split');
  const btnClose = document.getElementById('btn-close-modal-split');
  const btnCancel = document.getElementById('btn-cancel-modal-split');
  const form = document.getElementById('form-new-split');
  const selLeft = document.getElementById('select-split-left-doc');
  const selRight = document.getElementById('select-split-right-doc');
  const nameInput = document.getElementById('input-split-session-name');

  if (!modal || !btnOpen || !form) return;

  btnOpen.onclick = () => {
    const docs = state.items.filter(i => i.type === 'note' || i.type === 'notebook' || i.type === 'pdf');
    
    function fillOptions(selectEl, defaultIndex = 0) {
      selectEl.innerHTML = '';
      if (docs.length === 0) {
        selectEl.innerHTML = '<option value="__NEW__">➕ Crear Nueva Nota Automática</option>';
        return;
      }
      docs.forEach((d, idx) => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.type === 'pdf' ? '📄' : '📝'} ${d.name || d.title}`;
        if (idx === defaultIndex) opt.selected = true;
        selectEl.appendChild(opt);
      });
      const newOpt = document.createElement('option');
      newOpt.value = '__NEW__';
      newOpt.textContent = '➕ Crear Nueva Nota';
      selectEl.appendChild(newOpt);
    }

    fillOptions(selLeft, 0);
    fillOptions(selRight, docs.length > 1 ? 1 : 0);

    nameInput.value = `Sesión de Estudio ${new Date().toLocaleDateString()}`;
    modal.classList.add('open');
  };

  const closeModal = () => modal.classList.remove('open');
  if (btnClose) btnClose.onclick = closeModal;
  if (btnCancel) btnCancel.onclick = closeModal;

  form.onsubmit = async (e) => {
    e.preventDefault();
    closeModal();

    let leftDoc = null;
    let rightDoc = null;

    if (selLeft.value === '__NEW__') {
      leftDoc = await dbCreateNote('Apunte Izquierdo');
    } else {
      leftDoc = state.items.find(i => i.id === selLeft.value);
    }

    if (selRight.value === '__NEW__') {
      rightDoc = await dbCreateNote('Apunte Derecho');
    } else {
      rightDoc = state.items.find(i => i.id === selRight.value);
    }

    const ratioRadio = form.querySelector('input[name="init-split-ratio"]:checked');
    const ratio = ratioRadio ? parseInt(ratioRadio.value, 10) : 50;

    const sessionTitle = nameInput.value.trim() || 'Sesión de Estudio Dual';

    const sessionItem = {
      id: `split_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'split_session',
      name: sessionTitle,
      title: sessionTitle,
      leftDocumentId: leftDoc ? leftDoc.id : null,
      rightDocumentId: rightDoc ? rightDoc.id : null,
      splitRatio: ratio,
      leftViewport: { zoom: 1.0, scrollX: 0, scrollY: 0 },
      rightViewport: { zoom: 1.0, scrollX: 0, scrollY: 0 },
      parentId: state.currentFolderId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await dbSaveItem(sessionItem);
    await openSplitSession(sessionItem);
  };
}
