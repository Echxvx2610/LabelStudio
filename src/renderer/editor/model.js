/**
 * Modelo de plantilla: creación, normalización y presets.
 * El JSON de plantilla es la única fuente de verdad del editor.
 */

import { clamp, MIN_ELEMENT_SIZE, normalizeAngle } from './geometry.js';

export const LABEL_PRESETS = {
  'eq-50x30': { width: 50, height: 30, name: 'Etiqueta Equipo' },
  'prod-70x37': { width: 70, height: 37, name: 'Avery 70×37' },
  'box-100x50': { width: 100, height: 50, name: 'Caja / Envíos' }
};

/** Fuentes empaquetadas con la app (impresión idéntica en cualquier equipo). */
export const FONT_OPTIONS = [
  {
    id: 'Inter',
    label: 'Inter',
    stack: '"Inter", "Segoe UI", Arial, sans-serif'
  },
  {
    id: 'Roboto Mono',
    label: 'Roboto Mono',
    stack: '"Roboto Mono", "Cascadia Code", Consolas, "Courier New", monospace'
  }
];

export function fontStack(name) {
  return (FONT_OPTIONS.find((option) => option.id === name) || FONT_OPTIONS[0]).stack;
}

const ELEMENT_DEFAULTS = {
  text: {
    w: 30,
    h: 6,
    content: 'Texto',
    font: 'Inter',
    size: 11,
    bold: false,
    italic: false,
    align: 'left',
    lineHeight: 1.2,
    autoFit: false,
    color: '#0b090a'
  },
  qr: {
    w: 14,
    h: 14,
    content: '{{serial}}',
    errorLevel: 'M',
    quietZone: 1,
    color: '#0b090a'
  },
  barcode: {
    w: 30,
    h: 12,
    content: '{{serial}}',
    symbology: 'code128',
    showText: true,
    quietZone: 1,
    color: '#0b090a'
  },
  image: { w: 20, h: 20, content: '', src: '', fit: 'contain' },
  rect: { w: 20, h: 10, fill: 'none', stroke: '#0b090a', strokeWidth: 0.3, radius: 1 },
  line: { w: 20, h: 10, stroke: '#0b090a', strokeWidth: 0.3 },
  ellipse: { w: 20, h: 10, fill: 'none', stroke: '#0b090a', strokeWidth: 0.3 }
};

let idCounter = 0;

function normalizeSize(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(MIN_ELEMENT_SIZE, numeric);
}

export function createElementId() {
  idCounter += 1;
  return `el-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createElement(type, overrides = {}) {
  const defaults = ELEMENT_DEFAULTS[type] || ELEMENT_DEFAULTS.rect;
  const element = {
    id: overrides.id || createElementId(),
    type,
    x: 0,
    y: 0,
    rotation: 0,
    ...defaults,
    ...overrides
  };

  element.w = normalizeSize(element.w, defaults.w);
  element.h = normalizeSize(element.h, defaults.h);
  element.x = Number(element.x) || 0;
  element.y = Number(element.y) || 0;
  element.rotation = normalizeAngle(element.rotation);
  return element;
}

/** Coloca un elemento nuevo en el centro de la etiqueta. */
export function createCenteredElement(type, label, overrides = {}) {
  const probe = createElement(type, overrides);
  const offset = (idCounter % 3) * 1;
  const x = overrides.x ?? (label.width - probe.w) / 2 + offset;
  const y = overrides.y ?? (label.height - probe.h) / 2 + offset;
  return createElement(type, { ...overrides, x, y });
}

export function defaultTemplate() {
  return {
    version: 1,
    name: 'Etiqueta equipo',
    label: { width: 50, height: 30, unit: 'mm', radius: 1 },
    elements: [
      createElement('text', {
        id: 'e1',
        x: 3,
        y: 4,
        w: 30,
        h: 6,
        content: 'EQ-0001',
        size: 11,
        bold: true
      }),
      createElement('qr', { id: 'e2', x: 34, y: 3, w: 14, h: 14, content: '{{serial}}' }),
      createElement('text', {
        id: 'e3',
        x: 3,
        y: 15,
        w: 34,
        h: 4,
        content: 'ACTIVO FIJO - BRUNSWICK',
        size: 7
      }),
      createElement('text', {
        id: 'e4',
        x: 3,
        y: 22,
        w: 30,
        h: 5,
        content: '28/10/2026',
        size: 8
      })
    ],
    serial: { prefix: 'EQ-', start: 1, step: 1, padding: 4, suffix: '', base: 'dec' },
    sheet: {
      page: 'A4',
      cols: 3,
      rows: 8,
      marginTop: 10,
      marginLeft: 5,
      gapX: 2,
      gapY: 2,
      startAt: 1
    }
  };
}

/** Garantiza que una plantilla cargada tenga todos los campos esperados. */
export function normalizeTemplate(input) {
  const source = input && typeof input === 'object' ? input : {};
  const label = source.label || {};
  const width = clamp(Number(label.width) || 50, 10, 300);
  const height = clamp(Number(label.height) || 30, 10, 300);

  const elements = Array.isArray(source.elements) ? source.elements : [];
  const seen = new Set();
  const normalizedElements = elements.map((raw, index) => {
    const type = raw?.type || 'rect';
    let id = raw?.id || `e${index + 1}`;
    while (seen.has(id)) id = createElementId();
    seen.add(id);
    return createElement(type, { ...raw, id });
  });

  return {
    version: Number(source.version) || 1,
    name: source.name || 'Etiqueta sin título',
    label: {
      width,
      height,
      unit: 'mm',
      radius: clamp(Number(label.radius) || 0, 0, 20)
    },
    elements: normalizedElements,
    serial: {
      prefix: 'EQ-',
      start: 1,
      step: 1,
      padding: 4,
      suffix: '',
      base: 'dec',
      ...(source.serial || {})
    },
    sheet: {
      page: 'A4',
      cols: 3,
      rows: 8,
      marginTop: 10,
      marginLeft: 5,
      gapX: 2,
      gapY: 2,
      startAt: 1,
      ...(source.sheet || {})
    }
  };
}

/** Aplica orientación intercambiando ancho y alto si hace falta. */
export function applyOrientation(size, orientation) {
  const { width, height } = size;
  const isPortrait = height > width;
  if (orientation === 'portrait' && !isPortrait) return { width: height, height: width };
  if (orientation === 'landscape' && isPortrait) return { width: height, height: width };
  return { width, height };
}
