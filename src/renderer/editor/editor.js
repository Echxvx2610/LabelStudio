/**
 * Orquestador del editor: conecta store, render y eventos de puntero.
 */

import { EditorInteractions } from './interactions.js';
import { EditorRenderer } from './renderer.js';
import { EditorStore } from './store.js';
import { defaultTemplate } from './model.js';
import { clamp, MM_TO_PX } from './geometry.js';

export class Editor {
  constructor() {
    this.store = new EditorStore(defaultTemplate());
    this.renderer = new EditorRenderer({ store: this.store });
    this.interactions = new EditorInteractions({
      store: this.store,
      renderer: this.renderer
    });
    this._unsubscribe = null;
  }

  init() {
    this._unsubscribe = this.store.subscribe((event) => this.renderer.render(event));
    this.interactions.attach();
    this.renderer.render('init');
    this.zoomToFit();

    // Precargar TODAS las fuentes empaquetadas (no solo las ya usadas) para que
    // el ajuste automático mida con las métricas definitivas desde el inicio.
    this.preloadFonts();
  }

  preloadFonts() {
    if (!document.fonts?.load) return;

    const specs = [
      '400 11pt Inter',
      '700 11pt Inter',
      'italic 400 11pt Inter',
      'italic 700 11pt Inter',
      '400 11pt "Roboto Mono"',
      '700 11pt "Roboto Mono"'
    ];

    Promise.allSettled(specs.map((spec) => document.fonts.load(spec)))
      .then(() => this.renderer.refreshFonts())
      .catch(() => {});
  }

  zoomToFit() {
    const viewport = this.renderer.viewport;
    if (!viewport || !viewport.clientWidth) return;
    const { width, height } = this.store.label;
    const availableWidth = Math.max(1, viewport.clientWidth - 80);
    const availableHeight = Math.max(1, viewport.clientHeight - 80);
    const scale = Math.min(
      availableWidth / (width * MM_TO_PX),
      availableHeight / (height * MM_TO_PX)
    );
    this.store.setZoom(clamp(Math.round(scale * 100), 50, 300));
    requestAnimationFrame(() => this.centerView());
  }

  centerView() {
    const viewport = this.renderer.viewport;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
    this.renderer.updateRulers();
  }

  insert(type) {
    return this.store.addElement(type);
  }

  setZoom(value) {
    return this.store.setZoom(value);
  }

  zoomBy(delta) {
    return this.store.zoomBy(delta);
  }

  undo() {
    return this.store.undo();
  }

  redo() {
    return this.store.redo();
  }

  copy() {
    return this.store.copySelected();
  }

  paste() {
    return this.store.paste();
  }

  duplicate() {
    return this.store.duplicateSelected();
  }

  deleteSelected() {
    return this.store.deleteSelected();
  }

  selectAll() {
    return this.store.selectAll();
  }

  nudge(dx, dy, options) {
    return this.store.nudge(dx, dy, options);
  }

  reorder(mode) {
    return this.store.reorder(mode);
  }

  align(mode) {
    return this.store.align(mode);
  }

  distribute(axis) {
    return this.store.distribute(axis);
  }

  centerSelected() {
    return this.store.centerSelected();
  }

  updateSelected(patch, options) {
    return this.store.updateSelected(patch, options);
  }

  setLabel(patch) {
    return this.store.setLabel(patch);
  }

  setPreset(key, orientation) {
    return this.store.setPreset(key, orientation);
  }

  setOrientation(orientation) {
    return this.store.setOrientation(orientation);
  }

  toggleGrid() {
    this.store.toggleGrid();
  }

  toggleRulers() {
    this.store.toggleRulers();
  }

  toggleSnap() {
    this.store.toggleSnap();
  }

  newTemplate() {
    this.store.newTemplate();
    this.zoomToFit();
  }

  cancel() {
    this.interactions.cancel();
    this.store.clearSelection();
  }

  dispose() {
    if (this._unsubscribe) this._unsubscribe();
  }
}
