/**
 * Geometría pura del editor.
 * Todas las medidas están en milímetros (mm) salvo que se indique lo contrario.
 * Este módulo no toca el DOM para poder probarse con Vitest en Node.
 */

export const MM_TO_PX = 96 / 25.4;
export const MIN_ELEMENT_SIZE = 1;

/** Resolución típica de pantalla: 96 px por pulgada. */
export function mmToPx(mm, zoom = 100) {
  return mm * MM_TO_PX * (zoom / 100);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function roundTo(value, step) {
  if (!step) return value;
  return Math.round(value / step) * step;
}

export function normalizeAngle(deg) {
  const angle = Number(deg) || 0;
  return ((angle % 360) + 360) % 360;
}

export function ptToMm(pt) {
  return (Number(pt) || 0) * (25.4 / 72);
}

export function rotateVector(vector, deg) {
  const rad = ((Number(deg) || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos
  };
}

export function rotatePoint(point, center, deg) {
  const rotated = rotateVector({ x: point.x - center.x, y: point.y - center.y }, deg);
  return { x: center.x + rotated.x, y: center.y + rotated.y };
}

export function elementCenter(el) {
  return { x: el.x + el.w / 2, y: el.y + el.h / 2 };
}

export function elementCorners(el) {
  const angle = el.rotation || 0;
  const center = elementCenter(el);
  const local = [
    { x: el.x, y: el.y },
    { x: el.x + el.w, y: el.y },
    { x: el.x + el.w, y: el.y + el.h },
    { x: el.x, y: el.y + el.h }
  ];
  return local.map((point) => (angle ? rotatePoint(point, center, angle) : point));
}

/** Bounding box alineada a los ejes (AABB) de un elemento, ya rotado. */
export function elementBounds(el) {
  if (!el.rotation) {
    return { x: el.x, y: el.y, w: el.w, h: el.h };
  }
  const corners = elementCorners(el);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function unionBounds(rects) {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

export function boundsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Posición local (sin rotar) de cada manejador de redimensión. */
export function localHandlePosition(el, handle) {
  const x = handle.includes('w') ? 0 : handle.includes('e') ? el.w : el.w / 2;
  const y = handle.includes('n') ? 0 : handle.includes('s') ? el.h : el.h / 2;
  return { x, y };
}

export const HANDLE_NAMES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * Redimensiona un elemento desde un manejador manteniendo fijo el ancla opuesta.
 * `pointer` está en coordenadas de mundo (mm).
 */
export function resizeElement(el, handle, pointer, options = {}) {
  const minSize = options.minSize ?? MIN_ELEMENT_SIZE;
  const rotation = el.rotation || 0;
  const center = elementCenter(el);
  const localPoint = rotatePoint(pointer, center, -rotation);
  const localX = localPoint.x - el.x;
  const localY = localPoint.y - el.y;

  let left = 0;
  let top = 0;
  let right = el.w;
  let bottom = el.h;

  if (handle.includes('w')) left = Math.min(localX, right - minSize);
  if (handle.includes('e')) right = Math.max(localX, left + minSize);
  if (handle.includes('n')) top = Math.min(localY, bottom - minSize);
  if (handle.includes('s')) bottom = Math.max(localY, top + minSize);

  const w = Math.max(minSize, right - left);
  const h = Math.max(minSize, bottom - top);
  const localCenter = { x: left + w / 2, y: top + h / 2 };
  const offset = rotateVector(
    { x: localCenter.x - el.w / 2, y: localCenter.y - el.h / 2 },
    rotation
  );
  const worldCenter = { x: center.x + offset.x, y: center.y + offset.y };

  return {
    ...el,
    x: worldCenter.x - w / 2,
    y: worldCenter.y - h / 2,
    w,
    h
  };
}

/** Ángulo (grados, 0 = arriba) desde el centro del elemento hacia un punto. */
export function angleFromCenter(center, point) {
  return normalizeAngle((Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90);
}

/**
 * Mueve un grupo de elementos respetando los límites de la etiqueta.
 * Devuelve copias con la misma traslación aplicada a todos.
 */
export function moveElements(elements, dx, dy, container) {
  if (!elements.length) return [];

  let minDx = -Infinity;
  let maxDx = Infinity;
  let minDy = -Infinity;
  let maxDy = Infinity;

  for (const el of elements) {
    minDx = Math.max(minDx, -el.x);
    maxDx = Math.min(maxDx, container.width - el.w - el.x);
    minDy = Math.max(minDy, -el.y);
    maxDy = Math.min(maxDy, container.height - el.h - el.y);
  }

  const clampDelta = (delta, min, max) => (min > max ? 0 : clamp(delta, min, max));
  const finalDx = clampDelta(dx, minDx, maxDx);
  const finalDy = clampDelta(dy, minDy, maxDy);

  return elements.map((el) => ({ ...el, x: el.x + finalDx, y: el.y + finalDy }));
}

function nearestLine(value, lines, threshold) {
  let best = null;
  for (const line of lines) {
    const delta = line - value;
    if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
      best = { delta, line };
    }
  }
  return best;
}

function gridLine(value, gridSize, threshold) {
  if (!gridSize || gridSize <= 0) return null;
  const line = roundTo(value, gridSize);
  const delta = line - value;
  if (Math.abs(delta) > threshold) return null;
  return { delta, line, grid: true };
}

function buildSnapLines(targets) {
  const xLines = [];
  const yLines = [];
  for (const bounds of targets) {
    xLines.push(bounds.x, bounds.x + bounds.w / 2, bounds.x + bounds.w);
    yLines.push(bounds.y, bounds.y + bounds.h / 2, bounds.y + bounds.h);
  }
  return { xLines, yLines };
}

function bestSnapForCandidates(candidates, lines, threshold) {
  let best = null;
  for (const value of candidates) {
    const hit = nearestLine(value, lines, threshold);
    if (hit && (!best || Math.abs(hit.delta) < Math.abs(best.delta))) {
      best = hit;
    }
  }
  return best;
}

/**
 * Calcula el desplazamiento de ajuste (snap) al mover una caja.
 * Prioriza alineaciones con otros elementos y, si no hay, la cuadrícula.
 */
export function computeMoveSnap(rect, targets = [], options = {}) {
  const {
    gridSize = 1,
    threshold = 0.5,
    snapGrid = true,
    snapElements = true
  } = options;

  const { xLines, yLines } = snapElements ? buildSnapLines(targets) : { xLines: [], yLines: [] };
  const xCandidates = [rect.x, rect.x + rect.w / 2, rect.x + rect.w];
  const yCandidates = [rect.y, rect.y + rect.h / 2, rect.y + rect.h];

  let bestX = bestSnapForCandidates(xCandidates, xLines, threshold);
  let bestY = bestSnapForCandidates(yCandidates, yLines, threshold);

  if (!bestX && snapGrid) {
    for (const value of [rect.x]) {
      const hit = gridLine(value, gridSize, threshold);
      if (hit && (!bestX || Math.abs(hit.delta) < Math.abs(bestX.delta))) bestX = hit;
    }
  }
  if (!bestY && snapGrid) {
    for (const value of [rect.y]) {
      const hit = gridLine(value, gridSize, threshold);
      if (hit && (!bestY || Math.abs(hit.delta) < Math.abs(bestY.delta))) bestY = hit;
    }
  }

  const guides = [];
  if (bestX && !bestX.grid) guides.push({ axis: 'x', position: bestX.line });
  if (bestY && !bestY.grid) guides.push({ axis: 'y', position: bestY.line });

  return {
    dx: bestX ? bestX.delta : 0,
    dy: bestY ? bestY.delta : 0,
    guides
  };
}

/** Ajusta un punto (usado al redimensionar) a elementos y/o cuadrícula. */
export function snapPoint(point, targets = [], options = {}) {
  const {
    gridSize = 1,
    threshold = 0.5,
    snapGrid = true,
    snapElements = true
  } = options;

  const { xLines, yLines } = snapElements ? buildSnapLines(targets) : { xLines: [], yLines: [] };
  let bestX = nearestLine(point.x, xLines, threshold);
  let bestY = nearestLine(point.y, yLines, threshold);

  if (!bestX && snapGrid) bestX = gridLine(point.x, gridSize, threshold);
  if (!bestY && snapGrid) bestY = gridLine(point.y, gridSize, threshold);

  const guides = [];
  if (bestX && !bestX.grid) guides.push({ axis: 'x', position: bestX.line });
  if (bestY && !bestY.grid) guides.push({ axis: 'y', position: bestY.line });

  return {
    x: point.x + (bestX ? bestX.delta : 0),
    y: point.y + (bestY ? bestY.delta : 0),
    guides
  };
}

/**
 * Alinea la selección. Con un solo elemento se alinea contra la etiqueta;
 * con dos o más, contra el bounding box de la selección.
 */
export function alignElements(elements, mode, container) {
  if (!elements.length) return [];
  const reference =
    elements.length > 1
      ? unionBounds(elements.map(elementBounds))
      : { x: 0, y: 0, w: container.width, h: container.height };

  return elements.map((el) => {
    const bounds = elementBounds(el);
    let dx = 0;
    let dy = 0;

    switch (mode) {
      case 'left':
        dx = reference.x - bounds.x;
        break;
      case 'center-h':
        dx = reference.x + reference.w / 2 - (bounds.x + bounds.w / 2);
        break;
      case 'right':
        dx = reference.x + reference.w - (bounds.x + bounds.w);
        break;
      case 'top':
        dy = reference.y - bounds.y;
        break;
      case 'center-v':
        dy = reference.y + reference.h / 2 - (bounds.y + bounds.h / 2);
        break;
      case 'bottom':
        dy = reference.y + reference.h - (bounds.y + bounds.h);
        break;
      default:
        break;
    }

    return { ...el, x: el.x + dx, y: el.y + dy };
  });
}

/** Distribuye la selección con separaciones iguales. Requiere 3+ elementos. */
export function distributeElements(elements, axis) {
  if (elements.length < 3) return elements;
  const horizontal = axis !== 'y';
  const sorted = [...elements].sort((a, b) => {
    const ba = elementBounds(a);
    const bb = elementBounds(b);
    return horizontal ? ba.x - bb.x : ba.y - bb.y;
  });

  const bounds = sorted.map(elementBounds);
  const start = horizontal ? bounds[0].x : bounds[0].y;
  const lastBounds = bounds[bounds.length - 1];
  const end = horizontal ? lastBounds.x + lastBounds.w : lastBounds.y + lastBounds.h;
  const totalSize = bounds.reduce((sum, b) => sum + (horizontal ? b.w : b.h), 0);
  const gap = (end - start - totalSize) / (sorted.length - 1);

  let cursor = start;
  return sorted.map((el, index) => {
    const b = bounds[index];
    let result = el;
    if (horizontal) {
      result = { ...el, x: el.x + (cursor - b.x) };
      cursor += b.w + gap;
    } else {
      result = { ...el, y: el.y + (cursor - b.y) };
      cursor += b.h + gap;
    }
    return result;
  });
}

/** Asegura que un elemento quede dentro de la etiqueta. */
export function clampElementToLabel(el, container) {
  const w = clamp(Number(el.w) || MIN_ELEMENT_SIZE, MIN_ELEMENT_SIZE, container.width);
  const h = clamp(Number(el.h) || MIN_ELEMENT_SIZE, MIN_ELEMENT_SIZE, container.height);
  return {
    ...el,
    w,
    h,
    x: clamp(Number(el.x) || 0, 0, Math.max(0, container.width - w)),
    y: clamp(Number(el.y) || 0, 0, Math.max(0, container.height - h))
  };
}
