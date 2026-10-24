// ===== MENÚ CIRCULAR (MANTENER PULSADO PARA CAMBIAR DE HERRAMIENTA Y COLOR) =====
// Se activa en Ajustes > Entrada Táctil y Lápiz Stylus. Al mantener pulsado sin moverse aparece un
// círculo: anillo interior con las herramientas de la barra y anillo exterior con los colores favoritos.
// Se elige arrastrando hasta la opción y soltando, o soltando primero y tocando la opción.

let radialWatch = null;
let radialMenuEl = null;

function getRadialMenuSettings() {
  const s = state.settings || {};
  return {
    enabled: !!s.radialMenu,
    input: s.radialMenuInput || 'both',
    delay: Number(s.radialMenuDelay) || 500
  };
}

function isRadialMenuOpen() {
  return !!radialMenuEl;
}

function radialMenuCancelWatch() {
  if (!radialWatch) return;
  clearTimeout(radialWatch.timer);
  radialWatch.cleanup();
  radialWatch = null;
}

// Empieza a vigilar una pulsación. onFire() se llama justo antes de abrir el menú y puede
// devolver false para impedirlo (por ejemplo, si el gesto ya hizo algo que no se debe deshacer).
function radialMenuWatch(e, onFire) {
  const cfg = getRadialMenuSettings();
  if (!cfg.enabled || radialMenuEl) return;
  const isFinger = e.pointerType === 'touch';
  if (cfg.input === 'pen' && isFinger) return;
  if (cfg.input === 'finger' && !isFinger) return;

  radialMenuCancelWatch();
  const w = { id: e.pointerId, x: e.clientX, y: e.clientY };
  const slop = isFinger ? 10 : 6;

  const onMove = (ev) => {
    if (ev.pointerId !== w.id) return;
    if (Math.hypot(ev.clientX - w.x, ev.clientY - w.y) > slop) radialMenuCancelWatch();
  };
  const onEnd = (ev) => {
    if (ev.pointerId === w.id) radialMenuCancelWatch();
  };
  // Un segundo dedo (zoom) o cualquier otra pulsación cancela la espera
  const onOtherDown = (ev) => {
    if (ev.pointerId !== w.id) radialMenuCancelWatch();
  };

  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onEnd, true);
  window.addEventListener('pointercancel', onEnd, true);
  window.addEventListener('pointerdown', onOtherDown, true);
  w.cleanup = () => {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onEnd, true);
    window.removeEventListener('pointercancel', onEnd, true);
    window.removeEventListener('pointerdown', onOtherDown, true);
  };

  w.timer = setTimeout(() => {
    const ok = typeof onFire === 'function' ? onFire() !== false : true;
    radialMenuCancelWatch();
    if (ok) openRadialMenu(w.x, w.y, w.id);
  }, cfg.delay);
  radialWatch = w;
}

function openRadialMenu(x, y, pointerId) {
  closeRadialMenu();

  const tools = (state.toolbarTools || []).filter(t => t.type !== 'image').slice(0, 12);
  const colors = [];
  (state.favColors || []).forEach(c => {
    const lc = String(c).toLowerCase();
    if (!colors.includes(lc)) colors.push(lc);
  });
  const shownColors = colors.slice(0, 16);

  const innerR = 74;
  const outerR = 128;
  const wheelR = shownColors.length ? 150 : 104;
  const margin = 8;
  const cx = Math.min(window.innerWidth - wheelR - margin, Math.max(wheelR + margin, x));
  const cy = Math.min(window.innerHeight - wheelR - margin, Math.max(wheelR + margin, y));

  const overlay = document.createElement('div');
  overlay.className = 'radial-menu-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Menú rápido de herramientas y colores');

  const wheel = document.createElement('div');
  wheel.className = 'radial-menu-wheel';
  wheel.style.left = `${cx}px`;
  wheel.style.top = `${cy}px`;
  wheel.style.width = wheel.style.height = `${wheelR * 2}px`;
  wheel.style.marginLeft = wheel.style.marginTop = `${-wheelR}px`;
  if (!shownColors.length) wheel.classList.add('no-colors');
  overlay.appendChild(wheel);

  const place = (el, angle, r) => {
    el.style.left = `${wheelR + r * Math.cos(angle)}px`;
    el.style.top = `${wheelR + r * Math.sin(angle)}px`;
  };

  tools.forEach((tool, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'radial-item radial-tool';
    if (tool.id === state.activeToolId) btn.classList.add('active');
    btn.dataset.radialTool = tool.id;
    btn.title = tool.name || '';
    btn.setAttribute('aria-label', tool.name || tool.type);
    const icon = typeof getToolIconSvg === 'function' ? getToolIconSvg(tool) : '';
    const badge = tool.color ? `<span class="radial-tool-badge" style="background-color:${tool.color}"></span>` : '';
    btn.innerHTML = `${icon}${badge}`;
    place(btn, -Math.PI / 2 + (i / tools.length) * Math.PI * 2, innerR);
    wheel.appendChild(btn);
  });

  const currentColor = String(state.notes.color || '').toLowerCase();
  shownColors.forEach((col, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'radial-item radial-color';
    if (col === currentColor) btn.classList.add('active');
    btn.dataset.radialColor = col;
    btn.style.setProperty('--dot-color', col);
    btn.setAttribute('aria-label', `Color ${col}`);
    place(btn, -Math.PI / 2 + (i / shownColors.length) * Math.PI * 2, outerR);
    wheel.appendChild(btn);
  });

  const center = document.createElement('button');
  center.type = 'button';
  center.className = 'radial-item radial-center';
  center.dataset.radialClose = '1';
  center.setAttribute('aria-label', 'Cerrar');
  center.innerHTML = '<span aria-hidden="true">✕</span>';
  center.style.left = center.style.top = `${wheelR}px`;
  wheel.appendChild(center);

  document.body.appendChild(overlay);
  radialMenuEl = overlay;
  if (navigator.vibrate) {
    try { navigator.vibrate(12); } catch (err) {}
  }

  const itemAt = (ev) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    return el ? el.closest('.radial-item') : null;
  };

  const choose = (item) => {
    if (!item) return;
    if (item.dataset.radialTool) {
      const tool = (state.toolbarTools || []).find(t => t.id === item.dataset.radialTool);
      if (tool && typeof handleToolButtonClick === 'function') handleToolButtonClick(tool, null);
    } else if (item.dataset.radialColor) {
      if (typeof setBrushColorDirect === 'function') setBrushColorDirect(item.dataset.radialColor);
      else state.notes.color = item.dataset.radialColor;
    }
    closeRadialMenu();
  };

  // Arrastrar desde la pulsación que abrió el menú: resaltar y elegir al soltar
  let dragMoved = false;
  let dragActive = true;
  let hovered = null;
  const setHovered = (item) => {
    if (hovered === item) return;
    if (hovered) hovered.classList.remove('hover');
    hovered = item;
    if (hovered) hovered.classList.add('hover');
  };
  const onDragMove = (ev) => {
    if (ev.pointerId !== pointerId) return;
    if (Math.hypot(ev.clientX - x, ev.clientY - y) > 18) dragMoved = true;
    setHovered(itemAt(ev));
  };
  const onDragEnd = (ev) => {
    if (ev.pointerId !== pointerId) return;
    endDrag();
    const item = itemAt(ev);
    if (dragMoved) {
      if (item && !item.dataset.radialClose) choose(item);
      else closeRadialMenu();
    } else {
      setHovered(null);
    }
  };
  const endDrag = () => {
    dragActive = false;
    window.removeEventListener('pointermove', onDragMove, true);
    window.removeEventListener('pointerup', onDragEnd, true);
    window.removeEventListener('pointercancel', onDragEnd, true);
  };
  window.addEventListener('pointermove', onDragMove, true);
  window.addEventListener('pointerup', onDragEnd, true);
  window.addEventListener('pointercancel', onDragEnd, true);

  // Modo toque: tras soltar sin arrastrar, tocar una opción la elige y tocar fuera cierra
  overlay.addEventListener('pointerdown', (ev) => {
    if (dragActive) return;
    ev.preventDefault();
    ev.stopPropagation();
    const item = ev.target.closest('.radial-item');
    if (item && !item.dataset.radialClose) choose(item);
    else closeRadialMenu();
  });

  const onKey = (ev) => {
    if (ev.key === 'Escape') closeRadialMenu();
  };
  document.addEventListener('keydown', onKey);

  overlay._cleanup = () => {
    endDrag();
    document.removeEventListener('keydown', onKey);
  };
}

function closeRadialMenu() {
  if (!radialMenuEl) return;
  const el = radialMenuEl;
  radialMenuEl = null;
  if (el._cleanup) el._cleanup();
  el.classList.add('closing');
  setTimeout(() => el.remove(), 120);
}
