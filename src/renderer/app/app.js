/**
 * Label Studio - Shell de la Aplicación (Fase 2)
 */

import { setupMenubar } from './menubar.js';
import { setupSidebar } from './sidebar.js';
import { setupSplitters } from './splitters.js';
import { shortcutManager } from './shortcuts.js';
import { modal } from './modal.js';

class App {
  constructor() {
    this.zoomLevel = 100;
  }

  async init() {
    console.log('Inicializando Label Studio...');

    // 1. Inicializar divisores y paneles
    setupSplitters();
    setupSidebar();
    this.initShortcuts();

    // 2. Inicializar barra de menú y acciones
    setupMenubar((action) => this.handleMenuAction(action));

    // 3. Conexión IPC con Electron
    await this.checkIPC();

    // 4. Inicializar botones de toolbar
    this.initToolbars();

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
    // Zoom in / out / reset
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.adjustZoom(10));
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.adjustZoom(-10));
    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => this.setZoom(100));

    // Botones de inserción de elementos
    const insertButtons = document.querySelectorAll('[data-insert]');
    insertButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-insert');
        this.notify(`Insertar elemento: ${type} (Disponible en Fase 3 y 4)`);
      });
    });

    // Botones de acción rápida
    document.getElementById('btn-quick-print')?.addEventListener('click', () => {
      this.handleMenuAction('print');
    });
  }

  adjustZoom(delta) {
    this.setZoom(this.zoomLevel + delta);
  }

  setZoom(val) {
    this.zoomLevel = Math.max(25, Math.min(val, 500));
    const label = document.getElementById('zoom-percentage');
    const statusZoom = document.getElementById('status-zoom');
    if (label) label.textContent = `${this.zoomLevel}%`;
    if (statusZoom) statusZoom.textContent = `${this.zoomLevel}%`;

    const preview = document.getElementById('label-preview-container');
    if (preview) {
      preview.style.transform = `scale(${this.zoomLevel / 100})`;
      preview.style.transformOrigin = 'center center';
    }
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
    shortcutManager.register('Ctrl+Shift+S', () => this.handleMenuAction('save-as'), 'Guardar como...');
    shortcutManager.register('Ctrl+P', () => this.handleMenuAction('preview'), 'Vista previa / Imprimir');
    shortcutManager.register('Ctrl+Z', () => this.handleMenuAction('undo'), 'Deshacer');
    shortcutManager.register('Ctrl+Y', () => this.handleMenuAction('redo'), 'Rehacer');
    shortcutManager.register('Ctrl++', () => this.adjustZoom(10), 'Aumentar zoom');
    shortcutManager.register('Ctrl+-', () => this.adjustZoom(-10), 'Disminuir zoom');
    shortcutManager.register('Ctrl+0', () => this.setZoom(100), 'Restablecer zoom a 100%');
    shortcutManager.register('F1', () => this.showHelpModal(), 'Ver atajos de teclado');
  }

  handleMenuAction(action) {
    switch (action) {
      case 'new':
        this.notify('Acción: Nueva plantilla');
        break;
      case 'open':
        this.notify('Acción: Abrir plantilla (Fase 9)');
        break;
      case 'save':
        this.notify('Acción: Guardar plantilla (Fase 9)');
        break;
      case 'save-as':
        this.notify('Acción: Guardar plantilla como...');
        break;
      case 'import-data':
        this.notify('Acción: Importar CSV/Excel (Fase 8)');
        break;
      case 'export':
        this.notify('Acción: Exportar PDF/PNG/SVG');
        break;
      case 'exit':
        if (window.close) window.close();
        break;
      case 'undo':
        this.notify('Deshacer (Fase 3)');
        break;
      case 'redo':
        this.notify('Rehacer (Fase 3)');
        break;
      case 'zoom-in':
        this.adjustZoom(10);
        break;
      case 'zoom-out':
        this.adjustZoom(-10);
        break;
      case 'zoom-reset':
        this.setZoom(100);
        break;
      case 'toggle-grid': {
        const vp = document.getElementById('canvas-viewport');
        vp?.classList.toggle('no-grid');
        this.notify('Cuadrícula alternada');
        break;
      }
      case 'preview':
      case 'print':
        this.notify('Impresión y Vista previa (Fases 6 y 7)');
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
          <p><strong>Versión:</strong> 0.1.0 (Fase 2: Shell de UI y Sistema de Diseño)</p>
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
