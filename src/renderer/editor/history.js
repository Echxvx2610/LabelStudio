/**
 * Historial undo/redo basado en snapshots del JSON de plantilla.
 */

export function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.states = [];
    this.index = -1;
  }

  reset(snapshot) {
    this.states = [clone(snapshot)];
    this.index = 0;
  }

  /** Registra un nuevo estado si es distinto al actual. Devuelve true si cambió. */
  record(snapshot) {
    const next = clone(snapshot);
    const current = this.states[this.index];
    if (current && JSON.stringify(current) === JSON.stringify(next)) return false;

    this.states = this.states.slice(0, this.index + 1);
    this.states.push(next);
    if (this.states.length > this.limit) {
      this.states.shift();
    }
    this.index = this.states.length - 1;
    return true;
  }

  undo() {
    if (!this.canUndo()) return null;
    this.index -= 1;
    return clone(this.states[this.index]);
  }

  redo() {
    if (!this.canRedo()) return null;
    this.index += 1;
    return clone(this.states[this.index]);
  }

  canUndo() {
    return this.index > 0;
  }

  canRedo() {
    return this.index < this.states.length - 1;
  }
}
