/**
 * Generación de QR y códigos de barras con bwip-js.
 * Devuelve el contenido interno del SVG para incrustarlo directamente en el
 * lienzo (vectorial, sin pérdida al imprimir) junto con metadatos de tamaño.
 */

import { toSVG } from 'bwip-js';

const SCALE = 4;
const CACHE_LIMIT = 150;
const cache = new Map();

const BCID_BY_SYMBOLOGY = {
  code128: 'code128',
  code39: 'code39',
  ean13: 'ean13',
  interleaved2of5: 'interleaved2of5',
  datamatrix: 'datamatrix'
};

function readViewBox(svg) {
  const match = /viewBox="([^"]+)"/.exec(svg);
  if (!match) return { width: 1, height: 1 };
  const parts = match[1].trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return { width: 1, height: 1 };
  return { width: Math.max(1, parts[2]), height: Math.max(1, parts[3]) };
}

function stripSvg(svg) {
  const start = svg.indexOf('>');
  const end = svg.lastIndexOf('</svg>');
  if (start === -1 || end === -1) return svg;
  return svg.slice(start + 1, end).trim();
}

function normalizeColor(color) {
  const value = String(color || '').trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : '000000';
}

function buildCode({ type, text, symbology, errorLevel, showText, color }) {
  const barcolor = normalizeColor(color);

  if (type === 'qr') {
    const svg = toSVG({
      bcid: 'qrcode',
      text,
      eclevel: errorLevel || 'M',
      // BWIPP sube el nivel de corrección automáticamente si el contenido cabe.
      // La UI expone el nivel como una decisión del usuario, así que lo fijamos.
      fixedeclevel: true,
      scale: SCALE,
      padding: 0,
      barcolor
    });
    const { width, height } = readViewBox(svg);
    return {
      kind: 'matrix',
      naturalWidth: width,
      naturalHeight: height,
      modulePx: SCALE * 2,
      modules: Math.max(1, Math.round(width / (SCALE * 2))),
      inner: stripSvg(svg)
    };
  }

  const bcid = BCID_BY_SYMBOLOGY[symbology] || 'code128';
  const options = {
    bcid,
    text,
    scale: SCALE,
    padding: 0,
    barcolor
  };

  if (bcid === 'datamatrix') {
    const svg = toSVG(options);
    const { width, height } = readViewBox(svg);
    return {
      kind: 'matrix',
      naturalWidth: width,
      naturalHeight: height,
      modulePx: SCALE * 2,
      modules: Math.max(1, Math.round(width / (SCALE * 2))),
      inner: stripSvg(svg)
    };
  }

  options.height = 10;
  options.includetext = Boolean(showText);
  const svg = toSVG(options);
  const { width, height } = readViewBox(svg);

  return {
    kind: 'linear',
    naturalWidth: width,
    naturalHeight: height,
    modulePx: SCALE,
    modules: Math.max(1, Math.round(width / SCALE)),
    inner: stripSvg(svg)
  };
}

export function clearCodeCache() {
  cache.clear();
}

/**
 * Genera (o recupera de caché) un código.
 * Devuelve { kind, naturalWidth, naturalHeight, modulePx, modules, inner }
 * o { error } si bwip-js rechaza el contenido.
 */
export function generateCode(options) {
  const key = [
    options.type,
    options.text,
    options.symbology || '',
    options.errorLevel || '',
    options.showText ? '1' : '0',
    options.color || ''
  ].join('|');

  const cached = cache.get(key);
  if (cached) return cached;

  let value;
  try {
    value = buildCode(options);
  } catch (error) {
    value = { error: error?.message || 'No se pudo generar el código con el contenido actual.' };
  }

  if (cache.size >= CACHE_LIMIT) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, value);
  return value;
}
