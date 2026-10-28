/**
 * Estado central del editor. Todo cambio del documento pasa por aquí para
 * mantener el historial (snapshots del JSON) y notificar a la UI.
 */

import { History, clone } from './history.js';
import {
  applyOrientation,
  createCenteredElement,
  createElementId,
  defaultTemplate,
  LABEL_PRESETS,
  normalizeTemplate
} from './model.js';
import {
  alignElements,
  clamp,
  clampElementToLabel,
  distributeElements,
  moveElements,
  normalizeAngle
} from './geometry.js';

const MIN_LABEL_SIZE = 10;
const MAX_LABEL_SIZE = 300;
const MAX_HISTORY = 100;

export class EditorStore {
  constructor(template = defaultTemplate()) {
    this.template = normalizeTemplate(template);
    this.selection = new Set();
    this.zoom = 100;
    this.grid = { visible: true, size: 1 };
    this.rulersVisible = true;
    this.snapEnabled = true;
    this.overlayGuides = [];
    this.marquee = null;

    this.history = new History(MAX_HISTORY);
    this.history.reset(this.template);

    this.listeners = new Set();
    this._transientBaseline = null;
    this._clipboard = [];
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event = 'change') {
    for (const listener of [...this.listeners]) listener(event, this);
  }

  get label() {
    return this.template.label;
  }

  get selectedElements() {
    if (!this.selection.size) return [];
    return this.template.elements.filter((el) => this.selection.has(el.id));
  }

  get selectedCount() {
    return this.selection.size;
  }

  hasElement(id) {
    return this.template.elements.some((el) => el.id === id);
  }

  getElement(id) {
    return this.template.elements.find((el) => el.id === id) || null;
  }

  canUndo() {
    return this.history.canUndo();
  }

  canRedo() {
    return this.history.canRedo();
  }

  /**
   * Aplica una mutación y registra historial si el JSON cambió.
   * `transient` se usa durante arrastres: el historial se cierra con commitTransient().
   */
  _mutate(fn, { transient = false } = {}) {
    const before = JSON.stringify(this.template);
    fn();
    const after = JSON.stringify(this.template);
    if (before === after) return false;

    if (!transient) {
      this.history.record(this.template);
      this.emit('history');
    }
    this.emit('change');
    return true;
  }

  beginTransient() {
    this._transientBaseline = JSON.stringify(this.template);
  }

  commitTransient() {
    if (this._transientBaseline === null) return false;
    const changed = JSON.stringify(this.template) !== this._transientBaseline;
    this._transientBaseline = null;
    if (changed) {
      this.history.record(this.template);
      this.emit('history');
      return true;
    }
    return false;
  }

  cancelTransient() {
    if (this._transientBaseline !== null) {
      this.template = JSON.parse(this._transientBaseline);
      this._transientBaseline = null;
      this._pruneSelection();
      this.emit('change');
    }
    this.clearOverlay();
  }

  // ---------------------------------------------------------------- Selección

  _setSelection(next) {
    const same =
      next.size === this.selection.size && [...next].every((id) => this.selection.has(id));
    this.selection = next;
    this.emit('selection');
    return !same;
  }

  select(ids, { additive = false } = {}) {
    const next = additive ? new Set(this.selection) : new Set();
    for (const id of ids) {
      if (this.hasElement(id)) next.add(id);
    }
    return this._setSelection(next);
  }

  setSelection(ids) {
    return this._setSelection(new Set(ids.filter((id) => this.hasElement(id))));
  }

  toggleSelection(id) {
    if (!this.hasElement(id)) return false;
    const next = new Set(this.selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return this._setSelection(next);
  }

  clearSelection() {
    if (!this.selection.size) return false;
    return this._setSelection(new Set());
  }

  selectAll() {
    return this._setSelection(new Set(this.template.elements.map((el) => el.id)));
  }

  // --------------------------------------------------------------- Elementos

  addElement(type, options = {}) {
    const element = clampElementToLabel(createCenteredElement(type, this.label, options), this.label);
    this._mutate(() => {
      this.template.elements.push(element);
      this.selection = new Set([element.id]);
    });
    return element;
  }

  updateElement(id, patch, { transient = false, sanitize = true } = {}) {
    return this._mutate(
      () => {
        const element = this.getElement(id);
        if (!element) return;
        Object.assign(element, patch);
        element.rotation = normalizeAngle(element.rotation);
        if (sanitize) Object.assign(element, clampElementToLabel(element, this.label));
      },
      { transient }
    );
  }

  updateSelected(patch, options) {
    if (this.selection.size !== 1) return false;
    const [id] = this.selection;
    return this.updateElement(id, patch, options);
  }

  /** Posiciones ya calculadas (arrastre/alineación). No aplica clamp extra. */
  setPositions(updates, { transient = false } = {}) {
    return this._mutate(
      () => {
        for (const [id, position] of Object.entries(updates)) {
          const element = this.getElement(id);
          if (!element) continue;
          element.x = Number(position.x) || 0;
          element.y = Number(position.y) || 0;
        }
      },
      { transient }
    );
  }

  deleteSelected() {
    if (!this.selection.size) return 0;
    const count = this.selection.size;
    this._mutate(() => {
      this.template.elements = this.template.elements.filter((el) => !this.selection.has(el.id));
      this.selection = new Set();
    });
    return count;
  }

  duplicateSelected(offset = 2) {
    const selected = this.selectedElements;
    if (!selected.length) return 0;
    const newIds = [];

    this._mutate(() => {
      for (const element of selected) {
        const copy = clone(element);
        copy.id = createElementId();
        copy.x += offset;
        copy.y += offset;
        this.template.elements.push(clampElementToLabel(copy, this.label));
        newIds.push(copy.id);
      }
      this.selection = new Set(newIds);
    });

    return newIds.length;
  }

  copySelected() {
    const selected = this.selectedElements;
    this._clipboard = clone(selected);
    return selected.length;
  }

  paste(offset = 2) {
    if (!this._clipboard.length) return 0;
    const newIds = [];

    this._mutate(() => {
      for (const element of this._clipboard) {
        const copy = clone(element);
        copy.id = createElementId();
        copy.x += offset;
        copy.y += offset;
        this.template.elements.push(clampElementToLabel(copy, this.label));
        newIds.push(copy.id);
      }
      this.selection = new Set(newIds);
    });

    return newIds.length;
  }

  reorder(mode) {
    if (!this.selection.size) return false;
    return this._mutate(() => {
      const selected = this.template.elements.filter((el) => this.selection.has(el.id));
      const rest = this.template.elements.filter((el) => !this.selection.has(el.id));
      this.template.elements = mode === 'back' ? [...selected, ...rest] : [...rest, ...selected];
    });
  }

  align(mode) {
    const selected = this.selectedElements;
    if (!selected.length) return false;
    const aligned = alignElements(selected, mode, this.label);

    return this._mutate(() => {
      for (const result of aligned) {
        const element = this.getElement(result.id);
        if (!element) continue;
        element.x = result.x;
        element.y = result.y;
      }
    });
  }

  distribute(axis) {
    if (this.selection.size < 3) return false;
    const distributed = distributeElements(this.selectedElements, axis);

    return this._mutate(() => {
      for (const result of distributed) {
        const element = this.getElement(result.id);
        if (!element) continue;
        element.x = result.x;
        element.y = result.y;
      }
    });
  }

  centerSelected() {
    const selected = this.selectedElements;
    if (!selected.length) return false;

    return this._mutate(() => {
      for (const element of selected) {
        element.x = (this.label.width - element.w) / 2;
        element.y = (this.label.height - element.h) / 2;
      }
    });
  }

  nudge(dx, dy, { large = false } = {}) {
    const selected = this.selectedElements;
    if (!selected.length) return false;

    const step = large ? 5 : 0.5;
    const moved = moveElements(selected, dx * step, dy * step, this.label);

    return this._mutate(() => {
      for (const result of moved) {
        const element = this.getElement(result.id);
        if (!element) continue;
        element.x = result.x;
        element.y = result.y;
      }
    });
  }

  // ------------------------------------------------------------- Etiqueta

  setLabel(patch) {
    const label = this.label;
    const width = clamp(Number(patch.width ?? label.width) || label.width, MIN_LABEL_SIZE, MAX_LABEL_SIZE);
    const height = clamp(
      Number(patch.height ?? label.height) || label.height,
      MIN_LABEL_SIZE,
      MAX_LABEL_SIZE
    );
    const radius = clamp(Number(patch.radius ?? label.radius) || 0, 0, 20);

    return this._mutate(() => {
      label.width = width;
      label.height = height;
      label.radius = radius;
      if (patch.name) this.template.name = patch.name;
      this.template.elements = this.template.elements.map((el) => clampElementToLabel(el, label));
    });
  }

  setPreset(presetKey, orientation = 'landscape') {
    const preset = LABEL_PRESETS[presetKey];
    if (!preset) return false;
    const size = applyOrientation({ width: preset.width, height: preset.height }, orientation);
    return this.setLabel({ ...size, name: preset.name });
  }

  setOrientation(orientation) {
    const size = applyOrientation(this.label, orientation);
    return this.setLabel(size);
  }

  // ---------------------------------------------------------------- Vista

  setZoom(value) {
    const next = clamp(Number(value) || 100, 25, 500);
    if (next === this.zoom) return false;
    this.zoom = next;
    this.emit('view');
    return true;
  }

  zoomBy(delta) {
    return this.setZoom(this.zoom + delta);
  }

  toggleGrid() {
    this.grid.visible = !this.grid.visible;
    this.emit('view');
  }

  toggleRulers() {
    this.rulersVisible = !this.rulersVisible;
    this.emit('view');
  }

  toggleSnap() {
    this.snapEnabled = !this.snapEnabled;
    this.emit('view');
  }

  setGuides(guides) {
    this.overlayGuides = guides || [];
    this.emit('overlay');
  }

  setMarquee(rect) {
    this.marquee = rect;
    this.emit('overlay');
  }

  clearOverlay() {
    const hadOverlay = this.marquee !== null || this.overlayGuides.length > 0;
    this.marquee = null;
    this.overlayGuides = [];
    if (hadOverlay) this.emit('overlay');
  }

  // ------------------------------------------------------- Historial / doc

  undo() {
    const state = this.history.undo();
    if (!state) return false;
    this.template = state;
    this._pruneSelection();
    this.emit('change');
    this.emit('history');
    return true;
  }

  redo() {
    const state = this.history.redo();
    if (!state) return false;
    this.template = state;
    this._pruneSelection();
    this.emit('change');
    this.emit('history');
    return true;
  }

  newTemplate() {
    this.template = defaultTemplate();
    this.selection = new Set();
    this.history.reset(this.template);
    this.emit('change');
    this.emit('history');
  }

  _pruneSelection() {
    const next = new Set([...this.selection].filter((id) => this.hasElement(id)));
    if (next.size !== this.selection.size) this.selection = next;
  }
}
