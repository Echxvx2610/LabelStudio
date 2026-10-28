/**
 * Panel de propiedades dinámico según el tipo de elemento seleccionado.
 * Toda escritura pasa por EditorStore (a través de la fachada Editor), de modo
 * que undo/redo y el re-render del lienzo se mantienen sincronizados.
 */

import {
  QR_ERROR_LEVELS,
  SYMBOLOGIES,
  assessCodeReadability,
  getSymbology,
  validateElementContent
} from '../editor/element-validation.js';
import { generateCode } from '../editor/barcodes.js';
import { FONT_OPTIONS } from '../editor/model.js';
import { resolvePreviewText } from '../data/preview.js';

const ALIGN_OPTIONS = [
  { id: 'left', label: 'Izquierda' },
  { id: 'center', label: 'Centro' },
  { id: 'right', label: 'Derecha' }
];

const FIT_OPTIONS = [
  { id: 'contain', label: 'Ajustar (contener)' },
  { id: 'cover', label: 'Recortar (cubrir)' },
  { id: 'fill', label: 'Estirar' }
];

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function optionList(items, selected) {
  return items
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}"${
          item.id === selected ? ' selected' : ''
        }>${escapeHtml(item.label)}</option>`
    )
    .join('');
}

function numberInput(prop, value, { step = 0.5, min = 0, max = 999, unit = 'mm' } = {}) {
  return `<div class="input-unit-wrapper">
      <input type="number" data-prop="${prop}" data-number="true" data-live="true" value="${escapeHtml(
        value
      )}" step="${step}" min="${min}" max="${max}">
      <span class="input-unit-tag">${escapeHtml(unit)}</span>
    </div>`;
}

function colorInput(prop, value, fallback = '#ffffff') {
  const current = /^#[0-9a-f]{6}$/i.test(String(value)) ? value : fallback;
  return `<input type="color" class="input-color" data-prop="${prop}" data-fallback="${fallback}" value="${current}">`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function imageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('La imagen no se pudo cargar.'));
    image.src = src;
  });
}

export class PropertiesPanel {
  constructor({ editor, notify = () => {} }) {
    this.editor = editor;
    this.notify = notify;
    this.container = document.getElementById('element-props');
    this.currentId = null;
    this.currentType = null;
    this.editing = false;

    if (this.container) this.bindEvents();
  }

  get store() {
    return this.editor.store;
  }

  get selected() {
    const items = this.store.selectedElements;
    return items.length === 1 ? items[0] : null;
  }

  bindEvents() {
    this.container.addEventListener('focusin', (event) => {
      if (!event.target.matches('[data-live]')) return;
      this.editing = true;
      this.store.beginTransient();
    });

    this.container.addEventListener('focusout', (event) => {
      if (!event.target.matches('[data-live]') || !this.editing) return;
      this.editing = false;
      this.store.commitTransient();
    });

    this.container.addEventListener('input', (event) => {
      const target = event.target;
      if (!this.editing || !target.matches('[data-live]')) return;
      this.applyValue(target, { transient: true });
    });

    this.container.addEventListener('change', (event) => {
      const target = event.target;
      if (target.matches('[data-image-file]')) {
        this.loadImage(target.files?.[0]);
        target.value = '';
        return;
      }
      if (target.matches('[data-image-remove]')) return;
      this.applyValue(target, { transient: false });
    });

    this.container.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-image-remove]');
      if (remove) {
        this.editor.updateSelected({ src: '' });
        this.notify('Imagen quitada del elemento');
      }
    });
  }

  update() {
    if (!this.container) return;
    const selected = this.store.selectedElements;

    if (selected.length !== 1) {
      this.currentId = null;
      this.currentType = null;
      this.editing = false;
      this.container.innerHTML = `<div class="prop-empty">${
        selected.length
          ? `${selected.length} elementos seleccionados. Selecciona uno solo para editar contenido y estilo.`
          : 'Selecciona un elemento del lienzo para editar su contenido y estilo.'
      }</div>`;
      return;
    }

    const element = selected[0];
    if (element.id !== this.currentId || element.type !== this.currentType) {
      this.currentId = element.id;
      this.currentType = element.type;
      this.editing = false;
      this.container.innerHTML = this.build(element);
    }

    this.sync(element);
  }

  build(element) {
    let body = '';
    switch (element.type) {
      case 'text':
        body = this.buildText();
        break;
      case 'qr':
        body = this.buildQr();
        break;
      case 'barcode':
        body = this.buildBarcode();
        break;
      case 'image':
        body = this.buildImage();
        break;
      case 'line':
        body = this.buildLine();
        break;
      case 'ellipse':
        body = this.buildEllipse();
        break;
      case 'rect':
      default:
        body = this.buildRect();
        break;
    }
    return `${body}<div class="prop-validation" data-validation></div>`;
  }

  buildText() {
    return `<div class="prop-group">
      <div class="prop-group-title">Texto</div>
      <label class="form-label">Contenido</label>
      <textarea class="input-text prop-textarea" data-prop="content" data-live="true" rows="3" spellcheck="false"
        placeholder="Escribe el texto o una variable"></textarea>
      <div class="prop-hint">Variables: {{serial}}, {{prefijo}}, {{fecha:DD/MM/YYYY}}, {{hora}}</div>
      <div class="form-row">
        <div class="form-col">
          <label class="form-label">Fuente</label>
          <select class="input-select" data-prop="font">${optionList(FONT_OPTIONS, 'Inter')}</select>
        </div>
        <div class="form-col">
          <label class="form-label">Tamaño</label>
          ${numberInput('size', 11, { step: 0.5, min: 4, max: 72, unit: 'pt' })}
        </div>
      </div>
      <div class="form-row">
        <div class="form-col">
          <label class="form-label">Alineación</label>
          <select class="input-select" data-prop="align">${optionList(ALIGN_OPTIONS, 'left')}</select>
        </div>
        <div class="form-col">
          <label class="form-label">Interlineado</label>
          ${numberInput('lineHeight', 1.2, { step: 0.1, min: 0.8, max: 3, unit: '×' })}
        </div>
      </div>
      <div class="prop-row prop-row-wrap">
        <label class="prop-check"><input type="checkbox" data-prop="bold"> Negrita</label>
        <label class="prop-check"><input type="checkbox" data-prop="italic"> Cursiva</label>
        <label class="prop-check"><input type="checkbox" data-prop="autoFit"> Ajustar a la caja</label>
      </div>
      <div class="input-color-row">
        ${colorInput('color', '#0b090a')}
        <span class="prop-hint">Color del texto</span>
      </div>
    </div>`;
  }

  buildQr() {
    return `<div class="prop-group">
      <div class="prop-group-title">Código QR</div>
      <label class="form-label">Contenido</label>
      <textarea class="input-text prop-textarea" data-prop="content" data-live="true" rows="2" spellcheck="false"
        placeholder="Texto o variable, por ejemplo {{serial}}"></textarea>
      <div class="prop-hint">Puedes combinar texto fijo y variables.</div>
      <div class="form-row">
        <div class="form-col">
          <label class="form-label">Corrección de errores</label>
          <select class="input-select" data-prop="errorLevel">${optionList(
            QR_ERROR_LEVELS,
            'M'
          )}</select>
        </div>
        <div class="form-col">
          <label class="form-label">Margen (quiet zone)</label>
          ${numberInput('quietZone', 1, { step: 0.25, min: 0, max: 20, unit: 'mm' })}
        </div>
      </div>
      <div class="input-color-row">
        ${colorInput('color', '#0b090a')}
        <span class="prop-hint">Color de los módulos</span>
      </div>
    </div>`;
  }

  buildBarcode() {
    return `<div class="prop-group">
      <div class="prop-group-title">Código de barras</div>
      <label class="form-label">Contenido</label>
      <input type="text" class="input-text" data-prop="content" data-live="true" spellcheck="false">
      <div class="prop-hint" data-symbology-hint></div>
      <div class="form-row">
        <div class="form-col">
          <label class="form-label">Simbología</label>
          <select class="input-select" data-prop="symbology">${optionList(
            SYMBOLOGIES,
            'code128'
          )}</select>
        </div>
        <div class="form-col">
          <label class="form-label">Margen</label>
          ${numberInput('quietZone', 1, { step: 0.25, min: 0, max: 20, unit: 'mm' })}
        </div>
      </div>
      <div class="prop-row">
        <label class="prop-check"><input type="checkbox" data-prop="showText"> Mostrar texto legible</label>
      </div>
      <div class="input-color-row">
        ${colorInput('color', '#0b090a')}
        <span class="prop-hint">Color de las barras</span>
      </div>
    </div>`;
  }

  buildImage() {
    return `<div class="prop-group">
      <div class="prop-group-title">Imagen / Logo</div>
      <div class="prop-image-preview"><img data-image-preview alt="Vista previa de la imagen"></div>
      <input type="file" class="input-file" data-image-file accept="image/png,image/jpeg,image/webp,image/svg+xml">
      <div class="prop-hint">PNG, JPG, WEBP o SVG. Se embebe en base64 dentro de la plantilla (máx. 4 MB).</div>
      <div class="form-row">
        <div class="form-col">
          <label class="form-label">Ajuste</label>
          <select class="input-select" data-prop="fit">${optionList(FIT_OPTIONS, 'contain')}</select>
        </div>
        <div class="form-col prop-col-action">
          <label class="form-label">&nbsp;</label>
          <button class="btn btn-secondary" type="button" data-image-remove>Quitar imagen</button>
        </div>
      </div>
    </div>`;
  }

  buildLine() {
    return `<div class="prop-group">
      <div class="prop-group-title">Línea</div>
      <div class="form-row">
        <div class="form-col">
          <label class="form-label">Color</label>
          <div class="input-color-row">${colorInput('stroke', '#0b090a')}</div>
        </div>
        <div class="form-col">
          <label class="form-label">Grosor</label>
          ${numberInput('strokeWidth', 0.3, { step: 0.1, min: 0.05, max: 5, unit: 'mm' })}
        </div>
      </div>
    </div>`;
  }

  buildEllipse() {
    return `<div class="prop-group">
      <div class="prop-group-title">Elipse</div>
      <div class="form-row">
        <div class="form-col">
          <label class="form-label">Relleno</label>
          <div class="input-color-row">
            ${colorInput('fill', '#ffffff')}
            <label class="prop-check"><input type="checkbox" data-none-for="fill"> Sin relleno</label>
          </div>
        </div>
        <div class="form-col">
          <label class="form-label">Borde</label>
          <div class="input-color-row">${colorInput('stroke', '#0b090a')}</div>
        </div>
      </div>
      <div class="form-col">
        <label class="form-label">Grosor del borde</label>
        ${numberInput('strokeWidth', 0.3, { step: 0.1, min: 0.05, max: 5, unit: 'mm' })}
      </div>
    </div>`;
  }

  buildRect() {
    return `<div class="prop-group">
      <div class="prop-group-title">Rectángulo</div>
      <div class="form-row">
        <div class="form-col">
          <label class="form-label">Relleno</label>
          <div class="input-color-row">
            ${colorInput('fill', '#ffffff')}
            <label class="prop-check"><input type="checkbox" data-none-for="fill"> Sin relleno</label>
          </div>
        </div>
        <div class="form-col">
          <label class="form-label">Borde</label>
          <div class="input-color-row">${colorInput('stroke', '#0b090a')}</div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-col">
          <label class="form-label">Grosor del borde</label>
          ${numberInput('strokeWidth', 0.3, { step: 0.1, min: 0.05, max: 5, unit: 'mm' })}
        </div>
        <div class="form-col">
          <label class="form-label">Radio de esquinas</label>
          ${numberInput('radius', 1, { step: 0.25, min: 0, max: 50, unit: 'mm' })}
        </div>
      </div>
    </div>`;
  }

  sync(element) {
    if (!this.container) return;

    for (const input of this.container.querySelectorAll('[data-prop]')) {
      const prop = input.dataset.prop;
      const value = element[prop];
      const isCheckbox = input.type === 'checkbox';
      if (document.activeElement === input) continue;

      if (isCheckbox) {
        input.checked = Boolean(value);
      } else if (input.type === 'color') {
        input.value = /^#[0-9a-f]{6}$/i.test(String(value)) ? value : input.dataset.fallback || '#ffffff';
      } else {
        input.value = value ?? '';
      }
    }

    for (const checkbox of this.container.querySelectorAll('[data-none-for]')) {
      const prop = checkbox.dataset.noneFor;
      if (document.activeElement !== checkbox) checkbox.checked = element[prop] === 'none';
    }

    const hint = this.container.querySelector('[data-symbology-hint]');
    if (hint) hint.textContent = getSymbology(element.symbology).hint;

    const preview = this.container.querySelector('[data-image-preview]');
    if (preview) {
      if (element.src) {
        preview.src = element.src;
        preview.classList.add('visible');
      } else {
        preview.removeAttribute('src');
        preview.classList.remove('visible');
      }
    }

    this.renderValidation(element);
  }

  renderValidation(element) {
    const box = this.container.querySelector('[data-validation]');
    if (!box) return;

    const resolved = resolvePreviewText(element.content, this.store.template);
    const validation = validateElementContent(element, resolved);
    const isCode = element.type === 'qr' || element.type === 'barcode';

    if (element.type === 'image' && !element.src) {
      box.innerHTML =
        '<div class="prop-msg warning">Selecciona un archivo PNG, JPG, WEBP o SVG para incrustarlo en la etiqueta.</div>';
      return;
    }

    if (element.type === 'text' && !String(resolved).trim()) {
      box.innerHTML =
        '<div class="prop-msg warning">El texto está vacío. Escribe contenido o una variable.</div>';
      return;
    }

    if (!isCode) {
      if (!validation.valid || validation.warnings.length) {
        const level = validation.valid ? 'warning' : 'error';
        const messages = validation.valid ? validation.warnings : validation.errors;
        box.innerHTML = `<div class="prop-msg ${level}">${messages
          .map((message) => escapeHtml(message))
          .join('<br>')}</div>`;
      } else {
        box.innerHTML = '';
      }
      return;
    }

    let assessment = null;
    if (validation.valid) {
      const meta = generateCode({
        type: element.type,
        text: validation.text,
        symbology: element.symbology,
        errorLevel: element.errorLevel,
        showText: element.showText,
        color: element.color
      });
      assessment = assessCodeReadability(element, meta);
    }

    let level = 'ok';
    const messages = [];
    if (!validation.valid) {
      level = 'error';
      messages.push(...validation.errors);
    } else {
      messages.push(...validation.warnings);
      if (assessment && assessment.level !== 'ok') {
        level = assessment.level;
        messages.push(...assessment.messages);
      }
      if (level === 'ok' && assessment) {
        messages.push(`Tamaño de módulo: ${assessment.moduleMm.toFixed(2)} mm.`);
      }
    }

    box.innerHTML = `<div class="prop-msg ${level}">${messages
      .map((message) => escapeHtml(message))
      .join('<br>')}</div>`;
  }

  applyValue(target, { transient = false } = {}) {
    const noneFor = target.dataset.noneFor;
    if (noneFor) {
      if (target.checked) {
        this.editor.updateSelected({ [noneFor]: 'none' });
      } else {
        const color = this.container.querySelector(`[data-prop="${noneFor}"]`);
        this.editor.updateSelected({ [noneFor]: color?.dataset.fallback || '#ffffff' });
      }
      return;
    }

    const prop = target.dataset.prop;
    if (!prop) return;

    let value;
    if (target.type === 'checkbox') {
      value = target.checked;
    } else if (target.dataset.number === 'true') {
      if (target.value === '') return;
      value = Number(target.value);
      if (!Number.isFinite(value)) return;
    } else {
      value = target.value;
    }

    this.editor.updateSelected({ [prop]: value }, { transient });
  }

  async loadImage(file) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      this.notify('Formato no soportado. Usa PNG, JPG, WEBP o SVG.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.notify('La imagen supera 4 MB. Usa un archivo más pequeño.');
      return;
    }

    try {
      const src = await readFileAsDataUrl(file);
      const element = this.selected;
      if (!element) return;

      const patch = { src, fit: 'contain' };
      if (file.type !== 'image/svg+xml') {
        try {
          const size = await imageDimensions(src);
          if (size.width > 0 && size.height > 0) {
            const height = (element.w * size.height) / size.width;
            patch.h = Math.max(1, Math.min(this.store.label.height, height));
          }
        } catch {
          // Si no se pueden leer dimensiones, se conserva la caja actual.
        }
      }

      this.editor.updateSelected(patch);
      this.notify('Imagen embebida en la plantilla');
    } catch {
      this.notify('No se pudo cargar la imagen');
    }
  }

  pickImage() {
    const input = this.container?.querySelector('[data-image-file]');
    if (input) input.click();
  }
}
