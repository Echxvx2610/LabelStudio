/**
 * Sustitución de variables integradas para la vista previa del editor.
 * La serialización completa (bases, paso, reinicios, CSV) llega en la Fase 5;
 * aquí solo se resuelven los valores que ya existen en la plantilla.
 */

function padNumber(value, width) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
  const negative = safe < 0;
  const digits = String(Math.abs(safe)).padStart(Math.max(1, Number(width) || 1), '0');
  return negative ? `-${digits}` : digits;
}

export function formatDate(date, format = 'DD/MM/YYYY') {
  const tokens = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    DD: String(date.getDate()).padStart(2, '0'),
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    HH: String(date.getHours()).padStart(2, '0'),
    mm: String(date.getMinutes()).padStart(2, '0'),
    ss: String(date.getSeconds()).padStart(2, '0')
  };
  return String(format).replace(/YYYY|YY|DD|MM|HH|mm|ss/g, (token) => tokens[token]);
}

export function serialPreview(serial = {}) {
  const start = Number.isFinite(Number(serial.start)) ? Number(serial.start) : 1;
  const padding = Math.max(1, Number(serial.padding) || 1);
  return `${serial.prefix || ''}${padNumber(start, padding)}${serial.suffix || ''}`;
}

/**
 * Reemplaza {{serial}}, {{prefijo}}, {{sufijo}}, {{fecha}} y {{hora}}.
 * Las variables desconocidas se conservan tal cual para no perder información.
 */
export function resolvePreviewText(input, template = {}, now = new Date()) {
  const text = String(input ?? '');
  if (!text.includes('{{')) return text;

  const serial = template.serial || {};
  const prefix = serial.prefix || '';
  const suffix = serial.suffix || '';

  return text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, token) => {
    const separator = token.indexOf(':');
    const name = (separator === -1 ? token : token.slice(0, separator)).toLowerCase();
    const argument = separator === -1 ? '' : token.slice(separator + 1).trim();

    switch (name) {
      case 'serial':
        return serialPreview(serial);
      case 'prefijo':
        return prefix;
      case 'sufijo':
        return suffix;
      case 'fecha':
        return formatDate(now, argument || 'DD/MM/YYYY');
      case 'hora':
        return formatDate(now, argument || 'HH:mm');
      default:
        return match;
    }
  });
}
