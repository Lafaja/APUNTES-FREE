// ===== 8. MOTOR DE DIBUJO, LAZO LIBRE, FORMAS Y RELLENO =====
function isPointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isStrokeEnclosedInPolygon(stroke, poly) {
  if (!poly || poly.length < 3) return false;
  if (stroke.isImage) {
    const ix = stroke.x || 0;
    const iy = stroke.y || 0;
    const iw = stroke.width || 100;
    const ih = stroke.height || 100;
    const corners = [
      { x: ix, y: iy },
      { x: ix + iw, y: iy },
      { x: ix + iw, y: iy + ih },
      { x: ix, y: iy + ih },
      { x: ix + iw / 2, y: iy + ih / 2 }
    ];
    return corners.some(c => isPointInPolygon(c, poly));
  }
  if (!stroke.points || stroke.points.length === 0) return false;

  // 1. Comprobar si cualquiera de los puntos muestreados está dentro del polígono
  for (let i = 0; i < stroke.points.length; i++) {
    if (isPointInPolygon(stroke.points[i], poly)) return true;
  }

  // 2. Comprobar puntos medios de segmentos para no perder trazos rápidos
  for (let i = 0; i < stroke.points.length - 1; i++) {
    const p1 = stroke.points[i];
    const p2 = stroke.points[i + 1];
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    if (isPointInPolygon(mid, poly)) return true;
  }

  return false;
}

function generateShapePoints(type, startPt, endPt) {
  const minX = Math.min(startPt.x, endPt.x);
  const maxX = Math.max(startPt.x, endPt.x);
  const minY = Math.min(startPt.y, endPt.y);
  const maxY = Math.max(startPt.y, endPt.y);
  const w = maxX - minX;
  const h = maxY - minY;
  const cx = minX + w / 2;
  const cy = minY + h / 2;

  if (type === 'rectangle') {
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
      { x: minX, y: minY }
    ];
  } else if (type === 'circle') {
    const pts = [];
    const rx = w / 2;
    const ry = h / 2;
    const steps = 36;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      pts.push({ x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) });
    }
    return pts;
  } else if (type === 'line') {
    return [{ x: startPt.x, y: startPt.y }, { x: endPt.x, y: endPt.y }];
  } else if (type === 'arrow') {
    const dx = endPt.x - startPt.x;
    const dy = endPt.y - startPt.y;
    const angle = Math.atan2(dy, dx);
    const headLen = Math.min(24, Math.hypot(dx, dy) * 0.35);
    return [
      { x: startPt.x, y: startPt.y },
      { x: endPt.x, y: endPt.y },
      { x: endPt.x - headLen * Math.cos(angle - Math.PI / 6), y: endPt.y - headLen * Math.sin(angle - Math.PI / 6) },
      { x: endPt.x, y: endPt.y },
      { x: endPt.x - headLen * Math.cos(angle + Math.PI / 6), y: endPt.y - headLen * Math.sin(angle + Math.PI / 6) }
    ];
  } else if (type === 'triangle') {
    return [
      { x: cx, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
      { x: cx, y: minY }
    ];
  } else if (type === 'star') {
    const pts = [];
    const numPoints = 5;
    const outerR = Math.min(w, h) / 2;
    const innerR = outerR * 0.45;
    for (let i = 0; i <= numPoints * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const theta = (i / (numPoints * 2)) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });
    }
    return pts;
  } else if (type === 'hexagon') {
    const pts = [];
    const r = Math.min(w, h) / 2;
    for (let i = 0; i <= 6; i++) {
      const theta = (i / 6) * Math.PI * 2;
      pts.push({ x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) });
    }
    return pts;
  }
  return [{ x: minX, y: minY }, { x: maxX, y: maxY }];
}

function syncImageStroke(s, img = null) {
  if (!s || !s.isImage) return;
  if (s.x === undefined) s.x = (s.points && s.points[0]) ? s.points[0].x : 0;
  if (s.y === undefined) s.y = (s.points && s.points[0]) ? s.points[0].y : 0;
  const imageEl = img || s.element || (s.src || s.dataUrl ? globalImageCache.get(s.src || s.dataUrl) : null);
  if (imageEl && imageEl.naturalWidth > 0 && imageEl.naturalHeight > 0) {
    if (!s.naturalWidth) s.naturalWidth = imageEl.naturalWidth;
    if (!s.naturalHeight) s.naturalHeight = imageEl.naturalHeight;
    if (!s.aspectRatio) s.aspectRatio = imageEl.naturalWidth / imageEl.naturalHeight;
    if (!s.width) s.width = imageEl.naturalWidth;
    if (!s.height) s.height = imageEl.naturalHeight;
    if (!s.element) s.element = imageEl;
  } else {
    if (!s.width) s.width = 200;
    if (!s.height) s.height = 150;
    if (!s.aspectRatio) s.aspectRatio = s.width / s.height;
  }
  s.points = [
    { x: s.x, y: s.y },
    { x: s.x + s.width, y: s.y },
    { x: s.x + s.width, y: s.y + s.height },
    { x: s.x, y: s.y + s.height }
  ];
}

const globalActiveTouches = new Map();

function setupDrawingEngine(canvas, selCanvas, getStrokes, onStrokesChange, onExtendCanvasHeight, scrollContainer, containerElement, getImages, onImagesChange, getTargetDoc, splitPane = null) {
  const abortController = new AbortController();
  const { signal } = abortController;

  const resolveTargetDoc = typeof getTargetDoc === 'function' ? getTargetDoc : () => (getTargetDoc || state.activeItem);

  const fetchImages = typeof getImages === 'function' ? getImages : () => {
    const d = resolveTargetDoc();
    return (d && d.images) || [];
  };

  const triggerImagesChange = typeof onImagesChange === 'function' ? onImagesChange : (newImgs, persist = true) => {
    const d = resolveTargetDoc();
    if (d) {
      d.images = newImgs;
      if (persist) dbSaveItem(d);
    }
  };

  function recordUndoSnapshot() {
    const d = resolveTargetDoc();
    if (d) {
      pushDocumentUndo(d);
    } else {
      state.notes.undoStack.push(JSON.parse(JSON.stringify(getStrokes())));
      state.notes.redoStack = [];
    }
  }

  function takeDragSnapshot() {
    return {
      strokes: JSON.parse(JSON.stringify(getStrokes())),
      images: fetchImages().map(img => {
        const { element, ...clean } = img;
        return JSON.parse(JSON.stringify(clean));
      })
    };
  }

  let isDrawing = false;
  let isSelecting = false;
  let isLassoing = false;
  let isDrawingShape = false;
  let isDraggingSelected = false;
  let dragHasMoved = false;
  let dragUndoSnapshot = null;
  let eraserModified = false;
  let currentStroke = null;
  let selStart = { x: 0, y: 0 };
  let lassoPoints = [];
  let shapeStart = { x: 0, y: 0 };
  let dragStart = { x: 0, y: 0 };
  const imageCache = globalImageCache;

  function deselectAll() {
    state.notes.selectedStrokeIds.clear();
    state.notes.selectedImageId = null;
    state.notes.selectionBounds = null;
    state.notes.isSelectionActive = false;
    state.notes.isDraggingSelection = false;
    isDraggingSelected = false;
    isResizingSelected = false;
    dragHasMoved = false;
    dragUndoSnapshot = null;
    const bar = document.getElementById('selection-actions-bar');
    if (bar) bar.style.display = 'none';
    clearSelectionOverlay();
  }

  // Control de Renderizado Asíncrono de alto rendimiento (requestAnimationFrame)
  let animFrameId = null;
  function requestRedraw() {
    if (animFrameId !== null) return;
    animFrameId = requestAnimationFrame(() => {
      animFrameId = null;
      redraw();
    });
  }
  function cancelPendingRedraw() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  // Viewport y Contenedor dinámico según el contexto activo (Apuntes, PDF, o Split View)
  function getActiveViewport() {
    if (scrollContainer && scrollContainer.isConnected) return scrollContainer;
    const closestVp = canvas.closest('.panel-scroll-container, .notes-viewport, .pdf-continuous-viewport, .split-pane-content');
    if (closestVp) return closestVp;
    if (state.currentView === 'pdf-editor') {
      return document.getElementById('pdf-continuous-viewport');
    }
    if (state.currentView === 'split-editor') {
      return (splitPane === 'right' ? document.getElementById('split-content-right') : document.getElementById('split-content-left')) || document.querySelector('.split-pane-content');
    }
    return document.getElementById('notes-viewport');
  }

  function getActiveContainer() {
    const stack = canvas.closest('.pdf-pages-stack');
    if (stack) return stack;
    const notesCont = canvas.closest('.notes-container');
    if (notesCont) return notesCont;
    if (containerElement && containerElement.isConnected) {
      const parentStack = containerElement.closest('.pdf-pages-stack, .notes-container');
      if (parentStack) return parentStack;
      if (!containerElement.classList.contains('pdf-page-wrapper')) {
        return containerElement;
      }
    }
    const closestCont = canvas.closest('.notes-container, .pdf-continuous-container, .pdf-pages-stack, .split-pane-content');
    if (closestCont) return closestCont;
    if (state.currentView === 'pdf-editor') {
      return document.getElementById('pdf-pages-stack');
    }
    return document.getElementById('notes-container');
  }

  function getCurrentDocZoom() {
    const cont = getActiveContainer();
    if (cont && cont.style.transform) {
      const m = cont.style.transform.match(/scale\(\s*([0-9.]+)\s*\)/);
      if (m && parseFloat(m[1])) {
        return parseFloat(m[1]);
      }
    }
    if (splitPane) {
      return (splitPane === 'left' ? state.split.leftScale : state.split.rightScale) || 1.0;
    }
    const targetDoc = resolveTargetDoc();
    if ((targetDoc && targetDoc.type === 'pdf') || state.currentView === 'pdf-editor') {
      return (state.pdf && state.pdf.scale) || (targetDoc && targetDoc.viewport && targetDoc.viewport.zoom) || 1.0;
    }
    return (state.notes && state.notes.scale) || (targetDoc && targetDoc.viewport && targetDoc.viewport.zoom) || 1.0;
  }

  // Rastreo de toques simultáneos para gestos de 2 dedos (Pinch-to-zoom y Paneo) y 1 dedo (deslizar con la mano)
  let isPinchingOrPanning = false;
  let initialPinchDist = 0;
  let initialPinchZoom = 1.0;
  let lastPinchCenter = { x: 0, y: 0 };
  let currentZoom = getCurrentDocZoom();

  let isSingleTouchPanning = false;
  let lastSingleTouchPos = { x: 0, y: 0 };
  let touchVelocityX = 0;
  let touchVelocityY = 0;
  let lastTouchTime = 0;
  let momentumAnimId = null;

  function stopMomentum() {
    if (momentumAnimId) {
      cancelAnimationFrame(momentumAnimId);
      momentumAnimId = null;
    }
  }

  function startMomentum() {
    stopMomentum();
    const vp = getActiveViewport();
    if (!vp) return;
    if (Math.abs(touchVelocityY) < 0.2 && Math.abs(touchVelocityX) < 0.2) return;

    let vx = touchVelocityX;
    let vy = touchVelocityY;

    function step() {
      vx *= 0.92;
      vy *= 0.92;

      vp.scrollLeft -= vx;
      vp.scrollTop -= vy;

      if (Math.abs(vx) > 0.15 || Math.abs(vy) > 0.15) {
        momentumAnimId = requestAnimationFrame(step);
      } else {
        momentumAnimId = null;
      }
    }
    momentumAnimId = requestAnimationFrame(step);
  }

  function setViewportZoom(newZoom, focalPoint = null) {
    const prevZoom = currentZoom > 0 ? currentZoom : 1.0;
    currentZoom = Math.min(3.5, Math.max(0.4, newZoom));
    const cont = getActiveContainer();
    const vp = getActiveViewport();
    if (cont) {
      if (focalPoint && vp) {
        const contRect = cont.getBoundingClientRect();
        const zoomRatio = currentZoom / prevZoom;
        const zoomDeltaX = (focalPoint.clientX - contRect.left) * (zoomRatio - 1);
        const zoomDeltaY = (focalPoint.clientY - contRect.top) * (zoomRatio - 1);
        cont.style.transformOrigin = '0 0';
        cont.style.transform = `scale(${currentZoom})`;
        vp.scrollLeft += zoomDeltaX;
        vp.scrollTop += zoomDeltaY;
      } else {
        cont.style.transformOrigin = '0 0';
        cont.style.transform = `scale(${currentZoom})`;
      }
    }
    if (splitPane) {
      if (typeof applyPaneZoom === 'function') {
        applyPaneZoom(splitPane, currentZoom, focalPoint);
      }
      return;
    }
    const targetDoc = resolveTargetDoc();
    if ((targetDoc && targetDoc.type === 'pdf') || state.currentView === 'pdf-editor') {
      if (state.pdf) state.pdf.scale = currentZoom;
      if (targetDoc) {
        if (!targetDoc.viewport) targetDoc.viewport = {};
        targetDoc.viewport.zoom = currentZoom;
      }
      const zoomText = document.getElementById('pdf-zoom-text');
      if (zoomText) zoomText.textContent = `${Math.round(currentZoom * 100)}%`;
    } else {
      if (state.notes) state.notes.scale = currentZoom;
      if (targetDoc) {
        if (!targetDoc.viewport) targetDoc.viewport = {};
        targetDoc.viewport.zoom = currentZoom;
      }
      const zoomText = document.getElementById('zoom-percentage');
      if (zoomText) zoomText.textContent = `${Math.round(currentZoom * 100)}%`;
    }
  }

  function getPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
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

  function redraw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const rawStrokes = [...getStrokes()];
    if (currentStroke) rawStrokes.push(currentStroke);

    // 1. ITERAR Y DIBUJAR TODAS LAS IMÁGENES DEL LIENZO ACTIVO
    const imagesToDraw = [...fetchImages(), ...rawStrokes.filter(s => s && s.isImage)];
    imagesToDraw.forEach(s => {
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
          requestRedraw();
          if (state.notes.selectedStrokeIds.has(s.id) || state.notes.selectedImageId === s.id) {
            updateSelectionBounds();
          }
        };
      }
    });

    // 3. ENCIMA DE LAS IMÁGENES, PINTAR LOS TRAZOS VECTORIALES DE LÁPIZ Y SUBRAYADOR
    const vectorStrokes = rawStrokes.filter(s => s && !s.isImage);
    vectorStrokes.forEach(s => {
      if (s.tool === 'eraser') return;
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

      // Trazos estándar
      if (brush === 'highlighter' || s.tool === 'highlighter') {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = s.size * 3.2;
      } else if (brush === 'pencil') {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = s.size;
      } else if (brush === 'fountain') {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 1;
        ctx.lineWidth = s.size * 1.25;
      } else {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 1;
        ctx.lineWidth = s.size;
      }

      const pts = s.points;
      if (pts.length === 1) {
        ctx.arc(pts[0].x, pts[0].y, s.size / 2, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
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
        // Trazado ultrasuave con curvas Bézier cuadráticas usando puntos medios consecutivos
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
    });

    // 4. FINALMENTE, SI HAY UNA IMAGEN O SELECCIÓN ACTIVA, DIBUJAR ENCIMA SU CAJA Y TIRADORES DE AJUSTE
    if (state.notes.selectionBounds && (state.notes.isSelectionActive || state.notes.selectedImageId)) {
      drawSelectionBounds(state.notes.selectionBounds);
    }
  }

  function clearSelectionOverlay() {
    if (!selCanvas) return;
    const ctx = selCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, selCanvas.width, selCanvas.height);
  }

  function drawSelectionBounds(bounds) {
    const targetCanvas = selCanvas || canvas;
    if (!targetCanvas || !bounds) return;
    const ctx = targetCanvas.getContext('2d');
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (targetCanvas === selCanvas) {
      ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    }
    ctx.scale(dpr, dpr);

    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(bounds.minX, bounds.minY, bounds.width, bounds.height);
    ctx.fillStyle = 'rgba(37, 99, 235, 0.06)';
    ctx.fillRect(bounds.minX, bounds.minY, bounds.width, bounds.height);

    // Tiradores circulares centrados exactamente en las 4 esquinas
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2.5;
    const handleRadius = 7;
    const handles = [
      { x: bounds.minX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.minY },
      { x: bounds.maxX, y: bounds.maxY },
      { x: bounds.minX, y: bounds.maxY }
    ];
    handles.forEach(h => {
      ctx.beginPath();
      ctx.arc(h.x, h.y, handleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    ctx.restore();
  }

  function getCornerHandle(pt, bounds) {
    if (!bounds) return null;
    const threshold = 22;
    const bx1 = bounds.minX;
    const by1 = bounds.minY;
    const bx2 = bounds.maxX;
    const by2 = bounds.maxY;

    if (Math.hypot(pt.x - bx2, pt.y - by2) <= threshold) return 'br';
    if (Math.hypot(pt.x - bx1, pt.y - by2) <= threshold) return 'bl';
    if (Math.hypot(pt.x - bx2, pt.y - by1) <= threshold) return 'tr';
    if (Math.hypot(pt.x - bx1, pt.y - by1) <= threshold) return 'tl';
    return null;
  }

  let isResizingSelected = false;
  let activeResizeCorner = null;
  let initialBounds = null;
  let initialStrokesState = null;

  function updateSelectionBounds() {
    const allSelectable = [...getStrokes(), ...fetchImages()];
    const selected = allSelectable.filter(s => state.notes.selectedStrokeIds.has(s.id));
    if (selected.length === 0) {
      deselectAll();
      return;
    }

    const selectedImg = selected.find(s => s.isImage);
    state.notes.selectedImageId = selectedImg ? selectedImg.id : null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selected.forEach(s => {
      if (s.isImage) {
        const cachedImg = s.element || (s.src || s.dataUrl ? globalImageCache.get(s.src || s.dataUrl) : null);
        syncImageStroke(s, cachedImg);
        const ix = s.x !== undefined ? s.x : 0;
        const iy = s.y !== undefined ? s.y : 0;
        const iw = s.width || 100;
        const ih = s.height || 100;
        if (ix < minX) minX = ix;
        if (ix + iw > maxX) maxX = ix + iw;
        if (iy < minY) minY = iy;
        if (iy + ih > maxY) maxY = iy + ih;
      } else if (s.points && s.points.length > 0) {
        s.points.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        });
      }
    });

    const w = maxX - minX;
    const h = maxY - minY;
    state.notes.selectionBounds = {
      minX, minY, maxX, maxY,
      width: w,
      height: h
    };
    state.notes.isSelectionActive = true;

    const dimBadge = document.getElementById('selection-dim-badge');
    if (dimBadge) {
      dimBadge.textContent = `📏 ${formatPxToUnit(w)} × ${formatPxToUnit(h)}`;
    }

    drawSelectionBounds(state.notes.selectionBounds);
    document.getElementById('selection-actions-bar').style.display = 'flex';

    // Botón de Recortar Foto en la barra de selección
    const cropBtn = document.getElementById('btn-sel-crop');
    if (cropBtn) {
      if (selected.length === 1 && selected[0].isImage) {
        cropBtn.style.display = 'inline-flex';
        cropBtn.onclick = () => {
          openCropModalForImage(selected[0]);
        };
      } else {
        cropBtn.style.display = 'none';
      }
    }
  }

  let lastEraserPt = null;

  function distSqToSegment(p, v, w) {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (p.x - (v.x + t * (w.x - v.x)))**2 + (p.y - (v.y + t * (w.y - v.y)))**2;
  }

  function drawEraserCursor(pt, radius) {
    if (!selCanvas) return;
    const ctx = selCanvas.getContext('2d');
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, selCanvas.width, selCanvas.height);
    ctx.scale(dpr, dpr);

    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
    ctx.fill();
    ctx.restore();
  }

  function performErase(startPt, endPt) {
    const eraserSize = state.notes.eraserSize || 20;
    const radius = Math.max(eraserSize / 2, 4);
    const radiusSq = radius * radius;
    const mode = state.notes.eraserMode || 'stroke';
    const strokes = getStrokes();
    let modified = false;

    if (mode === 'stroke') {
      const remaining = strokes.filter(s => {
        if (s.isImage) {
          const ix = s.x !== undefined ? s.x : 0;
          const iy = s.y !== undefined ? s.y : 0;
          const iw = s.width || 100;
          const ih = s.height || 100;
          const hit = (endPt.x >= ix - radius && endPt.x <= ix + iw + radius && endPt.y >= iy - radius && endPt.y <= iy + ih + radius);
          if (hit) {
            modified = true;
            state.notes.selectedStrokeIds.delete(s.id);
          }
          return !hit;
        }
        if (s.points) {
          const hit = s.points.some(p => distSqToSegment(p, startPt, endPt) <= radiusSq);
          if (hit) {
            modified = true;
            state.notes.selectedStrokeIds.delete(s.id);
          }
          return !hit;
        }
        return true;
      });

      if (modified) {
        eraserModified = true;
        onStrokesChange(remaining, false);
        cancelPendingRedraw();
        redraw();
        if (state.notes.selectedStrokeIds.size > 0) {
          updateSelectionBounds();
        } else {
          clearSelectionOverlay();
        }
      }
    } else {
      // MODO PRECISIÓN / ÁREA (Corta y segmenta vectorialmente con precisión destructiva)
      const newStrokesList = [];

      for (let i = 0; i < strokes.length; i++) {
        const s = strokes[i];
        if (s.isImage) {
          const ix = s.x !== undefined ? s.x : 0;
          const iy = s.y !== undefined ? s.y : 0;
          const iw = s.width || 100;
          const ih = s.height || 100;
          const hit = (endPt.x >= ix - radius && endPt.x <= ix + iw + radius && endPt.y >= iy - radius && endPt.y <= iy + ih + radius);
          if (hit) {
            modified = true;
            state.notes.selectedStrokeIds.delete(s.id);
            continue;
          }
          newStrokesList.push(s);
          continue;
        }

        if (s.isShape || s.isFill) {
          const hit = s.points && s.points.some(p => distSqToSegment(p, startPt, endPt) <= radiusSq);
          if (hit) {
            modified = true;
            state.notes.selectedStrokeIds.delete(s.id);
            continue;
          }
          newStrokesList.push(s);
          continue;
        }

        if (s.points && s.points.length > 0) {
          const runs = [];
          let currentRun = [];
          let strokeWasCut = false;

          for (let j = 0; j < s.points.length; j++) {
            const p = s.points[j];
            const isInside = distSqToSegment(p, startPt, endPt) <= radiusSq;
            if (isInside) {
              strokeWasCut = true;
              if (currentRun.length > 0) {
                runs.push(currentRun);
                currentRun = [];
              }
            } else {
              currentRun.push(p);
            }
          }
          if (currentRun.length > 0) {
            runs.push(currentRun);
          }

          if (strokeWasCut) {
            modified = true;
            runs.forEach((pts, runIdx) => {
              if (pts.length > 0) {
                newStrokesList.push({
                  id: runIdx === 0 ? s.id : `s_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                  tool: s.tool,
                  brushType: s.brushType,
                  color: s.color,
                  size: s.size,
                  opacity: s.opacity,
                  points: pts
                });
              }
            });
          } else {
            newStrokesList.push(s);
          }
        } else {
          newStrokesList.push(s);
        }
      }

      if (modified) {
        eraserModified = true;
        onStrokesChange(newStrokesList, false);
        cancelPendingRedraw();
        redraw();
        if (state.notes.selectedStrokeIds.size > 0) {
          updateSelectionBounds();
        } else {
          clearSelectionOverlay();
        }
      }
    }

    drawEraserCursor(endPt, radius);
  }

  // Pointer Down
  canvas.addEventListener('pointerdown', (e) => {
    // 1. RASTREO DE PUNTOS TÁCTILES
    if (e.pointerType === 'touch') {
      globalActiveTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // 2. DETECCIÓN DE DOS DEDOS: BLOQUEAR TRAZO
    if (globalActiveTouches.size >= 2) {
      if (isDrawing || currentStroke) {
        isDrawing = false;
        currentStroke = null;
        cancelPendingRedraw();
        redraw();
      }
      if (isLassoing) {
        isLassoing = false;
        clearSelectionOverlay();
      }
      if (isSelecting) {
        isSelecting = false;
        clearSelectionOverlay();
      }
      if (isDrawingShape) {
        isDrawingShape = false;
        clearSelectionOverlay();
      }
      return;
    }

    // 3. MODO DESPLAZAMIENTO TÁCTIL (SCROLL CON EL DEDO / PAN / PALM REJECTION):
    const isTouchInput = e.pointerType === 'touch';
    const isStylusOnlyMode = state.settings ? state.settings.stylusOnly !== false : true;
    const isPanTool = (state.notes && state.notes.tool === 'pan');

    stopMomentum();

    // Sincronizar foco y panel activo según el panel asignado o documento del canvas
    if (state.currentView === 'split-editor') {
      if (splitPane === 'left' || splitPane === 'right') {
        if (state.split.activePane !== splitPane) {
          setActiveSplitPane(splitPane);
        }
      } else {
        const targetDoc = resolveTargetDoc();
        if (targetDoc) {
          if (state.split.leftDoc && state.split.leftDoc.id === targetDoc.id && state.split.activePane !== 'left') {
            setActiveSplitPane('left');
          } else if (state.split.rightDoc && state.split.rightDoc.id === targetDoc.id && state.split.activePane !== 'right') {
            setActiveSplitPane('right');
          }
        }
      }
    } else {
      const targetDoc = resolveTargetDoc();
      if (targetDoc) {
        state.activeItem = targetDoc;
      }
    }

    if ((isStylusOnlyMode && isTouchInput) || isPanTool) {
      // Dejar que attachViewportTouchScroller gestione el desplazamiento y zoom táctil en el viewport
      return;
    }

    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    if (state.notes.tool === 'pan') return;

    e.preventDefault();

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
    const pt = getPoint(e);

    // MODO SELECCIÓN LAZO
    if (state.notes.tool === 'lasso') {
      const b = state.notes.selectionBounds;
      const corner = getCornerHandle(pt, b);

      if (state.notes.isSelectionActive && b && state.notes.selectedStrokeIds.size > 0) {
        if (corner) {
          isResizingSelected = true;
          activeResizeCorner = corner;
          dragStart = pt;
          initialBounds = Object.assign({}, b);
          const allItems = [...getStrokes(), ...fetchImages()];
          initialStrokesState = JSON.parse(JSON.stringify(allItems.filter(s => state.notes.selectedStrokeIds.has(s.id))));
          recordUndoSnapshot();
          return;
        }

        const margin = 14;
        const isInside = (pt.x >= b.minX - margin && pt.x <= b.maxX + margin && pt.y >= b.minY - margin && pt.y <= b.maxY + margin);

        if (isInside) {
          isDraggingSelected = true;
          state.notes.isDraggingSelection = true;
          dragStart = pt;
          dragHasMoved = false;
          dragUndoSnapshot = takeDragSnapshot();
          return;
        } else {
          deselectAll();
          isLassoing = true;
          lassoPoints = [pt];
          return;
        }
      }

      // Si isSelectionActive === false: comprobar si se tocó directamente una imagen existente
      const allImages = [...fetchImages(), ...getStrokes().filter(s => s && s.isImage)];
      const hitImage = allImages.slice().reverse().find(s => {
        const cached = s.element || (s.src || s.dataUrl ? globalImageCache.get(s.src || s.dataUrl) : null);
        syncImageStroke(s, cached);
        return pt.x >= s.x && pt.x <= s.x + s.width && pt.y >= s.y && pt.y <= s.y + s.height;
      });

      if (hitImage) {
        state.notes.selectedStrokeIds.clear();
        state.notes.selectedStrokeIds.add(hitImage.id);
        state.notes.selectedImageId = hitImage.id;
        state.notes.isSelectionActive = true;
        updateSelectionBounds();
        isDraggingSelected = true;
        state.notes.isDraggingSelection = true;
        dragStart = pt;
        dragHasMoved = false;
        dragUndoSnapshot = takeDragSnapshot();
        return;
      }

      deselectAll();
      isLassoing = true;
      lassoPoints = [pt];
      return;
    }

    // MODO SELECCIÓN RECTANGULAR / MOVER
    if (state.notes.tool === 'select') {
      const b = state.notes.selectionBounds;
      const corner = getCornerHandle(pt, b);

      if (state.notes.isSelectionActive && b && state.notes.selectedStrokeIds.size > 0) {
        if (corner) {
          isResizingSelected = true;
          activeResizeCorner = corner;
          dragStart = pt;
          initialBounds = Object.assign({}, b);
          const allItems = [...getStrokes(), ...fetchImages()];
          initialStrokesState = JSON.parse(JSON.stringify(allItems.filter(s => state.notes.selectedStrokeIds.has(s.id))));
          recordUndoSnapshot();
          return;
        }

        const margin = 14;
        const isInside = (pt.x >= b.minX - margin && pt.x <= b.maxX + margin && pt.y >= b.minY - margin && pt.y <= b.maxY + margin);

        if (isInside) {
          isDraggingSelected = true;
          state.notes.isDraggingSelection = true;
          dragStart = pt;
          dragHasMoved = false;
          dragUndoSnapshot = takeDragSnapshot();
          return;
        } else {
          deselectAll();
        }
      }

      const allImages = [...fetchImages(), ...getStrokes().filter(s => s && s.isImage)];
      const hitImage = allImages.slice().reverse().find(s => {
        const cached = s.element || (s.src || s.dataUrl ? globalImageCache.get(s.src || s.dataUrl) : null);
        syncImageStroke(s, cached);
        return pt.x >= s.x && pt.x <= s.x + s.width && pt.y >= s.y && pt.y <= s.y + s.height;
      });

      if (hitImage) {
        state.notes.selectedStrokeIds.clear();
        state.notes.selectedStrokeIds.add(hitImage.id);
        state.notes.selectedImageId = hitImage.id;
        state.notes.isSelectionActive = true;
        updateSelectionBounds();
        isDraggingSelected = true;
        state.notes.isDraggingSelection = true;
        dragStart = pt;
        dragHasMoved = false;
        dragUndoSnapshot = takeDragSnapshot();
        return;
      }

      deselectAll();
      isSelecting = true;
      selStart = pt;
      return;
    }

    // MODO FORMAS GEOMÉTRICAS
    if (state.notes.tool === 'shapes') {
      isDrawingShape = true;
      shapeStart = pt;
      return;
    }

    // MODO BOTE DE RELLENO
    if (state.notes.tool === 'fill') {
      recordUndoSnapshot();

      // Comprobar si tocó dentro de una forma existente
      let filledShape = false;
      const strokes = getStrokes();
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i];
        if (s.isShape && s.points && s.points.length > 2) {
          if (isPointInPolygon(pt, s.points)) {
            s.fillMode = state.notes.shapeFill === 'none' ? 'solid' : state.notes.shapeFill;
            s.fillColor = state.notes.color;
            s.fillOpacity = state.notes.fillOpacity;
            filledShape = true;
            break;
          }
        }
      }

      if (!filledShape) {
        const fillStroke = {
          id: `s_fill_${Date.now()}`,
          isFill: true,
          fillColor: state.notes.color,
          fillOpacity: state.notes.fillOpacity || 1.0,
          points: generateShapePoints('circle', { x: pt.x - 40, y: pt.y - 40 }, { x: pt.x + 40, y: pt.y + 40 })
        };
        strokes.unshift(fillStroke);
      }

      onStrokesChange(strokes);
      cancelPendingRedraw();
      redraw();
      return;
    }

    // MODO BORRADOR
    if (state.notes.tool === 'eraser') {
      isDrawing = true;
      eraserModified = false;
      recordUndoSnapshot();
      lastEraserPt = pt;
      performErase(pt, pt);
      return;
    }

    // MODO DIBUJO ESTÁNDAR
    isDrawing = true;
    recordUndoSnapshot();

    currentStroke = {
      id: `s_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      tool: state.notes.tool,
      brushType: state.notes.brushType || 'pen',
      color: state.notes.color,
      size: state.notes.size,
      opacity: state.notes.opacity || 1.0,
      points: [pt]
    };

    redraw();
  }, { signal });

  // Pointer Move
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && globalActiveTouches.has(e.pointerId)) {
      globalActiveTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (globalActiveTouches.size >= 2) {
      if (isDrawing || currentStroke) {
        isDrawing = false;
        currentStroke = null;
        cancelPendingRedraw();
        redraw();
      }
      return;
    }

    const isStylusOnlyMode = state.settings ? state.settings.stylusOnly !== false : true;
    if ((isStylusOnlyMode && e.pointerType === 'touch') || (state.notes && state.notes.tool === 'pan')) {
      return;
    }

    e.preventDefault();

    // Capturar eventos coalescentes de alta resolución para fidelidad caligráfica
    const coalescedList = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : [];
    const moveEvents = coalescedList.length > 0 ? coalescedList : [e];
    const pt = getPoint(e);

    // Redimensionar Trazos / Imágenes con tirador de esquina (Proporcional manteniendo aspect ratio en imágenes)
    if (isResizingSelected && initialBounds && initialStrokesState) {
      const initW = Math.max(20, initialBounds.width);
      const initH = Math.max(20, initialBounds.height);
      const strokes = getStrokes();
      const images = fetchImages();

      initialStrokesState.forEach(orig => {
        let target = orig.isImage ? images.find(img => img.id === orig.id) : strokes.find(s => s.id === orig.id);
        if (!target) target = [...strokes, ...images].find(x => x.id === orig.id);
        if (!target) return;

        if (target.isImage) {
          // Mantener el aspect ratio original calculado con naturalWidth/naturalHeight
          const natW = target.naturalWidth || (target.element && target.element.naturalWidth) || orig.naturalWidth || orig.width || initW;
          const natH = target.naturalHeight || (target.element && target.element.naturalHeight) || orig.naturalHeight || orig.height || initH;
          const aspect = (natW > 0 && natH > 0) ? (natW / natH) : 1;

          let w = orig.width || initW;
          let h = orig.height || initH;
          let newX = orig.x !== undefined ? orig.x : initialBounds.minX;
          let newY = orig.y !== undefined ? orig.y : initialBounds.minY;

          if (activeResizeCorner === 'br') {
            const rawW = Math.max(30, pt.x - initialBounds.minX);
            const rawH = Math.max(30, pt.y - initialBounds.minY);
            if (rawW / aspect >= rawH) {
              w = rawW;
              h = Math.round(w / aspect);
            } else {
              h = rawH;
              w = Math.round(h * aspect);
            }
            newX = initialBounds.minX;
            newY = initialBounds.minY;
          } else if (activeResizeCorner === 'tr') {
            const rawW = Math.max(30, pt.x - initialBounds.minX);
            const rawH = Math.max(30, initialBounds.maxY - pt.y);
            if (rawW / aspect >= rawH) {
              w = rawW;
              h = Math.round(w / aspect);
            } else {
              h = rawH;
              w = Math.round(h * aspect);
            }
            newX = initialBounds.minX;
            newY = initialBounds.maxY - h;
          } else if (activeResizeCorner === 'bl') {
            const rawW = Math.max(30, initialBounds.maxX - pt.x);
            const rawH = Math.max(30, pt.y - initialBounds.minY);
            if (rawW / aspect >= rawH) {
              w = rawW;
              h = Math.round(w / aspect);
            } else {
              h = rawH;
              w = Math.round(h * aspect);
            }
            newX = initialBounds.maxX - w;
            newY = initialBounds.minY;
          } else if (activeResizeCorner === 'tl') {
            const rawW = Math.max(30, initialBounds.maxX - pt.x);
            const rawH = Math.max(30, initialBounds.maxY - pt.y);
            if (rawW / aspect >= rawH) {
              w = rawW;
              h = Math.round(w / aspect);
            } else {
              h = rawH;
              w = Math.round(h * aspect);
            }
            newX = initialBounds.maxX - w;
            newY = initialBounds.maxY - h;
          }

          target.width = Math.max(25, Math.round(w));
          target.height = Math.max(25, Math.round(h));
          target.x = Math.round(newX);
          target.y = Math.round(newY);
          syncImageStroke(target, target.element);
        } else if (target.points && orig.points) {
          let newW = initW;
          let newH = initH;
          if (activeResizeCorner === 'br') {
            newW = Math.max(30, pt.x - initialBounds.minX);
            newH = Math.max(30, pt.y - initialBounds.minY);
          } else if (activeResizeCorner === 'bl') {
            newW = Math.max(30, initialBounds.maxX - pt.x);
            newH = Math.max(30, pt.y - initialBounds.minY);
          } else if (activeResizeCorner === 'tr') {
            newW = Math.max(30, pt.x - initialBounds.minX);
            newH = Math.max(30, initialBounds.maxY - pt.y);
          } else if (activeResizeCorner === 'tl') {
            newW = Math.max(30, initialBounds.maxX - pt.x);
            newH = Math.max(30, initialBounds.maxY - pt.y);
          }
          const scaleX = newW / initW;
          const scaleY = newH / initH;
          const originX = (activeResizeCorner === 'bl' || activeResizeCorner === 'tl') ? initialBounds.maxX : initialBounds.minX;
          const originY = (activeResizeCorner === 'tr' || activeResizeCorner === 'tl') ? initialBounds.maxY : initialBounds.minY;
          target.points = orig.points.map(p => ({
            x: originX + (p.x - originX) * (activeResizeCorner === 'bl' || activeResizeCorner === 'tl' ? -scaleX : scaleX),
            y: originY + (p.y - originY) * (activeResizeCorner === 'tr' || activeResizeCorner === 'tl' ? -scaleY : scaleY),
            pressure: p.pressure
          }));
        }
      });

      onStrokesChange(strokes, false);
      triggerImagesChange(images, false);
      cancelPendingRedraw();
      redraw();
      updateSelectionBounds();
      return;
    }

    // Arrastrar Trazos e Imágenes Seleccionados (Mover en tiempo real sin reiniciar su tamaño)
    if (isDraggingSelected && state.notes.selectionBounds) {
      const dx = pt.x - dragStart.x;
      const dy = pt.y - dragStart.y;
      dragStart = pt;

      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        dragHasMoved = true;
      }

      const strokes = getStrokes();
      let sModified = false;
      strokes.forEach(s => {
        if (state.notes.selectedStrokeIds.has(s.id)) {
          sModified = true;
          if (s.isImage) {
            s.x = (s.x || 0) + dx;
            s.y = (s.y || 0) + dy;
            syncImageStroke(s, s.element);
          } else if (s.points) {
            s.points.forEach(p => { p.x += dx; p.y += dy; });
          }
        }
      });

      const images = fetchImages();
      let imgModified = false;
      images.forEach(s => {
        if (state.notes.selectedStrokeIds.has(s.id) || state.notes.selectedImageId === s.id) {
          imgModified = true;
          s.x = (s.x || 0) + dx;
          s.y = (s.y || 0) + dy;
          syncImageStroke(s, s.element);
        }
      });

      if (sModified) onStrokesChange(strokes, false);
      if (imgModified) triggerImagesChange(images, false);
      cancelPendingRedraw();
      redraw();
      updateSelectionBounds();
      return;
    }

    // Trazar Lazo Libre (Punto por punto de alta resolución)
    if (isLassoing && selCanvas) {
      for (let i = 0; i < moveEvents.length; i++) {
        const lpt = getPoint(moveEvents[i]);
        const last = lassoPoints[lassoPoints.length - 1];
        if (!last || Math.hypot(lpt.x - last.x, lpt.y - last.y) >= 1) {
          lassoPoints.push(lpt);
        }
      }

      const ctx = selCanvas.getContext('2d');
      const dpr = Math.max(window.devicePixelRatio || 1, 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, selCanvas.width, selCanvas.height);
      ctx.scale(dpr, dpr);

      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      }
      // Línea de cierre visual hacia el punto de inicio
      ctx.lineTo(lassoPoints[0].x, lassoPoints[0].y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
      ctx.fill();
      ctx.restore();
      return;
    }

    // Trazar Caja de Selección Rectangular
    if (isSelecting && selCanvas) {
      const minX = Math.min(selStart.x, pt.x);
      const minY = Math.min(selStart.y, pt.y);
      const w = Math.abs(pt.x - selStart.x);
      const h = Math.abs(pt.y - selStart.y);

      drawSelectionBounds({ minX, minY, width: w, height: h });
      return;
    }

    // Previsualización de Forma Geométrica
    if (isDrawingShape && selCanvas) {
      const ctx = selCanvas.getContext('2d');
      const dpr = Math.max(window.devicePixelRatio || 1, 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, selCanvas.width, selCanvas.height);
      ctx.scale(dpr, dpr);

      const pts = generateShapePoints(state.notes.shapeType || 'rectangle', shapeStart, pt);
      ctx.save();
      ctx.strokeStyle = state.notes.color;
      ctx.lineWidth = state.notes.shapeSize || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (state.notes.shapeFill === 'semi' || state.notes.shapeFill === 'solid') {
        ctx.fillStyle = state.notes.color;
        ctx.globalAlpha = state.notes.shapeFill === 'semi' ? 0.35 : 1.0;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fill();
      }

      ctx.beginPath();
      ctx.globalAlpha = 1;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Borrar (con soporte para precisión y trazo entero continuo)
    if (isDrawing && state.notes.tool === 'eraser') {
      const prevPt = lastEraserPt || pt;
      performErase(prevPt, pt);
      lastEraserPt = pt;
      return;
    }

    // Dibujar trazo con fidelidad de muestras coalescentes y refresco ultra-fluido en RAF
    if (isDrawing && currentStroke) {
      let added = false;
      for (let i = 0; i < moveEvents.length; i++) {
        const samplePt = getPoint(moveEvents[i]);
        const lastPt = currentStroke.points[currentStroke.points.length - 1];
        if (!lastPt || Math.hypot(samplePt.x - lastPt.x, samplePt.y - lastPt.y) >= 0.5) {
          currentStroke.points.push(samplePt);
          added = true;
        }
      }
      if (added) {
        requestRedraw();
      }
    }
  });

  // Pointer Up
  const stop = (e) => {
    if (e && e.pointerType === 'touch') {
      globalActiveTouches.delete(e.pointerId);
    }
    try {
      if (e && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
    } catch (err) {}
    if (state.settings && state.settings.stylusOnly !== false && e && e.pointerType === 'touch') return;

    if (state.notes.tool === 'eraser') {
      isDrawing = false;
      lastEraserPt = null;
      clearSelectionOverlay();
      if (eraserModified) {
        eraserModified = false;
        onStrokesChange(getStrokes(), true);
      }
      return;
    }

    if (isResizingSelected) {
      isResizingSelected = false;
      activeResizeCorner = null;
      initialBounds = null;
      initialStrokesState = null;
      onStrokesChange(getStrokes(), true);
      triggerImagesChange(fetchImages(), true);
      return;
    }

    if (isDraggingSelected) {
      isDraggingSelected = false;
      state.notes.isDraggingSelection = false;
      if (dragHasMoved) {
        if (dragUndoSnapshot) {
          if (state.activeItem) {
            if (!Array.isArray(state.activeItem.undoStack)) state.activeItem.undoStack = [];
            state.activeItem.undoStack.push(dragUndoSnapshot);
            if (state.activeItem.undoStack.length > 50) state.activeItem.undoStack.shift();
            state.activeItem.redoStack = [];
            if (state.notes) {
              state.notes.undoStack = state.activeItem.undoStack;
              state.notes.redoStack = state.activeItem.redoStack;
            }
          } else {
            state.notes.undoStack.push(dragUndoSnapshot);
            state.notes.redoStack = [];
          }
          dragUndoSnapshot = null;
        }
        onStrokesChange(getStrokes(), true);
        triggerImagesChange(fetchImages(), true);
      } else {
        dragUndoSnapshot = null;
      }
      return;
    }

    // Fin de Lazo Libre con detección precisa Point-in-Polygon (Ray Casting)
    if (isLassoing) {
      isLassoing = false;
      if (lassoPoints.length > 2) {
        state.notes.selectedStrokeIds.clear();
        const allItems = [...getStrokes(), ...fetchImages()];
        allItems.forEach(s => {
          if (isStrokeEnclosedInPolygon(s, lassoPoints)) {
            state.notes.selectedStrokeIds.add(s.id);
          }
        });
        if (state.notes.selectedStrokeIds.size > 0) {
          updateSelectionBounds();
        } else {
          deselectAll();
        }
      } else {
        deselectAll();
      }
      return;
    }

    // Fin de Selección Rectangular
    if (isSelecting) {
      isSelecting = false;
      const pt = getPoint(e);
      const minX = Math.min(selStart.x, pt.x);
      const maxX = Math.max(selStart.x, pt.x);
      const minY = Math.min(selStart.y, pt.y);
      const maxY = Math.max(selStart.y, pt.y);

      state.notes.selectedStrokeIds.clear();
      const allItems = [...getStrokes(), ...fetchImages()];
      allItems.forEach(s => {
        const inBox = (s.points && s.points.some(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)) ||
          (s.isImage && (
            (s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY) ||
            ((s.x + (s.width || 0)) >= minX && s.x <= maxX && (s.y + (s.height || 0)) >= minY && s.y <= maxY)
          ));
        if (inBox) state.notes.selectedStrokeIds.add(s.id);
      });

      if (state.notes.selectedStrokeIds.size > 0) {
        updateSelectionBounds();
      } else {
        deselectAll();
      }
      return;
    }

    // Fin de Formas Geométricas
    if (isDrawingShape) {
      isDrawingShape = false;
      clearSelectionOverlay();
      const pt = getPoint(e);
      const pts = generateShapePoints(state.notes.shapeType || 'rectangle', shapeStart, pt);

      recordUndoSnapshot();

      const newShapeStroke = {
        id: `shape_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        isShape: true,
        shapeType: state.notes.shapeType || 'rectangle',
        fillMode: state.notes.shapeFill || 'none',
        fillColor: state.notes.color,
        color: state.notes.color,
        size: state.notes.shapeSize || 3,
        points: pts
      };

      const updated = [...getStrokes(), newShapeStroke];
      onStrokesChange(updated);
      cancelPendingRedraw();
      redraw();
      return;
    }

    if (isDrawing) {
      isDrawing = false;
      if (currentStroke && currentStroke.points.length > 0) {
        let maxStrokeY = 0;
        for (let i = 0; i < currentStroke.points.length; i++) {
          if (currentStroke.points[i].y > maxStrokeY) maxStrokeY = currentStroke.points[i].y;
        }
        const updated = [...getStrokes(), currentStroke];
        currentStroke = null;
        onStrokesChange(updated, true);
        if (onExtendCanvasHeight && maxStrokeY > 0) {
          onExtendCanvasHeight(maxStrokeY);
        }
      }
      cancelPendingRedraw();
      redraw();
    }
  };

  canvas.addEventListener('pointerup', stop, { signal });
  canvas.addEventListener('pointercancel', stop, { signal });
  window.addEventListener('pointerup', stop, { signal });
  window.addEventListener('pointercancel', stop, { signal });

  // Soporte para scroll con rueda de ratón / touchpad con zoom centrado en cursor
  canvas.addEventListener('wheel', (e) => {
    const vp = getActiveViewport();
    if (!vp) return;
    if (e.ctrlKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      setViewportZoom(currentZoom * factor, { clientX: e.clientX, clientY: e.clientY });
    } else {
      vp.scrollTop += e.deltaY;
      vp.scrollLeft += e.deltaX;
    }
  }, { passive: false, signal });

  function destroy() {
    stopMomentum();
    cancelPendingRedraw();
    deselectAll();
    abortController.abort();
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (selCanvas) {
      const sctx = selCanvas.getContext('2d');
      if (sctx) {
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.clearRect(0, 0, selCanvas.width, selCanvas.height);
      }
    }
  }

  return {
    redraw,
    clearSelectionOverlay,
    updateSelectionBounds,
    deselectAll,
    destroy
  };
}

// ===== GESTOR GLOBAL DE DESPLAZAMIENTO TÁCTIL EN VIEWPORTS (MANO / DEDO) =====
function attachViewportTouchScroller(viewportEl) {
  if (!viewportEl || viewportEl._touchScrollerAttached) return;
  viewportEl._touchScrollerAttached = true;

  let isTouchPanning = false;
  let lastX = 0, lastY = 0;
  let vx = 0, vy = 0;
  let lastT = 0;
  let animId = null;
  let initDist = 0;
  let initZoom = 1.0;
  let lastZoom = 1.0;
  let lastCenter = { x: 0, y: 0 };

  const stopVpMomentum = () => {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  };

  const startVpMomentum = () => {
    stopVpMomentum();
    if (Math.abs(vy) < 0.2 && Math.abs(vx) < 0.2) return;
    let curVx = vx, curVy = vy;
    function step() {
      curVx *= 0.92;
      curVy *= 0.92;
      viewportEl.scrollLeft -= curVx;
      viewportEl.scrollTop -= curVy;
      if (Math.abs(curVx) > 0.15 || Math.abs(curVy) > 0.15) {
        animId = requestAnimationFrame(step);
      } else {
        animId = null;
      }
    }
    animId = requestAnimationFrame(step);
  };

  viewportEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      globalActiveTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    stopVpMomentum();

    if (globalActiveTouches.size >= 2) {
      isTouchPanning = false;
      const touches = Array.from(globalActiveTouches.values());
      initDist = Math.hypot(touches[1].x - touches[0].x, touches[1].y - touches[0].y) || 1;
      const cont = viewportEl.querySelector('.pdf-pages-stack, .notes-container, .split-pane-content');
      if (cont && cont.style.transform) {
        const m = cont.style.transform.match(/scale\(\s*([0-9.]+)\s*\)/);
        initZoom = m && parseFloat(m[1]) ? parseFloat(m[1]) : ((state.currentView === 'pdf-editor' ? (state.pdf && state.pdf.scale) : (state.notes && state.notes.scale)) || 1.0);
      } else {
        initZoom = (state.currentView === 'pdf-editor' ? (state.pdf && state.pdf.scale) : (state.notes && state.notes.scale)) || 1.0;
      }
      lastZoom = initZoom;
      lastCenter = { x: (touches[0].x + touches[1].x) / 2, y: (touches[0].y + touches[1].y) / 2 };
      return;
    }

    if (e.target.tagName === 'CANVAS') {
      return;
    }

    isTouchPanning = true;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    vx = 0;
    vy = 0;
  }, { passive: true });

  viewportEl.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && globalActiveTouches.has(e.pointerId)) {
      globalActiveTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (globalActiveTouches.size >= 2) {
      isTouchPanning = false;
      const touches = Array.from(globalActiveTouches.values());
      const dist = Math.hypot(touches[1].x - touches[0].x, touches[1].y - touches[0].y);
      const center = { x: (touches[0].x + touches[1].x) / 2, y: (touches[0].y + touches[1].y) / 2 };

      const panDx = center.x - lastCenter.x;
      const panDy = center.y - lastCenter.y;

      let targetZoom = lastZoom;
      if (initDist > 10 && dist > 10) {
        const factor = dist / initDist;
        targetZoom = Math.min(3.5, Math.max(0.4, initZoom * factor));
      }

      const cont = viewportEl.querySelector('.pdf-pages-stack, .notes-container, .split-pane-content');
      if (cont) {
        const contRect = cont.getBoundingClientRect();
        const prevZoom = lastZoom > 0 ? lastZoom : 1.0;
        const zoomRatio = targetZoom / prevZoom;

        // Anclar el zoom exactamente en el centro de los dos dedos (center.x, center.y)
        const zoomDeltaX = (center.x - contRect.left) * (zoomRatio - 1);
        const zoomDeltaY = (center.y - contRect.top) * (zoomRatio - 1);

        cont.style.transformOrigin = '0 0';
        cont.style.transform = `scale(${targetZoom})`;

        viewportEl.scrollLeft += zoomDeltaX - panDx;
        viewportEl.scrollTop += zoomDeltaY - panDy;

        lastZoom = targetZoom;
        lastCenter = center;

        if (state.currentView === 'pdf-editor') {
          if (state.pdf) state.pdf.scale = targetZoom;
          if (state.activeItem) {
            if (!state.activeItem.viewport) state.activeItem.viewport = {};
            state.activeItem.viewport.zoom = targetZoom;
          }
          const zoomText = document.getElementById('pdf-zoom-text');
          if (zoomText) zoomText.textContent = `${Math.round(targetZoom * 100)}%`;
        } else {
          if (state.notes) state.notes.scale = targetZoom;
          if (state.activeItem) {
            if (!state.activeItem.viewport) state.activeItem.viewport = {};
            state.activeItem.viewport.zoom = targetZoom;
          }
          const zoomText = document.getElementById('zoom-percentage');
          if (zoomText) zoomText.textContent = `${Math.round(targetZoom * 100)}%`;
        }
      } else {
        viewportEl.scrollLeft -= panDx;
        viewportEl.scrollTop -= panDy;
        lastCenter = center;
      }
      return;
    }

    if (isTouchPanning) {
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;

      const curVx = (dx / dt) * 16;
      const curVy = (dy / dt) * 16;
      vx = vx * 0.35 + curVx * 0.65;
      vy = vy * 0.35 + curVy * 0.65;

      viewportEl.scrollLeft -= dx;
      viewportEl.scrollTop -= dy;
    }
  }, { passive: true });

  const stopVp = (e) => {
    if (e.pointerType === 'touch') {
      globalActiveTouches.delete(e.pointerId);
    }
    if (isTouchPanning && globalActiveTouches.size === 0) {
      isTouchPanning = false;
      startVpMomentum();
    }
  };

  viewportEl.addEventListener('pointerup', stopVp, { passive: true });
  viewportEl.addEventListener('pointercancel', stopVp, { passive: true });
  window.addEventListener('pointerup', stopVp, { passive: true });
  window.addEventListener('pointercancel', stopVp, { passive: true });

  viewportEl.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const cont = viewportEl.querySelector('.pdf-pages-stack, .notes-container, .split-pane-content');
      let curZ = 1.0;
      if (cont && cont.style.transform) {
        const m = cont.style.transform.match(/scale\(\s*([0-9.]+)\s*\)/);
        if (m && parseFloat(m[1])) curZ = parseFloat(m[1]);
      } else {
        curZ = (state.currentView === 'pdf-editor' ? (state.pdf && state.pdf.scale) : (state.notes && state.notes.scale)) || 1.0;
      }
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      const targetZoom = Math.min(3.5, Math.max(0.4, curZ * factor));
      if (cont) {
        const contRect = cont.getBoundingClientRect();
        const prevZoom = curZ > 0 ? curZ : 1.0;
        const zoomRatio = targetZoom / prevZoom;
        const zoomDeltaX = (e.clientX - contRect.left) * (zoomRatio - 1);
        const zoomDeltaY = (e.clientY - contRect.top) * (zoomRatio - 1);

        cont.style.transformOrigin = '0 0';
        cont.style.transform = `scale(${targetZoom})`;

        viewportEl.scrollLeft += zoomDeltaX;
        viewportEl.scrollTop += zoomDeltaY;
      }
      if (state.currentView === 'pdf-editor') {
        if (state.pdf) state.pdf.scale = targetZoom;
        if (state.activeItem) {
          if (!state.activeItem.viewport) state.activeItem.viewport = {};
          state.activeItem.viewport.zoom = targetZoom;
        }
        const zoomText = document.getElementById('pdf-zoom-text');
        if (zoomText) zoomText.textContent = `${Math.round(targetZoom * 100)}%`;
      } else {
        if (state.notes) state.notes.scale = targetZoom;
        if (state.activeItem) {
          if (!state.activeItem.viewport) state.activeItem.viewport = {};
          state.activeItem.viewport.zoom = targetZoom;
        }
        const zoomText = document.getElementById('zoom-percentage');
        if (zoomText) zoomText.textContent = `${Math.round(targetZoom * 100)}%`;
      }
    }
  }, { passive: false });
}



// ===== 9. MODO PANTALLA COMPLETA =====
function initFullscreenToggles() {
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const btnFm = document.getElementById('btn-toggle-fullscreen-fm');
  if (btnFm) btnFm.onclick = toggleFullscreen;
  const btnNotes = document.getElementById('btn-toggle-fullscreen-notes');
  if (btnNotes) btnNotes.onclick = toggleFullscreen;
  const btnPdf = document.getElementById('btn-toggle-fullscreen-pdf');
  if (btnPdf) btnPdf.onclick = toggleFullscreen;
}

// ===== 10. SISTEMA DE REPORTES DE FALLOS Y NOTIFICACIONES TOAST =====
function showToast(message, type = 'success', durationMs = 3200) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-message toast-${type}`;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  } else {
    iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    });
  }, durationMs);
}

function generateDiagnosticData(userDescription = '') {
  const now = new Date();
  const dateStr = now.toISOString();
  const dateReadable = now.toLocaleString('es-ES', {
    dateStyle: 'full',
    timeStyle: 'long'
  });

  const activeDoc = state.activeItem ? {
    id: state.activeItem.id,
    name: state.activeItem.name,
    type: state.activeItem.type,
    folderId: state.activeItem.folderId,
    canvasWidth: state.activeItem.canvasWidth || null,
    canvasHeight: state.activeItem.canvasHeight || null,
    format: state.activeItem.format || null,
    strokesCount: (state.activeItem.strokes && state.activeItem.strokes.length) || 0,
    imagesCount: (state.activeItem.strokes && state.activeItem.strokes.filter(s => s.isImage).length) || 0,
    pdfPages: (state.activeItem.pdfData && state.activeItem.pdfData.pageCount) || null,
    pdfAnnotationsCount: state.activeItem.pdfData && state.activeItem.pdfData.annotations ?
      Object.values(state.activeItem.pdfData.annotations).reduce((acc, a) => acc + (a ? a.length : 0), 0) : 0
  } : null;

  return {
    fechaHora: dateReadable,
    isoTimestamp: dateStr,
    navegador: {
      userAgent: navigator.userAgent,
      platform: navigator.userAgentData?.platform || navigator.platform || 'Desconocido',
      idioma: navigator.language,
      cookiesHabilitadas: navigator.cookieEnabled,
      puntosTactilesMaximos: navigator.maxTouchPoints || 0,
      memoriaAproximadaGB: navigator.deviceMemory || 'No especificada',
      nucleosLogicosCPU: navigator.hardwareConcurrency || 'No especificado'
    },
    pantallaYVentana: {
      resolucionPantalla: `${screen.width} x ${screen.height} px`,
      profundidadColor: `${screen.colorDepth}-bit`,
      pixelRatioDPR: window.devicePixelRatio || 1,
      tamanoVentanaInterna: `${window.innerWidth} x ${window.innerHeight} px`,
      orientacion: screen.orientation ? screen.orientation.type : (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'),
      pantallaCompletaActiva: !!document.fullscreenElement
    },
    entornoEjecucion: {
      protocolo: window.location.protocol,
      urlOrigen: window.location.href,
      standalonePWA: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
      fileSystemAccessApiSoportada: 'showSaveFilePicker' in window,
      indexedDbSoportada: 'indexedDB' in window
    },
    estadoAplicacion: {
      vistaActual: state.currentView,
      carpetaActualId: state.currentFolderId,
      modoLapizActivo: state.settings?.stylusOnly || false,
      unidadMedida: state.settings?.measurementUnit || 'mm',
      tema: document.documentElement.getAttribute('data-theme') || 'light',
      herramientaActiva: state.notes?.tool || 'none',
      tamanoHerramienta: state.notes?.size || 0,
      colorActivo: state.notes?.color || 'none',
      modoBorrador: state.notes?.eraserMode || 'stroke',
      tamanoBorrador: state.notes?.eraserSize || 20,
      zoomCanvas: state.notes?.scale || 1.0,
      deshacerDisponible: (state.notes?.undoStack && state.notes.undoStack.length) || 0,
      rehacerDisponible: (state.notes?.redoStack && state.notes.redoStack.length) || 0
    },
    documentoActivo: activeDoc,
    descripcionUsuario: userDescription.trim() || 'Sin descripción redactada por el usuario.'
  };
}

function formatDiagnosticReportText(data) {
  const lineSep = '='.repeat(76);
  const subSep = '-'.repeat(76);

  return [
    lineSep,
    '                    TABLET STUDIO - INFORME DE DIAGNÓSTICO Y FALLO',
    lineSep,
    `Fecha y Hora:           ${data.fechaHora}`,
    `Marca de tiempo ISO:    ${data.isoTimestamp}`,
    `Protocolo:              ${data.entornoEjecucion.protocolo} (Ejecución Local Standalone)`,
    `Vista Activa:           ${data.estadoAplicacion.vistaActual}`,
    lineSep,
    '',
    '1. DESCRIPCIÓN REDACTADA POR EL USUARIO',
    subSep,
    data.descripcionUsuario,
    '',
    '2. ESPECIFICACIONES DEL DISPOSITIVO Y NAVEGADOR',
    subSep,
    `- Plataforma / SO:        ${data.navegador.platform}`,
    `- User Agent:             ${data.navegador.userAgent}`,
    `- Idioma del Sistema:     ${data.navegador.idioma}`,
    `- Puntos táctiles máx.:   ${data.navegador.puntosTactilesMaximos} (Soporte táctil/lápiz)`,
    `- Memoria RAM aprox.:     ${data.navegador.memoriaAproximadaGB} GB`,
    `- Núcleos CPU lógicos:    ${data.navegador.nucleosLogicosCPU}`,
    '',
    '3. PANTALLA, RESOLUCIÓN Y VIEWPORT',
    subSep,
    `- Resolución de pantalla: ${data.pantallaYVentana.resolucionPantalla}`,
    `- Device Pixel Ratio:     ${data.pantallaYVentana.pixelRatioDPR}x`,
    `- Viewport del navegador: ${data.pantallaYVentana.tamanoVentanaInterna}`,
    `- Orientación:            ${data.pantallaYVentana.orientacion}`,
    `- Pantalla completa:      ${data.pantallaYVentana.pantallaCompletaActiva ? 'SÍ' : 'NO'}`,
    '',
    '4. ESTADO INTERNO DE LA APLICACIÓN',
    subSep,
    `- Tema actual:            ${data.estadoAplicacion.tema}`,
    `- Modo Solo Lápiz:        ${data.estadoAplicacion.modoLapizActivo ? 'ACTIVADO (Palm Rejection)' : 'DESACTIVADO'}`,
    `- Unidad de medida:       ${data.estadoAplicacion.unidadMedida}`,
    `- Herramienta activa:     ${data.estadoAplicacion.herramientaActiva} (Color: ${data.estadoAplicacion.colorActivo}, Grosor: ${data.estadoAplicacion.tamanoHerramienta}px)`,
    `- Modo borrador:          ${data.estadoAplicacion.modoBorrador} (Diámetro: ${data.estadoAplicacion.tamanoBorrador}px)`,
    `- Factor de escala zoom:  ${Math.round(data.estadoAplicacion.zoomCanvas * 100)}%`,
    `- Pila Deshacer / Rehacer:${data.estadoAplicacion.deshacerDisponible} estados / ${data.estadoAplicacion.rehacerDisponible} estados`,
    `- File System Access API: ${data.entornoEjecucion.fileSystemAccessApiSoportada ? 'Soportada (showSaveFilePicker)' : 'Descarga directa (Blob)'}`,
    '',
    '5. DOCUMENTO ACTIVO EN EDICIÓN',
    subSep,
    data.documentoActivo ? [
      `- ID:                     ${data.documentoActivo.id}`,
      `- Nombre:                 ${data.documentoActivo.name}`,
      `- Tipo:                   ${data.documentoActivo.type}`,
      `- Formato Papel:          ${data.documentoActivo.format || 'Continuo'}`,
      `- Dimensiones Lienzo:     ${data.documentoActivo.canvasWidth || 0} x ${data.documentoActivo.canvasHeight || 0} px`,
      `- Total de trazos activos:${data.documentoActivo.strokesCount}`,
      `- Imágenes insertadas:    ${data.documentoActivo.imagesCount}`,
      `- Páginas PDF / Anotac.:  ${data.documentoActivo.pdfPages || 'N/A'} págs / ${data.documentoActivo.pdfAnnotationsCount} anotaciones`
    ].join('\n') : 'Ningún documento abierto actualmente (En el Gestor de Archivos).',
    '',
    lineSep,
    '                        FIN DEL REPORTE DE INCIDENCIA',
    lineSep
  ].join('\n');
}

async function saveBugReportToFile(reportText) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateSlug = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const defaultFilename = `reporte_fallo_${dateSlug}.txt`;

  // 1. Intentar File System Access API para elegir carpeta directamente en disco
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultFilename,
        types: [{
          description: 'Archivo de Registro y Diagnóstico (.txt)',
          accept: { 'text/plain': ['.txt'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(reportText);
      await writable.close();
      return true;
    } catch (err) {
      if (err.name === 'AbortError') {
        return false; // El usuario canceló la ventana
      }
    }
  }

  // 2. Fallback de descarga directa automática
  try {
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 250);
    return true;
  } catch (err) {
    console.error('Error al descargar archivo de reporte:', err);
    throw err;
  }
}

function openBugReportModal() {
  const modal = document.getElementById('modal-bug-report');
  const descInput = document.getElementById('input-bug-description');
  const previewBox = document.getElementById('bug-diagnostic-preview');
  if (!modal) return;

  if (descInput) descInput.value = '';
  const initialData = generateDiagnosticData('');
  if (previewBox) {
    previewBox.textContent = formatDiagnosticReportText(initialData);
  }

  modal.style.display = 'flex';
  if (descInput) descInput.focus();
}

function closeBugReportModal() {
  const modal = document.getElementById('modal-bug-report');
  if (modal) modal.style.display = 'none';
}

function initBugReportSystem() {
  const btnFm = document.getElementById('btn-report-bug-fm');
  if (btnFm) btnFm.onclick = openBugReportModal;

  const btnNotes = document.getElementById('btn-report-bug-notes');
  if (btnNotes) btnNotes.onclick = openBugReportModal;

  const btnPdf = document.getElementById('btn-report-bug-pdf');
  if (btnPdf) btnPdf.onclick = openBugReportModal;

  const btnClose = document.getElementById('btn-close-modal-bug-report');
  if (btnClose) btnClose.onclick = closeBugReportModal;

  const btnCancel = document.getElementById('btn-cancel-modal-bug');
  if (btnCancel) btnCancel.onclick = closeBugReportModal;

  const btnSave = document.getElementById('btn-save-bug-report');
  if (btnSave) {
    btnSave.onclick = async () => {
      const desc = document.getElementById('input-bug-description')?.value || '';
      const fullReport = formatDiagnosticReportText(generateDiagnosticData(desc));

      try {
        btnSave.disabled = true;
        const saved = await saveBugReportToFile(fullReport);
        if (saved) {
          closeBugReportModal();
          showToast('✓ Reporte guardado con éxito (.txt)', 'success');
        }
      } catch (err) {
        showToast('Error al guardar el reporte', 'error');
      } finally {
        btnSave.disabled = false;
      }
    };
  }

  // Atajo global Ctrl+Z / Ctrl+Y para deshacer/rehacer trazos
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          document.getElementById('btn-notes-redo')?.click();
        } else {
          document.getElementById('btn-notes-undo')?.click();
        }
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        document.getElementById('btn-notes-redo')?.click();
      }
    }
  });
}

// =============================================================================
