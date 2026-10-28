/**
 * Validación de contenido y legibilidad de códigos (QR / barras).
 * Módulo puro: no toca el DOM ni genera SVG, para poder probarse con Vitest.
 */

import { clamp } from './geometry.js';

export const SYMBOLOGIES = [
  {
    id: 'code128',
    label: 'Code 128',
    hint: 'ASCII imprimible. Ideal para seriales alfanuméricos.'
  },
  {
    id: 'code39',
    label: 'Code 39',
    hint: 'A-Z, 0-9 y los símbolos - . $ / + %.'
  },
  {
    id: 'ean13',
    label: 'EAN-13',
    hint: '12 dígitos (se calcula el verificador) o 13 dígitos.'
  },
  {
    id: 'interleaved2of5',
    label: 'ITF (Interleaved 2 of 5)',
    hint: 'Solo dígitos y cantidad par.'
  },
  {
    id: 'datamatrix',
    label: 'DataMatrix',
    hint: 'Texto libre en 2D. Útil en espacios pequeños.'
  }
];

export const QR_ERROR_LEVELS = [
  { id: 'L', label: 'L — baja (~7 %)' },
  { id: 'M', label: 'M — media (~15 %)' },
  { id: 'Q', label: 'Q — alta (~25 %)' },
  { id: 'H', label: 'H — máxima (~30 %)' }
];

/** Límites aproximados de QR versión 40 en bytes según el nivel de corrección. */
const QR_CAPACITY = { L: 2953, M: 2331, Q: 1663, H: 1273 };

/** Módulo mínimo recomendado por simbología, en milímetros. */
const MIN_MODULE_MM = {
  code128: { warn: 0.19, error: 0.15 },
  code39: { warn: 0.19, error: 0.15 },
  interleaved2of5: { warn: 0.19, error: 0.15 },
  ean13: { warn: 0.264, error: 0.2 },
  datamatrix: { warn: 0.3, error: 0.2 },
  qrcode: { warn: 0.35, error: 0.25 }
};

export function getSymbology(id) {
  return SYMBOLOGIES.find((item) => item.id === id) || SYMBOLOGIES[0];
}

/** Calcula el dígito verificador de un EAN-13 a partir de sus 12 primeros dígitos. */
export function ean13CheckDigit(digits) {
  const clean = String(digits ?? '').replace(/\D/g, '').slice(0, 12);
  if (clean.length !== 12) return null;
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(clean[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

function result(text, errors, warnings) {
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    text
  };
}

export function normalizeBarcodeText(symbology, rawText) {
  const text = String(rawText ?? '');
  if (symbology === 'code39') return text.toUpperCase();
  if (symbology === 'interleaved2of5') return text.replace(/\s+/g, '');
  return text;
}

export function validateBarcode(symbology, rawText) {
  const text = normalizeBarcodeText(symbology, rawText);
  const errors = [];
  const warnings = [];

  if (!text) {
    errors.push('El contenido no puede estar vacío.');
    return result(text, errors, warnings);
  }

  switch (symbology) {
    case 'code128':
      if (/[^\x20-\x7e]/.test(text)) {
        errors.push('Code 128 solo admite caracteres ASCII imprimibles (sin acentos ni símbolos fuera de ASCII).');
      }
      if (text.length > 80) {
        warnings.push('Contenido muy largo: el código puede quedar demasiado denso para leerse.');
      }
      break;

    case 'code39': {
      if (!/^[0-9A-Z\-. $/+%]+$/.test(text)) {
        errors.push('Code 39 solo admite A-Z, 0-9 y los símbolos - . $ / + %.');
      }
      if (String(rawText ?? '') !== text) {
        warnings.push('Code 39 se genera en mayúsculas.');
      }
      break;
    }

    case 'ean13': {
      if (!/^\d+$/.test(text)) {
        errors.push('EAN-13 solo admite dígitos (sin espacios ni guiones).');
        break;
      }
      if (text.length !== 12 && text.length !== 13) {
        errors.push('EAN-13 requiere 12 dígitos (sin verificador) o 13 dígitos (con verificador).');
        break;
      }
      if (text.length === 13) {
        const expected = ean13CheckDigit(text.slice(0, 12));
        if (expected !== Number(text[12])) {
          errors.push(`El dígito verificador no es válido: debería ser ${expected}.`);
        }
      }
      break;
    }

    case 'interleaved2of5': {
      if (!/^\d+$/.test(text)) {
        errors.push('ITF solo admite dígitos.');
        break;
      }
      if (text.length % 2 !== 0) {
        errors.push('ITF requiere una cantidad par de dígitos.');
      }
      break;
    }

    case 'datamatrix':
      if (text.length > 200) {
        warnings.push('Contenido muy largo para DataMatrix: el código perderá legibilidad en tamaños pequeños.');
      }
      break;

    default:
      errors.push('Simbología no soportada.');
      break;
  }

  return result(text, errors, warnings);
}

export function validateQr(rawText, errorLevel = 'M') {
  const text = String(rawText ?? '');
  const errors = [];
  const warnings = [];

  if (!text) {
    errors.push('El contenido del QR no puede estar vacío.');
    return result(text, errors, warnings);
  }

  const level = QR_CAPACITY[errorLevel] ? errorLevel : 'M';
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > QR_CAPACITY[level]) {
    errors.push(
      `El contenido supera la capacidad de un QR nivel ${level} (${bytes} de ${QR_CAPACITY[level]} bytes).`
    );
  } else if (bytes > QR_CAPACITY[level] * 0.6) {
    warnings.push('Contenido largo: el QR tendrá muchos módulos y necesitará más tamaño para leerse.');
  }

  if (/[^\x00-\x7f]/.test(text)) {
    warnings.push('El contenido incluye caracteres no ASCII; algunos escáneres antiguos pueden no leerlo.');
  }

  return result(text, errors, warnings);
}

export function validateElementContent(element, text) {
  if (!element) return result('', ['No hay elemento seleccionado.'], []);
  if (element.type === 'qr') return validateQr(text, element.errorLevel);
  if (element.type === 'barcode') return validateBarcode(element.symbology, text);
  return result(String(text ?? ''), [], []);
}

/**
 * Calcula dónde se dibuja el código dentro de la caja del elemento (mm).
 * `meta` lo devuelve `barcodes.generateCode`.
 */
export function codeLayout(element, meta) {
  const width = Math.max(0.5, Number(element?.w) || 0.5);
  const height = Math.max(0.5, Number(element?.h) || 0.5);
  const requestedQuiet = Math.max(0, Number(element?.quietZone) || 0);
  const maxQuiet = Math.max(0, Math.min(width, height) / 2 - 0.5);
  const quiet = clamp(requestedQuiet, 0, maxQuiet);

  if (!meta || meta.error || !meta.naturalWidth || !meta.naturalHeight) {
    return { x: 0, y: 0, w: width, h: height, moduleMm: 0, quiet };
  }

  if (meta.kind === 'matrix') {
    const side = Math.max(0.5, Math.min(width, height) - quiet * 2);
    const modules = Math.max(1, Number(meta.modules) || 1);
    return {
      x: (width - side) / 2,
      y: (height - side) / 2,
      w: side,
      h: side,
      moduleMm: side / modules,
      quiet
    };
  }

  const innerW = Math.max(0.5, width - quiet * 2);
  const innerH = Math.max(0.5, height - quiet * 2);
  const scale = Math.min(innerW / meta.naturalWidth, innerH / meta.naturalHeight);
  const drawW = meta.naturalWidth * scale;
  const drawH = meta.naturalHeight * scale;

  return {
    x: (width - drawW) / 2,
    y: (height - drawH) / 2,
    w: drawW,
    h: drawH,
    moduleMm: (Number(meta.modulePx) || 1) * scale,
    quiet
  };
}

function roundMm(value) {
  return Math.round(value * 1000) / 1000;
}

function formatMm(value) {
  return roundMm(value).toFixed(2);
}

/**
 * Evalúa si el código conserva un tamaño de módulo suficiente para escanearse.
 * Devuelve { level, messages, moduleMm }.
 */
export function assessCodeReadability(element, meta) {
  const layout = codeLayout(element, meta);
  const moduleMm = roundMm(layout.moduleMm);

  if (!meta || meta.error || !moduleMm) {
    return {
      level: 'error',
      messages: [meta?.error || 'No se pudo calcular el tamaño del código.'],
      moduleMm: 0,
      layout
    };
  }

  const key = element?.type === 'qr' ? 'qrcode' : element?.symbology || 'code128';
  const limits = MIN_MODULE_MM[key] || MIN_MODULE_MM.code128;
  const messages = [];
  let level = 'ok';

  if (moduleMm < limits.error) {
    level = 'error';
    messages.push(
      `Módulo de ${formatMm(moduleMm)} mm: demasiado pequeño para leerse con fiabilidad (mínimo ~${formatMm(
        limits.error
      )} mm). Aumenta el tamaño o acorta el contenido.`
    );
  } else if (moduleMm < limits.warn) {
    level = 'warning';
    messages.push(
      `Módulo de ${formatMm(moduleMm)} mm: puede fallar en escáneres (recomendado ≥ ${formatMm(
        limits.warn
      )} mm).`
    );
  }

  if (meta.kind === 'linear' && layout.h < 5) {
    if (level === 'ok') level = 'warning';
    messages.push(
      `Altura del código baja (${formatMm(layout.h)} mm); se recomienda al menos 5 mm.`
    );
  }

  if (meta.kind === 'linear' && element?.showText && layout.h < 7) {
    if (level === 'ok') level = 'warning';
    messages.push('El texto legible puede quedar demasiado pequeño para leerse a simple vista.');
  }

  return { level, messages, moduleMm, layout };
}
