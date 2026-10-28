/**
 * Gestor de atajos de teclado centralizado
 */

export class ShortcutManager {
  constructor() {
    this.shortcuts = new Map();
    this.initListener();
  }

  /**
   * Normaliza la combinación de teclas en un identificador estándar
   * Ej: "Ctrl+Shift+S", "Ctrl+Z", "F1", "Delete"
   */
  normalizeKeyCombo(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    let key = e.key;
    if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') {
      return '';
    }

    if (key === '=') key = '+';
    // En teclados US, "+" requiere Shift: no lo tratamos como modificador
    if (key === '+' && parts.includes('Shift')) {
      parts.splice(parts.indexOf('Shift'), 1);
    }
    if (key.length === 1) {
      key = key.toUpperCase();
    }

    parts.push(key);
    return parts.join('+');
  }

  register(combo, callback, description = '') {
    this.shortcuts.set(combo, { callback, description });
  }

  unregister(combo) {
    this.shortcuts.delete(combo);
  }

  getAll() {
    const list = [];
    for (const [combo, item] of this.shortcuts.entries()) {
      list.push({ combo, description: item.description });
    }
    return list;
  }

  initListener() {
    window.addEventListener('keydown', (e) => {
      // Don't intercept shortcuts when user is typing in an input or textarea unless it's Esc or special
      const target = e.target;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      
      const combo = this.normalizeKeyCombo(e);
      if (!combo) return;

      // Escritura en campos: solo se permiten atajos globales seguros (guardar/ayuda)
      const inputAllowed =
        combo === 'Escape' ||
        combo === 'Ctrl+S' ||
        combo === 'Ctrl+Shift+S' ||
        combo === 'F1';
      if (isInput && !inputAllowed) {
        return;
      }

      const registered = this.shortcuts.get(combo);
      if (registered) {
        e.preventDefault();
        registered.callback(e);
      }
    });
  }
}

export const shortcutManager = new ShortcutManager();

