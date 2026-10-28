import { describe, it, expect } from 'vitest';
import {
  applyOrientation,
  createElement,
  defaultTemplate,
  normalizeTemplate
} from '../src/renderer/editor/model.js';

describe('modelo de plantilla', () => {
  it('genera una plantilla por defecto válida', () => {
    const template = defaultTemplate();
    expect(template.label.width).toBe(50);
    expect(template.label.height).toBe(30);
    expect(template.elements.length).toBeGreaterThanOrEqual(3);
    expect(new Set(template.elements.map((el) => el.id)).size).toBe(template.elements.length);
  });

  it('normaliza plantillas incompletas y limita el tamaño', () => {
    const template = normalizeTemplate({
      label: { width: 5, height: 999, radius: 99 },
      elements: [{ id: 'x', type: 'text', w: 0, h: -2 }]
    });
    expect(template.label.width).toBe(10);
    expect(template.label.height).toBe(300);
    expect(template.label.radius).toBe(20);
    expect(template.elements[0].w).toBe(1);
    expect(template.elements[0].h).toBe(1);
    expect(template.serial.prefix).toBe('EQ-');
  });

  it('evita ids duplicados al normalizar', () => {
    const template = normalizeTemplate({
      elements: [
        { id: 'dup', type: 'rect' },
        { id: 'dup', type: 'rect' }
      ]
    });
    const ids = template.elements.map((el) => el.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('crea elementos con rotation normalizada', () => {
    const element = createElement('rect', { rotation: -90 });
    expect(element.rotation).toBe(270);
  });
});

describe('orientación de etiqueta', () => {
  it('intercambia dimensiones al pasar a vertical', () => {
    expect(applyOrientation({ width: 50, height: 30 }, 'portrait')).toEqual({
      width: 30,
      height: 50
    });
  });

  it('no cambia dimensiones si ya están en la orientación pedida', () => {
    expect(applyOrientation({ width: 30, height: 50 }, 'portrait')).toEqual({
      width: 30,
      height: 50
    });
  });
});
