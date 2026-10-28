import { describe, it, expect } from 'vitest';
import { History } from '../src/renderer/editor/history.js';

describe('historial undo/redo', () => {
  it('deshace y rehace estados', () => {
    const history = new History();
    history.reset({ value: 1 });
    history.record({ value: 2 });
    history.record({ value: 3 });

    expect(history.canUndo()).toBe(true);
    expect(history.undo()).toEqual({ value: 2 });
    expect(history.undo()).toEqual({ value: 1 });
    expect(history.canUndo()).toBe(false);
    expect(history.redo()).toEqual({ value: 2 });
  });

  it('ignora estados idénticos', () => {
    const history = new History();
    history.reset({ value: 1 });
    expect(history.record({ value: 1 })).toBe(false);
    expect(history.canUndo()).toBe(false);
  });

  it('descarta el futuro al registrar después de deshacer', () => {
    const history = new History();
    history.reset({ value: 1 });
    history.record({ value: 2 });
    history.record({ value: 3 });
    history.undo();
    history.record({ value: 4 });

    expect(history.canRedo()).toBe(false);
    expect(history.undo()).toEqual({ value: 2 });
  });

  it('respeta el límite de estados', () => {
    const history = new History(2);
    history.reset({ value: 1 });
    history.record({ value: 2 });
    history.record({ value: 3 });

    expect(history.states).toHaveLength(2);
    expect(history.undo()).toEqual({ value: 2 });
    expect(history.canUndo()).toBe(false);
  });

  it('devuelve copias y no referencias compartidas', () => {
    const history = new History();
    const state = { value: 1 };
    history.reset(state);
    state.value = 99;
    expect(history.states[0].value).toBe(1);
  });
});
