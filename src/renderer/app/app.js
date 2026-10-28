/**
 * Label Studio - Shell de la Aplicación
 * Integra la UI (Fase 2) con el núcleo del editor (Fase 3).
 */

import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-400-italic.css';
import '@fontsource/inter/latin-700-italic.css';
import '@fontsource/roboto-mono/latin-400.css';
import '@fontsource/roboto-mono/latin-700.css';

import { setupMenubar } from './menubar.js';
import { setupSidebar } from './sidebar.js';
import { setupSplitters } from './splitters.js';
import { shortcutManager } from './shortcuts.js';
import { modal } from './modal.js';
import { PropertiesPanel } from './properties-panel.js';
import { Editor } from '../editor/editor.js';
import { LABEL_PRESETS } from '../editor/model.js';

class App {
  constructor() {
    this.editor = null;
    this.properties = null;
    this._notifyTimer = null;
  }

  async init() {
    console.log('Inicializando Label Studio...');

    // 1. Inicializar divisores y paneles
    setupSplitters();
    setupSidebar();

    // 2. Crear el editor antes de conectar la UI
    this.editor = new Editor();
    this.editor.init();

    // 3. Panel dinámico por tipo de elemento + panel de etiqueta
    this.properties = new PropertiesPanel({
      editor: this.editor,
      notify: (message) => this.notify(message)
    });
    this.initProperties();
    this.initShortcuts();

    // 4. Inicializar barra de menú y acciones
    setupMenubar((action) => this.handleMenuAction(action));

    // 5. Conexión IPC con Electron
    await this.checkIPC();

    // 6. Botones de toolbar y sincronización inicial
    this.initToolbars();
    this.editor.store.subscribe(() => {
      this.syncPanel();
      this.properties.update();
    });
    this.syncPanel();
    this.properties.update();

    console.log('Label Studio listo');
  }

  async checkIPC() {
    const statusText = document.getElementById('status-ipc-text');
    const statusDot = document.getElementById('status-ipc-dot');

    if (window.electronAPI) {
      try {
        const pong = await window.electronAPI.ping();
        const info = await window.electronAPI.getAppInfo();
        if (statusText) statusText.textContent = `Electron v${info.version || '0.1.0'} (${pong})`;
        if (statusDot) statusDot.style.backgroundColor = '#2ec4b6';
      } catch {
        if (statusText) statusText.textContent = 'IPC Error';
        if (statusDot) statusDot.style.backgroundColor = '#e5383b';
      }
    } else {
      if (statusText) statusText.textContent = 'Modo Navegador Web';
      if (statusDot) statusDot.style.backgroundColor = '#ba181b';
    }
  }

  initToolbars() {
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.editor.zoomBy(10));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.editor.zoomBy(-10));
    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => this.editor.setZoom(100));
    document.getElementById('btn-zoom-fit')?.addEventListener('click', () => this.editor.zoomToFit());
    document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());

    document.querySelectorAll('[data-insert]').forEach((btn) => {
      btn.addEventListener('click', () => this.insertElement(btn.getAttribute('data-insert')));
    });

    document.getElementById('btn-quick-print')?.addEventListener('click', () => {
      this.handleMenuAction('print');
    });
  }

  initProperties() {
    const $ = (id) => document.getElementById(id);
    const editor = this.editor;

    $('preset-selector')?.addEventListener('change', (event) => {
      const key = event.target.value;
      if (key === 'custom') return;
      const orientation = $('label-orientation')?.value || 'landscape';
      editor.setPreset(key, orientation);
      editor.zoomToFit();
    });

    $('label-width')?.addEventListener('change', (event) => {
      editor.setLabel({ width: Number(event.target.value) });
    });
    $('label-height')?.addEventListener('change', (event) => {
      editor.setLabel({ height: Number(event.target.value) });
    });
    $('label-radius')?.addEventListener('change', (event) => {
      editor.setLabel({ radius: Number(event.target.value) });
    });
    $('label-orientation')?.addEventListener('change', (event) => {
      editor.setOrientation(event.target.value);
    });

    const bindElementInput = (id, prop) => {
      $(id)?.addEventListener('change', (event) => {
        const value = Number(event.target.value);
        if (!Number.isFinite(value)) return;
        editor.updateSelected({ [prop]: value });
      });
    };
    bindElementInput('elem-x', 'x');
    bindElementInput('elem-y', 'y');
    bindElementInput('elem-w', 'w');
    bindElementInput('elem-h', 'h');
    bindElementInput('elem-rot', 'rotation');

    $('btn-layer-front')?.addEventListener('click', () => editor.reorder('front'));
    $('btn-layer-back')?.addEventListener('click', () => editor.reorder('back'));
    $('btn-center')?.addEventListener('click', () => editor.centerSelected());

    document.querySelectorAll('[data-align]').forEach((button) => {
      button.addEventListener('click', () => editor.align(button.dataset.align));
    });
    document.querySelectorAll('[data-distribute]').forEach((button) => {
      button.addEventListener('click', () => editor.distribute(button.dataset.distribute));
    });
  }

  setInputValue(id, value) {
    const input = document.getElementById(id);
    if (!input || document.activeElement === input) return;
    input.value = Number(Number(value).toFixed(2));
  }

  syncPanel() {
    if (!this.editor) return;
    const { store } = this.editor;
    const { template } = store;
    const label = template.label;
    const selected = store.selectedElements;
    const single = selected.length === 1 ? selected[0] : null;

    this.setInputValue('label-width', label.width);
    this.setInputValue('label-height', label.height);
    this.setInputValue('label-radius', label.radius);

    const orientation = document.getElementById('label-orientation');
    if (orientation && document.activeElement !== orientation) {
      orientation.value = label.height > label.width ? 'portrait' : 'landscape';
    }

    const preset = document.getElementById('preset-selector');
    if (preset && document.activeElement !== preset) {
      preset.value = this.detectPreset(label) || 'custom';
    }

    const fields = [
      ['elem-x', single ? single.x : null],
      ['elem-y', single ? single.y : null],
      ['elem-w', single ? single.w : null],
      ['elem-h', single ? single.h : null],
      ['elem-rot', single ? single.rotation : null]
    ];
    for (const [id, value] of fields) {
      const input = document.getElementById(id);
      if (!input) continue;
      input.disabled = !single;
      if (single && document.activeElement !== input) {
        input.value = Number(Number(value).toFixed(2));
      }
      if (!single) input.value = '';
    }

    const zoomText = `${Math.round(store.zoom)}%`;
    const zoomLabel = document.getElementById('zoom-percentage');
    const statusZoom = document.getElementById('status-zoom');
    if (zoomLabel) zoomLabel.textContent = zoomText;
    if (statusZoom) statusZoom.textContent = zoomText;

    const statusTemplate = document.getElementById('status-template');
    if (statusTemplate) {
      statusTemplate.textContent = `${template.name} (${label.width} × ${label.height} mm)`;
    }

    const hasSelection = store.selectedCount > 0;
    for (const id of ['btn-layer-front', 'btn-layer-back', 'btn-center']) {
      const button = document.getElementById(id);
      if (button) button.disabled = !hasSelection;
    }
    document.querySelectorAll('[data-align]').forEach((button) => {
      button.disabled = !hasSelection;
    });
    document.querySelectorAll('[data-distribute]').forEach((button) => {
      button.disabled = store.selectedCount < 3;
    });

    const undoButton = document.getElementById('btn-undo');
    const redoButton = document.getElementById('btn-redo');
    if (undoButton) undoButton.disabled = !store.canUndo();
    if (redoButton) redoButton.disabled = !store.canRedo();
  }

  detectPreset(label) {
    for (const [key, preset] of Object.entries(LABEL_PRESETS)) {
      const matches =
        (preset.width === label.width && preset.height === label.height) ||
        (preset.width === label.height && preset.height === label.width);
      if (matches) return key;
    }
    return null;
  }

  insertElement(type) {
    const labels = {
      text: 'Texto',
      qr: 'Código QR',
      barcode: 'Código de barras',
      image: 'Imagen',
      rect: 'Rectángulo',
      line: 'Línea',
      ellipse: 'Elipse'
    };
    this.editor.insert(type);
    this.notify(`Insertado: ${labels[type] || type}`);

    // Al insertar una imagen, abrir directamente el selector de archivo.
    if (type === 'image') this.properties?.pickImage();
  }

  undo() {
    if (!this.editor.undo()) this.notify('Nada que deshacer');
  }

  redo() {
    if (!this.editor.redo()) this.notify('Nada que rehacer');
  }

  copySelection() {
    const count = this.editor.copy();
    this.notify(count ? `${count} elemento(s) copiado(s)` : 'Nada seleccionado para copiar');
  }

  pasteSelection() {
    const count = this.editor.paste();
    this.notify(count ? `${count} elemento(s) pegado(s)` : 'El portapapeles está vacío');
  }

  notify(message) {
    const notifyEl = document.getElementById('toast-notification');
    if (!notifyEl) return;
    notifyEl.textContent = message;
    notifyEl.classList.add('visible');
    clearTimeout(this._notifyTimer);
    this._notifyTimer = setTimeout(() => {
      notifyEl.classList.remove('visible');
    }, 3000);
  }

  initShortcuts() {
    shortcutManager.register('Ctrl+N', () => this.handleMenuAction('new'), 'Crear nueva plantilla');
    shortcutManager.register('Ctrl+O', () => this.handleMenuAction('open'), 'Abrir plantilla');
    shortcutManager.register('Ctrl+S', () => this.handleMenuAction('save'), 'Guardar plantilla');
    shortcutManager.register(
      'Ctrl+Shift+S',
      () => this.handleMenuAction('save-as'),
      'Guardar como...'
    );
    shortcutManager.register('Ctrl+P', () => this.handleMenuAction('preview'), 'Vista previa');
    shortcutManager.register('Ctrl+Z', () => this.undo(), 'Deshacer');
    shortcutManager.register('Ctrl+Y', () => this.redo(), 'Rehacer');
    shortcutManager.register('Ctrl+Shift+Z', () => this.redo(), 'Rehacer (alternativo)');
    shortcutManager.register('Ctrl+C', () => this.copySelection(), 'Copiar elementos');
    shortcutManager.register('Ctrl+V', () => this.pasteSelection(), 'Pegar elementos');
    shortcutManager.register('Ctrl+D', () => this.editor.duplicate(), 'Duplicar selección');
    shortcutManager.register('Ctrl+A', () => this.editor.selectAll(), 'Seleccionar todo');
    shortcutManager.register(
      'Delete',
      () => this.editor.deleteSelected(),
      'Eliminar selección'
    );
    shortcutManager.register(
      'Backspace',
      () => this.editor.deleteSelected(),
      'Eliminar selección'
    );
    shortcutManager.register('Escape', () => this.editor.cancel(), 'Cancelar / deseleccionar');

    shortcutManager.register(
      'ArrowLeft',
      () => this.editor.nudge(-1, 0),
      'Mover 0.5 mm a la izquierda'
    );
    shortcutManager.register(
      'ArrowRight',
      () => this.editor.nudge(1, 0),
      'Mover 0.5 mm a la derecha'
    );
    shortcutManager.register('ArrowUp', () => this.editor.nudge(0, -1), 'Mover 0.5 mm arriba');
    shortcutManager.register('ArrowDown', () => this.editor.nudge(0, 1), 'Mover 0.5 mm abajo');
    shortcutManager.register(
      'Shift+ArrowLeft',
      () => this.editor.nudge(-1, 0, { large: true }),
      'Mover 5 mm a la izquierda'
    );
    shortcutManager.register(
      'Shift+ArrowRight',
      () => this.editor.nudge(1, 0, { large: true }),
      'Mover 5 mm a la derecha'
    );
    shortcutManager.register(
      'Shift+ArrowUp',
      () => this.editor.nudge(0, -1, { large: true }),
      'Mover 5 mm arriba'
    );
    shortcutManager.register(
      'Shift+ArrowDown',
      () => this.editor.nudge(0, 1, { large: true }),
      'Mover 5 mm abajo'
    );

    shortcutManager.register('Ctrl++', () => this.editor.zoomBy(10), 'Aumentar zoom');
    shortcutManager.register('Ctrl+-', () => this.editor.zoomBy(-10), 'Disminuir zoom');
    shortcutManager.register('Ctrl+0', () => this.editor.setZoom(100), 'Zoom al 100%');
    shortcutManager.register('F1', () => this.showHelpModal(), 'Ver atajos de teclado');
  }

  handleMenuAction(action) {
    switch (action) {
      case 'new':
        this.editor.newTemplate();
        this.notify('Nueva plantilla creada');
        break;
      case 'open':
        this.notify('Acción: Abrir plantilla (Fase 9)');
        break;
      case 'save':
      case 'save-as':
        this.notify('Acción: Guardar plantilla (Fase 9)');
        break;
      case 'import-data':
        this.notify('Acción: Importar CSV/Excel (Fase 8)');
        break;
      case 'export':
        this.notify('Acción: Exportar PDF/PNG/SVG (Fase 9)');
        break;
      case 'exit':
        if (window.close) window.close();
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'copy':
        this.copySelection();
        break;
      case 'paste':
        this.pasteSelection();
        break;
      case 'duplicate':
        this.editor.duplicate();
        break;
      case 'delete':
        this.editor.deleteSelected();
        break;
      case 'select-all':
        this.editor.selectAll();
        break;
      case 'insert-text':
        this.insertElement('text');
        break;
      case 'insert-qr':
        this.insertElement('qr');
        break;
      case 'insert-barcode':
        this.insertElement('barcode');
        break;
      case 'insert-image':
        this.insertElement('image');
        break;
      case 'insert-rect':
        this.insertElement('rect');
        break;
      case 'insert-line':
        this.insertElement('line');
        break;
      case 'insert-variable':
        this.notify('Campos variables disponibles en Fase 5');
        break;
      case 'zoom-in':
        this.editor.zoomBy(10);
        break;
      case 'zoom-out':
        this.editor.zoomBy(-10);
        break;
      case 'zoom-reset':
        this.editor.setZoom(100);
        break;
      case 'zoom-fit':
        this.editor.zoomToFit();
        break;
      case 'toggle-grid':
        this.editor.toggleGrid();
        this.notify(`Cuadrícula ${this.editor.store.grid.visible ? 'activada' : 'desactivada'}`);
        break;
      case 'toggle-rulers':
        this.editor.toggleRulers();
        this.notify(
          `Reglas ${this.editor.store.rulersVisible ? 'visibles' : 'ocultas'}`
        );
        break;
      case 'toggle-guides':
        this.editor.toggleSnap();
        this.notify(
          `Ajuste magnético ${this.editor.store.snapEnabled ? 'activado' : 'desactivado'}`
        );
        break;
      case 'config-sheet':
        this.notify('Configuración de matriz (Fase 6)');
        break;
      case 'preview':
      case 'print':
        this.notify('Impresión y Vista previa (Fases 6 y 7)');
        break;
      case 'printers':
        this.notify('Gestión de impresoras (Fase 7)');
        break;
      case 'shortcuts':
      case 'help':
        this.showHelpModal();
        break;
      case 'about':
        this.showAboutModal();
        break;
      default:
        this.notify(`Acción: ${action}`);
    }
  }

  showHelpModal() {
    const shortcuts = shortcutManager.getAll();
    const rows = shortcuts
      .map(
        (s) => `
      <tr>
        <td><span class="kbd-badge">${s.combo}</span></td>
        <td>${s.description}</td>
      </tr>
    `
      )
      .join('');

    const content = `
      <p style="margin-bottom: 12px; color: var(--text-secondary);">
        Atajos de teclado rápidos para acelerar el diseño de tus etiquetas:
      </p>
      <table class="shortcuts-table">
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;

    modal.open({
      title: 'Atajos de Teclado',
      content
    });
  }

  showAboutModal() {
    const content = `
      <div style="text-align: center; padding: 12px 0;">
        <h2 style="color: var(--accent); margin-bottom: 6px;">Label Studio</h2>
        <p style="font-size: 13px; color: var(--ink-soft); margin-bottom: 14px;">
          Editor y generador de etiquetas de escritorio con edición vectorial SVG,
          matriz de impresión, seriales autoincrementables e impresión directa.
        </p>
        <div style="font-size: 11px; color: var(--text-muted); line-height: 1.6;">
          <p><strong>Arquitectura:</strong> Electron + ES Modules + CSS Puro</p>
          <p><strong>Motor de Códigos:</strong> bwip-js (SVG)</p>
          <p><strong>Versión:</strong> 0.1.0 (Fase 4: Elementos de etiqueta)</p>
        </div>
      </div>
    `;

    modal.open({
      title: 'Acerca de Label Studio',
      content
    });
  }
}

// Arrancar la app al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
