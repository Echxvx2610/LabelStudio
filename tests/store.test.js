import { describe, it, expect } from 'vitest';
import { EditorStore } from '../src/renderer/editor/store.js';
import { defaultTemplate } from '../src/renderer/editor/model.js';

function createStore() {
  return new EditorStore(defaultTemplate());
}

describe('store del editor', () => {
  it('agrega un elemento, lo selecciona y permite deshacer', () => {
    const store = createStore();
    const initialCount = store.template.elements.length;
    const element = store.addElement('rect');

    expect(store.template.elements).toHaveLength(initialCount + 1);
    expect(store.selection.has(element.id)).toBe(true);

    store.undo();
    expect(store.template.elements).toHaveLength(initialCount);
    expect(store.selection.size).toBe(0);
  });

  it('agrupa cambios transitorios en un solo paso de historial', () => {
    const store = createStore();
    store.beginTransient();
    store.updateElement('e1', { x: 5 }, { transient: true });
    store.updateElement('e1', { x: 6 }, { transient: true });
    expect(store.canUndo()).toBe(false);

    store.commitTransient();
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(store.getElement('e1').x).toBe(3);
  });

  it('elimina la selección en una sola operación', () => {
    const store = createStore();
    store.select(['e1']);
    expect(store.deleteSelected()).toBe(1);
    expect(store.getElement('e1')).toBeNull();
  });

  it('duplica elementos con ids nuevos', () => {
    const store = createStore();
    store.select(['e1']);
    expect(store.duplicateSelected()).toBe(1);

    const duplicates = store.template.elements.filter((el) => el.id !== 'e1');
    expect(duplicates.length).toBe(store.template.elements.length - 1);
    expect(store.selection.size).toBe(1);
    expect(store.selection.has('e1')).toBe(false);
    expect(store.selectedElements[0].content).toBe(store.getElement('e1').content);
  });

  it('alinea la selección y registra historial', () => {
    const store = createStore();
    store.select(['e1', 'e2']);
    store.align('left');

    expect(store.getElement('e1').x).toBe(3);
    expect(store.getElement('e2').x).toBe(3);
    expect(store.canUndo()).toBe(true);
  });

  it('limita elementos al reducir el tamaño de la etiqueta', () => {
    const store = createStore();
    store.setLabel({ width: 20, height: 15 });

    for (const element of store.template.elements) {
      expect(element.x).toBeGreaterThanOrEqual(0);
      expect(element.y).toBeGreaterThanOrEqual(0);
      expect(element.x + element.w).toBeLessThanOrEqual(20);
      expect(element.y + element.h).toBeLessThanOrEqual(15);
    }
  });

  it('no registra historial cuando la mutación no cambia el documento', () => {
    const store = createStore();
    expect(store.updateElement('e1', { x: store.getElement('e1').x })).toBe(false);
    expect(store.canUndo()).toBe(false);
  });

  it('cancela un arrastre transitorio y restaura el estado', () => {
    const store = createStore();
    store.beginTransient();
    store.updateElement('e1', { x: 8 }, { transient: true });
    store.cancelTransient();
    expect(store.getElement('e1').x).toBe(3);
    expect(store.canUndo()).toBe(false);
  });

  it('reordena capas de la selección', () => {
    const store = createStore();
    store.select(['e1']);
    store.reorder('front');
    expect(store.template.elements.at(-1).id).toBe('e1');

    store.reorder('back');
    expect(store.template.elements[0].id).toBe('e1');
  });
});
