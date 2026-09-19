// ===== 7. ENTORNO DE TRABAJO: VISOR Y ANOTADOR DE PDF CONTINUO (SOLUCIÓN NÍTIDA) =====
async function loadPdfEditor(pdfItem) {
  normalizeDocumentState(pdfItem);
  state.activeItem = pdfItem;
  if (!pdfItem.pdfData) pdfItem.pdfData = {};
  if (!pdfItem.pdfData.annotations) pdfItem.pdfData.annotations = {};

  switchView('pdf-editor');
  const titleEl = document.getElementById('pdf-doc-title');
  if (titleEl) titleEl.value = pdfItem.title || pdfItem.name || 'Documento PDF';

  state.pdf.pageCanvasControllers = {};
  renderToolbarTools();

  // Asegurar que la herramienta activa esté seleccionada y lista para pintar
  let activeTool = state.toolbarTools.find(t => t.id === state.activeToolId);
  if (!activeTool) {
    activeTool = state.toolbarTools[0] || DEFAULT_TOOLBAR_TOOLS[0];
    state.activeToolId = activeTool.id;
  }
  handleToolButtonClick(activeTool, null);

  const stack = document.getElementById('pdf-pages-stack');
  if (stack) {
    stack.style.transform = '';
    stack.style.transformOrigin = '0 0';
  }
  stack.innerHTML = '<div style="color: #94a3b8; padding: 40px; font-size: 15px; text-align: center;">Cargando documento PDF...</div>';
  const viewport = document.getElementById('pdf-continuous-viewport');
  if (viewport) {
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
  }

  try {
    let pdfLib = window.pdfjsLib;
    if (!pdfLib && typeof ensurePdfJsLib === 'function') {
      pdfLib = await ensurePdfJsLib();
    }
    if (!pdfLib) {
      throw new Error('No se pudo inicializar la librería local PDF.js.');
    }

    setupPdfWorkerSrc(pdfLib);

    if (pdfItem._cachedDoc) {
      state.pdf.doc = pdfItem._cachedDoc;
      state.pdf.totalPages = state.pdf.doc.numPages;
    } else {
      const rawData = (pdfItem.pdfData && (pdfItem.pdfData.arrayBuffer || pdfItem.pdfData.base64 || pdfItem.pdfData.data)) || pdfItem.pdfData;
      let dataCopy = normalizePdfBinaryData(rawData);
      if ((!dataCopy || dataCopy.length === 0) && pdfItem.pdfData && pdfItem.pdfData.base64) {
        dataCopy = normalizePdfBinaryData(pdfItem.pdfData.base64);
      }
      if (!dataCopy || dataCopy.length === 0) {
        throw new Error('Los datos binarios del PDF no están disponibles o están dañados. Intenta volver a importarlo.');
      }

      const loadingTask = pdfLib.getDocument({
        data: dataCopy.slice(0),
        isEvalSupported: false,
        disableAutoFetch: true,
        disableStream: true
      });
      state.pdf.doc = await loadingTask.promise;
      state.pdf.totalPages = state.pdf.doc.numPages;
    }

    // Calcular escala inicial óptima
    const firstPage = await state.pdf.doc.getPage(1);
    const userRot = ((pdfItem.pdfData && pdfItem.pdfData.rotation) || 0) % 360;
    const totalRot = getPageEffectiveRotation(firstPage, userRot);
    const unscaledViewport = firstPage.getViewport({ scale: 1.0, rotation: totalRot });

    const sideCfg = (pdfItem.pdfData && pdfItem.pdfData.sideCanvas) || { position: 'none', width: 350 };
    const sideW = (sideCfg.position && sideCfg.position !== 'none') ? (sideCfg.width || 350) : 0;
    const leftW = (sideCfg.position === 'left' || sideCfg.position === 'both') ? sideW : 0;
    const rightW = (sideCfg.position === 'right' || sideCfg.position === 'both') ? sideW : 0;
    const totalUnscaledW = leftW + unscaledViewport.width + rightW;

    const availableWidth = Math.min(window.innerWidth - 48, 900);
    state.pdf.scale = Math.max(0.7, Math.min(1.8, availableWidth / Math.max(unscaledViewport.width, totalUnscaledW)));
    const zoomText = document.getElementById('pdf-zoom-text');
    if (zoomText) zoomText.textContent = `${Math.round(state.pdf.scale * 100)}%`;

    await renderAllPdfPagesContinuous(pdfItem);
  } catch (err) {
    console.error('Error abriendo PDF:', err);
    stack.innerHTML = `
      <div class="pdf-load-error-card">
        <div style="font-size: 36px; margin-bottom: 12px;">⚠️</div>
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 6px; color: var(--danger);">No se pudo abrir el documento PDF</div>
        <div style="font-size: 13px; color: var(--text-secondary); max-width: 440px; margin-bottom: 16px; line-height: 1.4;">${err.message || 'Error de procesamiento.'}</div>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button class="btn-modal-primary" id="btn-retry-pdf" style="font-size: 13px; padding: 7px 16px;">🔄 Reintentar</button>
          <button class="btn-modal-secondary" id="btn-back-pdf-err" style="font-size: 13px; padding: 7px 16px;">⬅ Volver al Gestor</button>
        </div>
      </div>
    `;
    document.getElementById('btn-retry-pdf')?.addEventListener('click', () => loadPdfEditor(pdfItem));
    document.getElementById('btn-back-pdf-err')?.addEventListener('click', () => closeActiveDocument());
  }

  updateToolBadges();
}

async function renderAllPdfPagesContinuous(pdfItem) {
  const stack = document.getElementById('pdf-pages-stack');
  stack.innerHTML = '';
  const dpr = Math.max(window.devicePixelRatio || 1, 2);
  const viewportContainer = document.getElementById('pdf-continuous-viewport');
  const userRot = ((pdfItem.pdfData && pdfItem.pdfData.rotation) || 0) % 360;

  const sideCfg = (pdfItem.pdfData && pdfItem.pdfData.sideCanvas) || { position: 'none', width: 350, pattern: 'grid', bgColor: '#ffffff' };
  const currentScale = state.pdf.scale || 1.0;
  const sideW = (sideCfg.position && sideCfg.position !== 'none') ? Math.round((sideCfg.width || 350) * currentScale) : 0;
  const leftW = (sideCfg.position === 'left' || sideCfg.position === 'both') ? sideW : 0;
  const rightW = (sideCfg.position === 'right' || sideCfg.position === 'both') ? sideW : 0;

  let totalCalculatedHeight = 0;
  const pageGap = 16;

  for (let pageNum = 1; pageNum <= state.pdf.totalPages; pageNum++) {
    const page = await state.pdf.doc.getPage(pageNum);
    const totalRot = getPageEffectiveRotation(page, userRot);
    
    // Viewport CSS y Viewport Renderizado en Alta Resolución (Vectorial Nítido y Rotado)
    const viewport = page.getViewport({ scale: currentScale, rotation: totalRot });
    const renderViewport = page.getViewport({ scale: currentScale * dpr, rotation: totalRot });

    const totalWidth = leftW + viewport.width + rightW;
    const totalHeight = viewport.height;
    totalCalculatedHeight += totalHeight + (pageNum < state.pdf.totalPages ? pageGap : 0);

    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.style.width = `${totalWidth}px`;
    wrapper.style.height = `${totalHeight}px`;
    wrapper.style.minWidth = `${totalWidth}px`;
    wrapper.style.minHeight = `${totalHeight}px`;
    wrapper.style.position = 'relative';

    const numTag = document.createElement('div');
    numTag.className = 'pdf-page-number-tag';
    numTag.textContent = `${pageNum} / ${state.pdf.totalPages}`;
    wrapper.appendChild(numTag);

    // Margen Lateral Izquierdo si está configurado
    if (leftW > 0) {
      const leftMarginEl = document.createElement('div');
      leftMarginEl.className = 'pdf-side-margin pdf-side-margin-left';
      leftMarginEl.style.width = `${leftW}px`;
      applyPatternToElement(leftMarginEl, sideCfg.pattern || 'grid', sideCfg.bgColor || '#ffffff', (sideCfg.gridSize || 28) * state.pdf.scale);
      wrapper.appendChild(leftMarginEl);
    }

    // Canvas de renderizado de texto y gráficos del PDF
    const renderCanvas = document.createElement('canvas');
    renderCanvas.className = 'pdf-canvas-render';
    renderCanvas.width = Math.floor(renderViewport.width);
    renderCanvas.height = Math.floor(renderViewport.height);
    renderCanvas.style.width = `${viewport.width}px`;
    renderCanvas.style.height = `${viewport.height}px`;
    renderCanvas.style.left = `${leftW}px`;
    renderCanvas.style.top = '0px';
    wrapper.appendChild(renderCanvas);

    const renderCtx = renderCanvas.getContext('2d');
    try {
      const renderTask = page.render({
        canvasContext: renderCtx,
        viewport: renderViewport
      });
      await renderTask.promise;
    } catch (renderErr) {
      console.warn(`Página ${pageNum} render notice:`, renderErr);
    }

    // Margen Lateral Derecho si está configurado
    if (rightW > 0) {
      const rightMarginEl = document.createElement('div');
      rightMarginEl.className = 'pdf-side-margin pdf-side-margin-right';
      rightMarginEl.style.left = `${leftW + viewport.width}px`;
      rightMarginEl.style.width = `${rightW}px`;
      applyPatternToElement(rightMarginEl, sideCfg.pattern || 'grid', sideCfg.bgColor || '#ffffff', (sideCfg.gridSize || 28) * state.pdf.scale);
      wrapper.appendChild(rightMarginEl);
    }

    // Canvas transparente superior para anotaciones con lápiz táctil que cubre TODO el ancho (PDF + Márgenes)
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.className = 'pdf-canvas-overlay';
    overlayCanvas.width = Math.floor(totalWidth * dpr);
    overlayCanvas.height = Math.floor(totalHeight * dpr);
    overlayCanvas.style.width = `${totalWidth}px`;
    overlayCanvas.style.height = `${totalHeight}px`;
    overlayCanvas.style.left = '0px';
    overlayCanvas.style.top = '0px';
    wrapper.appendChild(overlayCanvas);

    const pNum = pageNum;
    const controller = setupDrawingEngine(
      overlayCanvas,
      null,
      () => (pdfItem.pdfData && pdfItem.pdfData.annotations ? (pdfItem.pdfData.annotations[pNum] || []) : []),
      (newStrokes, persist = true) => {
        if (!pdfItem.pdfData) pdfItem.pdfData = {};
        if (!pdfItem.pdfData.annotations) pdfItem.pdfData.annotations = {};
        pdfItem.pdfData.annotations[pNum] = newStrokes;
        if (persist) {
          dbSaveItem(pdfItem);
        }
      },
      null,
      viewportContainer,
      stack,
      () => [],
      () => {},
      () => pdfItem
    );

    controller.redraw();
    state.pdf.pageCanvasControllers[pageNum] = controller;

    stack.appendChild(wrapper);
  }

  // Límite estricto de altura para impedir cualquier overscroll más allá de la última página
  if (totalCalculatedHeight > 0) {
    stack.style.height = `${totalCalculatedHeight}px`;
    stack.style.maxHeight = `${totalCalculatedHeight}px`;
  }

  if (viewportContainer) {
    attachViewportTouchScroller(viewportContainer);
  }
}

function initPdfEditorEvents() {
  document.getElementById('btn-pdf-back').onclick = async () => {
    await closeActiveDocument();
    await refreshFileManager();
    switchView('file-manager');
  };

  document.getElementById('pdf-doc-title').onchange = (e) => {
    if (state.activeItem) {
      state.activeItem.name = e.target.value.trim() || state.activeItem.name;
      dbSaveItem(state.activeItem);
    }
  };

  const penBtn = document.getElementById('pdf-tool-pen');
  const highBtn = document.getElementById('pdf-tool-highlighter');
  const eraserBtn = document.getElementById('pdf-tool-eraser');

  function setPdfTool(t) {
    state.notes.tool = t;
    if (penBtn) penBtn.classList.toggle('active', t === 'pen');
    if (highBtn) highBtn.classList.toggle('active', t === 'highlighter');
    if (eraserBtn) eraserBtn.classList.toggle('active', t === 'eraser');
  }

  if (penBtn) {
    penBtn.onclick = (e) => {
      setPdfTool('pen');
      state.notes.brushType = 'pen';
      togglePopover(document.getElementById('popover-brush-settings'), e.currentTarget);
      updateLiveBrushPreview();
    };
  }

  if (highBtn) {
    highBtn.onclick = (e) => {
      setPdfTool('highlighter');
      state.notes.brushType = 'highlighter';
      togglePopover(document.getElementById('popover-brush-settings'), e.currentTarget);
      updateLiveBrushPreview();
    };
  }

  if (eraserBtn) {
    eraserBtn.onclick = (e) => {
      setPdfTool('eraser');
      togglePopover(document.getElementById('popover-eraser-settings'), e.currentTarget);
    };
  }

  const dots = document.querySelectorAll('#pdf-palette .dot-btn');
  dots.forEach(d => {
    d.onclick = () => applySelectedColor(d.dataset.color);
  });

  // Deshacer / Rehacer en PDF
  const pdfUndoBtn = document.getElementById('btn-pdf-undo');
  if (pdfUndoBtn) {
    pdfUndoBtn.onclick = () => {
      if (!state.activeItem) return;
      performUndo(state.activeItem);
    };
  }

  const pdfRedoBtn = document.getElementById('btn-pdf-redo');
  if (pdfRedoBtn) {
    pdfRedoBtn.onclick = () => {
      if (!state.activeItem) return;
      performRedo(state.activeItem);
    };
  }

  // Botón Lienzo Lateral (Margen Extra para Apuntes)
  const btnSideMargin = document.getElementById('btn-pdf-side-margin');
  if (btnSideMargin) {
    btnSideMargin.onclick = () => {
      openPdfSideCanvasConfigModal();
    };
  }

  // Insertar Imagen en PDF
  const btnPdfImg = document.getElementById('btn-pdf-insert-image');
  const inputPdfImg = document.getElementById('input-pdf-image');
  if (btnPdfImg && inputPdfImg) {
    btnPdfImg.onclick = () => {
      inputPdfImg.value = '';
      inputPdfImg.click();
    };
    inputPdfImg.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        insertImageIntoPdf(e.target.files[0]);
      }
    };
  }

  // Toggle Modo Solo Lápiz en PDF
  const btnStylusPdf = document.getElementById('btn-toggle-stylus-mode-pdf');
  if (btnStylusPdf) {
    btnStylusPdf.onclick = () => toggleStylusMode();
  }

  // Exportar Documento PDF Anotado
  const btnPdfExport = document.getElementById('btn-pdf-export');
  if (btnPdfExport) {
    btnPdfExport.onclick = () => {
      if (!state.activeItem) return;
      openExportModal('pdf');
    };
  }
}

// ===== RENDERIZADO CONTROLADO PÁGINA A PÁGINA EN CANVAS =====
async function renderizarPaginaPDF(pdfDoc, numPagina, canvasDestino, escala = 1.5, rotacion = 0) {
  if (!pdfDoc || !canvasDestino) return null;
  const page = await pdfDoc.getPage(numPagina);
  const effectiveRot = getPageEffectiveRotation(page, rotacion);
  const viewport = page.getViewport({ scale: escala, rotation: effectiveRot });
  
  canvasDestino.width = Math.floor(viewport.width);
  canvasDestino.height = Math.floor(viewport.height);
  canvasDestino.style.width = `${viewport.width}px`;
  canvasDestino.style.height = `${viewport.height}px`;

  const ctx = canvasDestino.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvasDestino.width, canvasDestino.height);

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport
  };
  await page.render(renderContext).promise;
  return { page, viewport };
}

// ===== GESTOR DE VISTA PREVIA Y CONFIGURACIÓN DE PDF AL IMPORTAR =====
let pendingPdfImport = {
  file: null,
  arrayBuffer: null,
  pdfDoc: null,
  name: '',
  rotation: 0,
  sideCanvas: {
    position: 'none',
    width: 350,
    pattern: 'grid',
    bgColor: '#ffffff',
    gridSize: 28
  },
  currentPage: 1,
  totalPages: 1
};

async function openPdfImportPreviewModal(fileObj) {
  const modal = document.getElementById('modal-pdf-import-preview');
  if (!modal) return;

  let pdfLib = window.pdfjsLib;
  if (!pdfLib && typeof ensurePdfJsLib === 'function') {
    pdfLib = await ensurePdfJsLib();
  }
  if (!pdfLib) {
    alert('Error crítico: El motor de lectura PDF (PDF.js) no está disponible en este navegador.');
    return;
  }

  setupPdfWorkerSrc(pdfLib);

  try {
    // 1. Lectura Nativa mediante FileReader con readAsArrayBuffer
    const rawBuffer = await new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = function() {
        resolve(this.result);
      };
      fileReader.onerror = function(readErr) {
        reject(readErr || new Error('No se pudo leer el archivo binario del PDF.'));
      };
      fileReader.readAsArrayBuffer(fileObj);
    });

    const typedArray = normalizePdfBinaryData(rawBuffer);
    if (!typedArray || typedArray.length === 0) {
      throw new Error('El archivo seleccionado está vacío o no contiene datos válidos de PDF.');
    }

    const base64Str = arrayBufferToBase64(typedArray);
    const previewBytes = typedArray.slice(0);

    // 2. Carga en hilo directo / fake worker sin bloqueos CORS
    const loadingTask = pdfLib.getDocument({
      data: previewBytes,
      isEvalSupported: false,
      disableAutoFetch: true,
      disableStream: true
    });
    const pdfDoc = await loadingTask.promise;

    pendingPdfImport = {
      file: fileObj,
      arrayBuffer: typedArray.buffer.slice(0),
      base64: base64Str,
      pdfDoc: pdfDoc,
      name: fileObj.name.replace(/\.pdf$/i, ''),
      rotation: 0,
      sideCanvas: {
        position: 'none',
        width: 350,
        pattern: 'grid',
        bgColor: '#ffffff',
        gridSize: 28
      },
      currentPage: 1,
      totalPages: pdfDoc.numPages
    };

    const nameInput = document.getElementById('input-pdf-preview-name');
    if (nameInput) nameInput.value = pendingPdfImport.name;

    updatePdfPreviewModalUI();
    await renderPdfImportPreviewPage();

    modal.classList.add('open');
  } catch (err) {
    console.error('Error al generar vista previa del PDF:', err);
    alert('Error al abrir PDF: ' + (err.message || 'Error de archivo o formato no compatible'));
    if (typeof showToast === 'function') {
      showToast('Error al abrir PDF: ' + (err.message || 'Error de archivo'), 'error');
    }
  }
}

function updatePdfPreviewModalUI() {
  const rotBadge = document.getElementById('preview-rot-badge');
  if (rotBadge) rotBadge.textContent = `${pendingPdfImport.rotation}°`;
  document.querySelectorAll('#group-pdf-preview-rotation .pill-opt-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.rot, 10) === pendingPdfImport.rotation);
  });

  const subEl = document.getElementById('pdf-preview-modal-sub');
  if (subEl) {
    const totalP = pendingPdfImport.totalPages || 1;
    subEl.textContent = `Documento de ${totalP} ${totalP === 1 ? 'página' : 'páginas'}. Se importarán todas para lectura y anotación continua.`;
  }

  const btnConfirm = document.getElementById('btn-confirm-pdf-import');
  if (btnConfirm) {
    const totalP = pendingPdfImport.totalPages || 1;
    btnConfirm.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px;"><path d="M5 13l4 4L19 7"/></svg>
      <span>Importar todas las páginas (${totalP} ${totalP === 1 ? 'pág.' : 'págs.'})</span>
    `;
  }

  const pageInd = document.getElementById('preview-page-indicator');
  if (pageInd) pageInd.textContent = `Pág. ${pendingPdfImport.currentPage} de ${pendingPdfImport.totalPages}`;
  const btnPrev = document.getElementById('btn-preview-prev-page');
  if (btnPrev) btnPrev.disabled = pendingPdfImport.currentPage <= 1;
  const btnNext = document.getElementById('btn-preview-next-page');
  if (btnNext) btnNext.disabled = pendingPdfImport.currentPage >= pendingPdfImport.totalPages;

  document.querySelectorAll('.side-pos-card[data-pos]').forEach(card => {
    const pos = card.dataset.pos;
    if (pos) {
      card.classList.toggle('active', pos === pendingPdfImport.sideCanvas.position);
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = pos === pendingPdfImport.sideCanvas.position;
    }
  });

  const optsWrap = document.getElementById('pdf-side-canvas-options-wrap');
  const isSideActive = pendingPdfImport.sideCanvas.position !== 'none';
  if (optsWrap) optsWrap.style.display = isSideActive ? 'block' : 'none';

  const widthValLabel = document.getElementById('label-side-width-val');
  if (widthValLabel) widthValLabel.textContent = `${pendingPdfImport.sideCanvas.width} px`;
  const slider = document.getElementById('slider-pdf-side-width');
  if (slider) slider.value = pendingPdfImport.sideCanvas.width;
  document.querySelectorAll('.preset-width-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.width, 10) === pendingPdfImport.sideCanvas.width);
  });

  // Side canvas color selection
  const curBg = (pendingPdfImport.sideCanvas.bgColor || '#ffffff').toLowerCase();
  document.querySelectorAll('.side-color-btn').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.color || '').toLowerCase() === curBg);
  });
  const colorInput = document.getElementById('input-pdf-side-bg-color');
  if (colorInput) colorInput.value = pendingPdfImport.sideCanvas.bgColor || '#ffffff';

  // Side canvas pattern selection
  document.querySelectorAll('#group-pdf-preview-pattern .preview-pattern-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pattern === pendingPdfImport.sideCanvas.pattern);
  });

  // Side canvas grid / line distance spacing
  const curGridSize = pendingPdfImport.sideCanvas.gridSize || 28;
  const gridValLabel = document.getElementById('label-side-gridsize-val');
  if (gridValLabel) gridValLabel.textContent = `${curGridSize} px`;
  const gridSlider = document.getElementById('slider-pdf-side-gridsize');
  if (gridSlider) gridSlider.value = curGridSize;
  document.querySelectorAll('.preset-side-gridsize-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.gridsize, 10) === curGridSize);
  });
  const gridWrap = document.getElementById('group-pdf-preview-grid-size-wrap');
  if (gridWrap) {
    gridWrap.style.display = pendingPdfImport.sideCanvas.pattern === 'blank' ? 'none' : 'block';
  }
}

let currentPdfPreviewRenderTask = null;
let currentPreviewScale = 0.5;

async function renderPdfImportPreviewPage() {
  if (!pendingPdfImport.pdfDoc) return;

  // Cancel any running render task before starting a new one
  if (currentPdfPreviewRenderTask) {
    try {
      currentPdfPreviewRenderTask.cancel();
    } catch (e) {}
    currentPdfPreviewRenderTask = null;
  }

  try {
    const page = await pendingPdfImport.pdfDoc.getPage(pendingPdfImport.currentPage);
    const userRot = (pendingPdfImport.rotation || 0) % 360;
    const totalRot = getPageEffectiveRotation(page, userRot);
    
    const unscaledVp = page.getViewport({ scale: 1.0, rotation: totalRot });
    const maxPreviewW = 320;
    const maxPreviewH = 360;
    const previewScale = Math.min(maxPreviewW / unscaledVp.width, maxPreviewH / unscaledVp.height, 0.6);
    currentPreviewScale = previewScale;
    
    const viewport = page.getViewport({ scale: previewScale, rotation: totalRot });
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const renderViewport = page.getViewport({ scale: previewScale * dpr, rotation: totalRot });

    const canvas = document.getElementById('pdf-preview-render-canvas');
    if (!canvas) return;
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderTask = page.render({ canvasContext: ctx, viewport: renderViewport });
    currentPdfPreviewRenderTask = renderTask;

    try {
      await renderTask.promise;
    } catch (renderErr) {
      if (renderErr && renderErr.name === 'RenderingCancelledException') {
        return;
      }
      throw renderErr;
    } finally {
      if (currentPdfPreviewRenderTask === renderTask) {
        currentPdfPreviewRenderTask = null;
      }
    }

    updatePdfPreviewSideMargins(viewport.height, previewScale);
  } catch (err) {
    if (err && err.name !== 'RenderingCancelledException') {
      console.error('Error renderizando vista previa de página PDF:', err);
    }
  }
}

function updatePdfPreviewSideMargins(canvasHeight, previewScale) {
  const canvas = document.getElementById('pdf-preview-render-canvas');
  const h = canvasHeight || (canvas ? parseInt(canvas.style.height, 10) : 300) || 300;
  const scale = previewScale || currentPreviewScale || 0.5;

  const sidePos = pendingPdfImport.sideCanvas.position;
  const sideW = Math.round((pendingPdfImport.sideCanvas.width || 350) * scale);
  const leftMarginEl = document.getElementById('preview-margin-left');
  const rightMarginEl = document.getElementById('preview-margin-right');

  const effectiveGridSize = (pendingPdfImport.sideCanvas.gridSize || 28) * (scale / 0.6);

  if (leftMarginEl) {
    if (sidePos === 'left' || sidePos === 'both') {
      leftMarginEl.style.display = 'block';
      leftMarginEl.style.width = `${sideW}px`;
      leftMarginEl.style.height = `${h}px`;
      applyPatternToElement(leftMarginEl, pendingPdfImport.sideCanvas.pattern, pendingPdfImport.sideCanvas.bgColor || '#ffffff', Math.max(10, Math.round(effectiveGridSize)));
    } else {
      leftMarginEl.style.display = 'none';
    }
  }

  if (rightMarginEl) {
    if (sidePos === 'right' || sidePos === 'both') {
      rightMarginEl.style.display = 'block';
      rightMarginEl.style.width = `${sideW}px`;
      rightMarginEl.style.height = `${h}px`;
      applyPatternToElement(rightMarginEl, pendingPdfImport.sideCanvas.pattern, pendingPdfImport.sideCanvas.bgColor || '#ffffff', Math.max(10, Math.round(effectiveGridSize)));
    } else {
      rightMarginEl.style.display = 'none';
    }
  }
}

function initPdfImportPreviewModalEvents() {
  const modal = document.getElementById('modal-pdf-import-preview');
  if (!modal) return;

  const closeModal = () => modal.classList.remove('open');
  document.getElementById('btn-close-modal-pdf-preview')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-modal-pdf-preview')?.addEventListener('click', closeModal);

  document.getElementById('btn-preview-rot-ccw')?.addEventListener('click', async () => {
    pendingPdfImport.rotation = ((pendingPdfImport.rotation - 90 + 360) % 360);
    updatePdfPreviewModalUI();
    await renderPdfImportPreviewPage();
  });

  document.getElementById('btn-preview-rot-cw')?.addEventListener('click', async () => {
    pendingPdfImport.rotation = ((pendingPdfImport.rotation + 90) % 360);
    updatePdfPreviewModalUI();
    await renderPdfImportPreviewPage();
  });

  document.querySelectorAll('#group-pdf-preview-rotation .pill-opt-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      pendingPdfImport.rotation = parseInt(btn.dataset.rot, 10);
      updatePdfPreviewModalUI();
      await renderPdfImportPreviewPage();
    });
  });

  document.getElementById('btn-preview-prev-page')?.addEventListener('click', async () => {
    if (pendingPdfImport.currentPage > 1) {
      pendingPdfImport.currentPage--;
      updatePdfPreviewModalUI();
      await renderPdfImportPreviewPage();
    }
  });

  document.getElementById('btn-preview-next-page')?.addEventListener('click', async () => {
    if (pendingPdfImport.currentPage < pendingPdfImport.totalPages) {
      pendingPdfImport.currentPage++;
      updatePdfPreviewModalUI();
      await renderPdfImportPreviewPage();
    }
  });

  document.querySelectorAll('.side-pos-card[data-pos]').forEach(card => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      pendingPdfImport.sideCanvas.position = card.dataset.pos;
      updatePdfPreviewModalUI();
      updatePdfPreviewSideMargins();
    });
  });

  document.querySelectorAll('.preset-width-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingPdfImport.sideCanvas.width = parseInt(btn.dataset.width, 10);
      updatePdfPreviewModalUI();
      updatePdfPreviewSideMargins();
    });
  });

  const slider = document.getElementById('slider-pdf-side-width');
  if (slider) {
    slider.addEventListener('input', (e) => {
      pendingPdfImport.sideCanvas.width = parseInt(e.target.value, 10);
      const widthValLabel = document.getElementById('label-side-width-val');
      if (widthValLabel) widthValLabel.textContent = `${pendingPdfImport.sideCanvas.width} px`;
      document.querySelectorAll('.preset-width-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.width, 10) === pendingPdfImport.sideCanvas.width);
      });
      updatePdfPreviewSideMargins();
    });
  }

  // Side canvas color buttons & picker in preview
  document.querySelectorAll('.side-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingPdfImport.sideCanvas.bgColor = btn.dataset.color;
      updatePdfPreviewModalUI();
      updatePdfPreviewSideMargins();
    });
  });

  const colorInput = document.getElementById('input-pdf-side-bg-color');
  if (colorInput) {
    colorInput.addEventListener('input', (e) => {
      pendingPdfImport.sideCanvas.bgColor = e.target.value;
      updatePdfPreviewModalUI();
      updatePdfPreviewSideMargins();
    });
  }

  document.querySelectorAll('#group-pdf-preview-pattern .preview-pattern-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingPdfImport.sideCanvas.pattern = btn.dataset.pattern;
      updatePdfPreviewModalUI();
      updatePdfPreviewSideMargins();
    });
  });

  // Distancia / Tamaño de líneas o cuadrícula en vista previa
  document.querySelectorAll('.preset-side-gridsize-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingPdfImport.sideCanvas.gridSize = parseInt(btn.dataset.gridsize, 10);
      updatePdfPreviewModalUI();
      updatePdfPreviewSideMargins();
    });
  });

  const gridSlider = document.getElementById('slider-pdf-side-gridsize');
  if (gridSlider) {
    gridSlider.addEventListener('input', (e) => {
      pendingPdfImport.sideCanvas.gridSize = parseInt(e.target.value, 10);
      const gridValLabel = document.getElementById('label-side-gridsize-val');
      if (gridValLabel) gridValLabel.textContent = `${pendingPdfImport.sideCanvas.gridSize} px`;
      document.querySelectorAll('.preset-side-gridsize-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.gridsize, 10) === pendingPdfImport.sideCanvas.gridSize);
      });
      updatePdfPreviewSideMargins();
    });
  }

  const nameInput = document.getElementById('input-pdf-preview-name');
  if (nameInput) {
    nameInput.addEventListener('input', (e) => {
      pendingPdfImport.name = e.target.value.trim() || 'Documento';
    });
  }

  document.getElementById('btn-confirm-pdf-import')?.addEventListener('click', async () => {
    if (!pendingPdfImport.file && !pendingPdfImport.arrayBuffer && !pendingPdfImport.base64) return;
    const cleanName = (nameInput && nameInput.value.trim()) || pendingPdfImport.name || 'Documento';
    const totalP = pendingPdfImport.totalPages || 1;
    const pdfItem = await dbImportPdf(pendingPdfImport.file, state.currentFolderId, {
      name: cleanName,
      arrayBuffer: pendingPdfImport.arrayBuffer ? pendingPdfImport.arrayBuffer.slice(0) : null,
      base64: pendingPdfImport.base64,
      rotation: pendingPdfImport.rotation,
      pageCount: totalP,
      sideCanvas: { ...pendingPdfImport.sideCanvas }
    });

    if (pendingPdfImport.pdfDoc) {
      pdfItem._cachedDoc = pendingPdfImport.pdfDoc;
    }

    closeModal();
    await refreshFileManager();
    await openDocument(pdfItem);
    if (typeof showToast === 'function') {
      showToast(`PDF importado con éxito: ${cleanName} (${totalP} ${totalP === 1 ? 'página' : 'páginas'})`, 'success');
    }
  });
}

// ===== GESTOR DE AJUSTE DE LIENZO LATERAL EN PDF YA ABIERTO =====
let currentPdfSideConfig = {
  position: 'none',
  width: 350,
  pattern: 'grid',
  bgColor: '#ffffff',
  gridSize: 28
};

function openPdfSideCanvasConfigModal() {
  if (!state.activeItem || state.activeItem.type !== 'pdf') return;
  const modal = document.getElementById('modal-pdf-side-canvas-config');
  if (!modal) return;

  const existingSide = (state.activeItem.pdfData && state.activeItem.pdfData.sideCanvas) || {
    position: 'none',
    width: 350,
    pattern: 'grid',
    bgColor: '#ffffff',
    gridSize: 28
  };

  currentPdfSideConfig = { ...existingSide };
  if (!currentPdfSideConfig.gridSize) currentPdfSideConfig.gridSize = 28;
  updatePdfSideConfigModalUI();
  modal.classList.add('open');
}

function updatePdfSideConfigModalUI() {
  document.querySelectorAll('.side-pos-card[data-pos-edit]').forEach(card => {
    const pos = card.dataset.posEdit;
    card.classList.toggle('active', pos === currentPdfSideConfig.position);
    const radio = card.querySelector('input[type="radio"]');
    if (radio) radio.checked = pos === currentPdfSideConfig.position;
  });

  const opts = document.getElementById('pdf-side-edit-options');
  if (opts) opts.style.display = currentPdfSideConfig.position !== 'none' ? 'block' : 'none';

  const widthValLabel = document.getElementById('label-side-edit-width-val');
  if (widthValLabel) widthValLabel.textContent = `${currentPdfSideConfig.width} px`;

  const slider = document.getElementById('slider-pdf-side-edit-width');
  if (slider) slider.value = currentPdfSideConfig.width;

  document.querySelectorAll('.preset-edit-width-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.width, 10) === currentPdfSideConfig.width);
  });

  // Edit modal color presets & picker
  const curEditBg = (currentPdfSideConfig.bgColor || '#ffffff').toLowerCase();
  document.querySelectorAll('.side-edit-color-btn').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.color || '').toLowerCase() === curEditBg);
  });
  const editColorInput = document.getElementById('input-pdf-side-edit-bg-color');
  if (editColorInput) editColorInput.value = currentPdfSideConfig.bgColor || '#ffffff';

  document.querySelectorAll('#group-pdf-edit-pattern .pattern-edit-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pattern === currentPdfSideConfig.pattern);
  });

  // Edit modal grid / line distance spacing
  const curEditGridSize = currentPdfSideConfig.gridSize || 28;
  const editGridValLabel = document.getElementById('label-side-edit-gridsize-val');
  if (editGridValLabel) editGridValLabel.textContent = `${curEditGridSize} px`;
  const editGridSlider = document.getElementById('slider-pdf-side-edit-gridsize');
  if (editGridSlider) editGridSlider.value = curEditGridSize;
  document.querySelectorAll('.preset-edit-gridsize-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.gridsize, 10) === curEditGridSize);
  });
  const editGridWrap = document.getElementById('group-pdf-edit-grid-size-wrap');
  if (editGridWrap) {
    editGridWrap.style.display = currentPdfSideConfig.pattern === 'blank' ? 'none' : 'block';
  }
}

function initPdfSideCanvasConfigModalEvents() {
  const modal = document.getElementById('modal-pdf-side-canvas-config');
  if (!modal) return;

  const closeModal = () => modal.classList.remove('open');
  document.getElementById('btn-close-modal-side-canvas')?.addEventListener('click', closeModal);
  document.getElementById('btn-cancel-side-canvas-config')?.addEventListener('click', closeModal);

  document.querySelectorAll('.side-pos-card[data-pos-edit]').forEach(card => {
    card.addEventListener('click', () => {
      currentPdfSideConfig.position = card.dataset.posEdit;
      updatePdfSideConfigModalUI();
    });
  });

  document.querySelectorAll('.preset-edit-width-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPdfSideConfig.width = parseInt(btn.dataset.width, 10);
      updatePdfSideConfigModalUI();
    });
  });

  const slider = document.getElementById('slider-pdf-side-edit-width');
  if (slider) {
    slider.addEventListener('input', (e) => {
      currentPdfSideConfig.width = parseInt(e.target.value, 10);
      const widthValLabel = document.getElementById('label-side-edit-width-val');
      if (widthValLabel) widthValLabel.textContent = `${currentPdfSideConfig.width} px`;
      document.querySelectorAll('.preset-edit-width-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.width, 10) === currentPdfSideConfig.width);
      });
    });
  }

  // Side canvas color in edit modal
  document.querySelectorAll('.side-edit-color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPdfSideConfig.bgColor = btn.dataset.color;
      updatePdfSideConfigModalUI();
    });
  });

  const editColorInput = document.getElementById('input-pdf-side-edit-bg-color');
  if (editColorInput) {
    editColorInput.addEventListener('input', (e) => {
      currentPdfSideConfig.bgColor = e.target.value;
      updatePdfSideConfigModalUI();
    });
  }

  document.querySelectorAll('#group-pdf-edit-pattern .pattern-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPdfSideConfig.pattern = btn.dataset.pattern;
      updatePdfSideConfigModalUI();
    });
  });

  // Distancia / Tamaño de líneas o cuadrícula en modal de edición
  document.querySelectorAll('.preset-edit-gridsize-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPdfSideConfig.gridSize = parseInt(btn.dataset.gridsize, 10);
      updatePdfSideConfigModalUI();
    });
  });

  const editGridSlider = document.getElementById('slider-pdf-side-edit-gridsize');
  if (editGridSlider) {
    editGridSlider.addEventListener('input', (e) => {
      currentPdfSideConfig.gridSize = parseInt(e.target.value, 10);
      const editGridValLabel = document.getElementById('label-side-edit-gridsize-val');
      if (editGridValLabel) editGridValLabel.textContent = `${currentPdfSideConfig.gridSize} px`;
      document.querySelectorAll('.preset-edit-gridsize-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.gridsize, 10) === currentPdfSideConfig.gridSize);
      });
    });
  }

  document.getElementById('btn-save-side-canvas-config')?.addEventListener('click', async () => {
    if (state.activeItem && state.activeItem.type === 'pdf') {
      if (!state.activeItem.pdfData) state.activeItem.pdfData = {};
      state.activeItem.pdfData.sideCanvas = { ...currentPdfSideConfig };
      await dbSaveItem(state.activeItem);
      closeModal();
      await renderAllPdfPagesContinuous(state.activeItem);
      if (typeof showToast === 'function') {
        showToast('Lienzo lateral actualizado', 'success');
      }
    }
  });
}


