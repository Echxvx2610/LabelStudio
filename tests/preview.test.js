import { describe, it, expect } from 'vitest';
import {
  formatDate,
  resolvePreviewText,
  serialPreview
} from '../src/renderer/data/preview.js';

const template = {
  serial: { prefix: 'EQ-', start: 7, padding: 4, suffix: '-A', base: 'dec' }
};

const fixedDate = new Date(2026, 9, 28, 14, 5, 9);

describe('vista previa de variables', () => {
  it('resuelve el serial con prefijo, relleno y sufijo', () => {
    expect(resolvePreviewText('{{serial}}', template, fixedDate)).toBe('EQ-0007-A');
    expect(serialPreview(template.serial)).toBe('EQ-0007-A');
  });

  it('resuelve prefijo y sufijo por separado', () => {
    expect(resolvePreviewText('{{prefijo}}|{{sufijo}}', template, fixedDate)).toBe('EQ-|-A');
  });

  it('formatea la fecha con el patrón indicado', () => {
    expect(resolvePreviewText('{{fecha:DD/MM/YYYY}}', template, fixedDate)).toBe('28/10/2026');
    expect(resolvePreviewText('{{fecha:YYYY-MM-DD}}', template, fixedDate)).toBe('2026-10-28');
  });

  it('usa DD/MM/YYYY por defecto y HH:mm para la hora', () => {
    expect(resolvePreviewText('{{fecha}}', template, fixedDate)).toBe('28/10/2026');
    expect(resolvePreviewText('{{hora}}', template, fixedDate)).toBe('14:05');
  });

  it('conserva las variables desconocidas', () => {
    expect(resolvePreviewText('{{cliente}} / {{serial}}', template, fixedDate)).toBe(
      '{{cliente}} / EQ-0007-A'
    );
  });

  it('devuelve el texto intacto si no hay variables', () => {
    expect(resolvePreviewText('EQ-0001', template, fixedDate)).toBe('EQ-0001');
  });

  it('expone formatDate para reutilizarlo en la Fase 5', () => {
    expect(formatDate(fixedDate, 'YY/MM/DD HH:mm:ss')).toBe('26/10/28 14:05:09');
  });
});
