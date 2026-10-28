/**
 * Render del lienzo SVG a partir del estado del store.
 * El SVG usa un viewBox en milímetros; la escala de pantalla se controla con zoom.
 */

import {
  elementBounds,
  elementCenter,
  HANDLE_NAMES,
  localHandlePosition,
  MM_TO_PX,
  ptToMm,
  unionBounds
} from './geometry.js';
import { assessCodeReadability, codeLayout, validateElementContent } from './element-validation.js';
import { generateCode } from './barcodes.js';
import { resolvePreviewText } from '../data/preview.js';
import { fontStack } from './model.js';

const HANDLE_SIZE_PX = 8;
const ROTATE_OFFSET_PX = 22;
const RULER_SIZE = 18;
const MINOR_TICK_PX = 7;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function chooseRulerStep(scale) {
  const candidates = [1, 2, 5, 10, 20, 50, 100];
  for (const step of candidates) {
    if (step * scale >= MINOR_TICK_PX) return step;
  }
  return 100;
}

export class EditorRenderer {
  constructor({ store }) {
    this.store = store;

    this.area = document.getElementById('canvas-area');
    this.viewport = document.getElementById('canvas-viewport');
    this.stage = document.getElementById('canvas-stage');
    this.svg = document.getElementById('label-svg');
    this.background = document.getElementById('label-background');
    this.gridLayer = document.getElementById('layer-grid');
    this.elementsLayer = document.getElementById('layer-elements');
    this.overlayLayer = document.getElementById('layer-overlay');
    this.rulerH = document.getElementById('ruler-h');
    this.rulerV = document.getElementById('ruler-v');

    this._geometryKey = '';
    this._fitCache = new Map();
    this._warnings = new Map();
    this._resizeObserver = new ResizeObserver(() => {
      this.updateGeometry(true);
      this.updateRulers();
    });
    if (this.viewport) this._resizeObserver.observe(this.viewport);
    if (this.viewport) {
      this.viewport.addEventListener('scroll', () => this.updateRulers(), { passive: true });
    }
  }

  getScale() {
    return MM_TO_PX * (this.store.zoom / 100);
  }

  /** Invalida las medidas de autoFit (por ejemplo, al cargar una fuente nueva). */
  refreshFonts() {
    this._fitCache.clear();
    this.render('fonts');
  }

  render(event = 'change') {
    if (!this.svg) return;
    const { label } = this.store.template;

    this.svg.setAttribute('viewBox', `0 0 ${label.width} ${label.height}`);
    this.background.setAttribute('width', label.width);
    this.background.setAttribute('height', label.height);
    this.background.setAttribute('rx', label.radius || 0);

    this.renderGrid();
    this.renderElements();
    this.renderOverlay();

    const geometryChanged = this.updateGeometry(event === 'view' || event === 'init');
    if (geometryChanged || event === 'view' || event === 'init') this.updateRulers();
  }

  renderGrid() {
    const { visible, size } = this.store.grid;
    if (!visible) {
      this.gridLayer.innerHTML = '';
      return;
    }

    const { width, height } = this.store.label;
    const scale = this.getScale();
    const minorVisible = size * scale >= 4;
    const lines = [];

    for (let x = size; x < width; x += size) {
      if (!minorVisible && Math.abs(x % (size * 5)) > 1e-6) continue;
      const major = Math.abs(x % (size * 5)) < 1e-6;
      lines.push(
        `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${
          major ? '#cfcaca' : '#e9e5e5'
        }" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      );
    }
    for (let y = size; y < height; y += size) {
      if (!minorVisible && Math.abs(y % (size * 5)) > 1e-6) continue;
      const major = Math.abs(y % (size * 5)) < 1e-6;
      lines.push(
        `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${
          major ? '#cfcaca' : '#e9e5e5'
        }" stroke-width="1" vector-effect="non-scaling-stroke"/>`
      );
    }

    this.gridLayer.innerHTML = lines.join('');
  }

  renderElements() {
    this._warnings = new Map();
    this.elementsLayer.innerHTML = this.store.template.elements
      .map((element) => this.renderElement(element))
      .join('');
    this.applyAutoFit();
  }

  renderElement(element) {
    const { id, type } = element;
    const rotation = element.rotation || 0;
    const center = elementCenter(element);
    const transform = `translate(${element.x} ${element.y})${
      rotation ? ` rotate(${rotation} ${element.w / 2} ${element.h / 2})` : ''
    }`;
    const hit = `<rect class="element-hit" x="0" y="0" width="${element.w}" height="${
      element.h
    }" fill="transparent" pointer-events="all"/>`;

    let shape = '';
    switch (type) {
      case 'text':
        shape = this.renderText(element);
        break;
      case 'qr':
      case 'barcode':
        shape = this.renderCode(element);
        break;
      case 'image':
        shape = this.renderImage(element);
        break;
      case 'line':
        shape = `<line x1="0" y1="${element.h}" x2="${element.w}" y2="0" stroke="${escapeXml(
          element.stroke || '#0b090a'
        )}" stroke-width="${element.strokeWidth ?? 0.3}" stroke-linecap="round"/>`;
        break;
      case 'ellipse':
        shape = `<ellipse cx="${element.w / 2}" cy="${element.h / 2}" rx="${
          element.w / 2
        }" ry="${element.h / 2}" fill="${escapeXml(element.fill || 'none')}" stroke="${escapeXml(
          element.stroke || '#0b090a'
        )}" stroke-width="${element.strokeWidth ?? 0.3}"/>`;
        break;
      case 'rect':
      default: {
        const radius = Math.max(
          0,
          Math.min(Number(element.radius) || 0, Math.min(element.w, element.h) / 2)
        );
        shape = `<rect x="0" y="0" width="${element.w}" height="${element.h}" rx="${radius}" fill="${escapeXml(
          element.fill || 'none'
        )}" stroke="${escapeXml(element.stroke || '#0b090a')}" stroke-width="${
          element.strokeWidth ?? 0.3
        }"/>`;
        break;
      }
    }

    return `<g class="element element-${type}${
      this.store.selection.has(id) ? ' selected' : ''
    }" data-element-id="${escapeXml(id)}" transform="${transform}" data-center-x="${center.x}" data-center-y="${
      center.y
    }">${hit}${shape}</g>`;
  }

  textFitKey(element) {
    return [
      element.id,
      element.content,
      element.font,
      element.bold ? 1 : 0,
      element.italic ? 1 : 0,
      element.size,
      element.lineHeight,
      element.w,
      element.h
    ].join('|');
  }

  renderText(element) {
    const autoFit = Boolean(element.autoFit);
    const cachedSize = autoFit ? this._fitCache.get(this.textFitKey(element)) : null;
    const size = cachedSize || ptToMm(element.size ?? 11);
    const lineHeight = size * (element.lineHeight ?? 1.2);
    const content = resolvePreviewText(element.content, this.store.template);
    const lines = String(content ?? '').split('\n');
    const align = element.align || 'left';
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
    const x = align === 'center' ? element.w / 2 : align === 'right' ? element.w : 0;
    const weight = element.bold ? '700' : '400';
    const style = element.italic ? 'italic' : 'normal';
    const font = fontStack(element.font);

    const tspans = lines
      .map(
        (line, index) =>
          `<tspan x="${x}" y="${size + index * lineHeight}">${escapeXml(line)}</tspan>`
      )
      .join('');

    const fitAttrs = autoFit
      ? ` data-autofit="1"${cachedSize ? ' data-fitted="1"' : ''} data-element-id="${escapeXml(
          element.id
        )}" data-box-w="${element.w}" data-box-h="${element.h}"`
      : '';

    return `<text font-family="${escapeXml(
      font
    )}" font-size="${size}" font-weight="${weight}" font-style="${style}" text-anchor="${anchor}" fill="${escapeXml(
      element.color || '#0b090a'
    )}"${fitAttrs}>${tspans}</text>`;
  }

  /** Ajusta el tamaño de los textos con autoFit midiendo su caja real en el SVG. */
  applyAutoFit() {
    const nodes = this.elementsLayer.querySelectorAll('text[data-autofit="1"]:not([data-fitted])');

    for (const node of nodes) {
      const element = this.store.getElement(node.dataset.elementId);
      if (!element) continue;

      let size = Number(node.getAttribute('font-size')) || ptToMm(element.size ?? 11);
      const boxW = Math.max(0.5, element.w - 0.4);
      const boxH = Math.max(0.5, element.h);

      for (let pass = 0; pass < 5; pass += 1) {
        const bbox = node.getBBox();
        if (!bbox.width || !bbox.height) break;
        const scale = Math.min(boxW / bbox.width, boxH / bbox.height, 1);
        if (scale >= 0.995) break;
        size = Math.max(0.4, size * scale * 0.98);
        this.setFitSize(node, element, size);
      }

      if (this._fitCache.size > 300) this._fitCache.clear();
      this._fitCache.set(this.textFitKey(element), size);
    }
  }

  setFitSize(node, element, size) {
    node.setAttribute('font-size', size.toFixed(3));
    const lineHeight = size * (element.lineHeight ?? 1.2);
    node.querySelectorAll('tspan').forEach((tspan, index) => {
      tspan.setAttribute('y', (size + index * lineHeight).toFixed(3));
    });
  }

  renderCode(element) {
    const resolved = resolvePreviewText(element.content, this.store.template);
    const validation = validateElementContent(element, resolved);

    if (!validation.valid) {
      this._warnings.set(element.id, { level: 'error', messages: validation.errors });
      return this.renderCodeError(element, validation.errors[0]);
    }

    const meta = generateCode({
      type: element.type,
      text: validation.text,
      symbology: element.symbology,
      errorLevel: element.errorLevel,
      showText: element.showText,
      color: element.color
    });

    if (meta.error) {
      this._warnings.set(element.id, { level: 'error', messages: [meta.error] });
      return this.renderCodeError(element, meta.error);
    }

    const assessment = assessCodeReadability(element, meta);
    if (assessment.level !== 'ok') {
      this._warnings.set(element.id, assessment);
    }

    const layout = codeLayout(element, meta);
    const scaleX = layout.w / meta.naturalWidth;
    const scaleY = layout.h / meta.naturalHeight;

    return `<rect x="0" y="0" width="${element.w}" height="${element.h}" fill="#ffffff"/>
      <g transform="translate(${layout.x} ${layout.y}) scale(${scaleX} ${scaleY})" shape-rendering="crispEdges">${
        meta.inner
      }</g>`;
  }

  renderCodeError(element, message) {
    const size = Math.max(1.5, Math.min(2.4, element.h * 0.22));
    const text = String(message || 'Contenido inválido');
    const maxChars = Math.max(12, Math.floor(element.w / (size * 0.55)));
    const short = text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;

    return `<rect x="0" y="0" width="${element.w}" height="${
      element.h
    }" fill="#fff5f5" stroke="#e5383b" stroke-width="0.25" stroke-dasharray="0.8 0.6"/>
      <text x="${element.w / 2}" y="${element.h / 2}" font-family="sans-serif" font-size="${size}" text-anchor="middle" dominant-baseline="middle" fill="#a4161a">${escapeXml(
        short
      )}</text>`;
  }

  renderImage(element) {
    if (!element.src) {
      return `<rect x="0" y="0" width="${element.w}" height="${
        element.h
      }" fill="#f5f3f4" stroke="#b1a7a6" stroke-width="0.2" stroke-dasharray="0.8 0.6"/>
        <text x="${element.w / 2}" y="${element.h / 2}" font-family="sans-serif" font-size="${Math.min(
          3,
          element.h * 0.2
        )}" text-anchor="middle" dominant-baseline="middle" fill="#b1a7a6">Sin imagen</text>`;
    }

    const fit = element.fit || 'contain';
    const preserve =
      fit === 'cover' ? 'xMidYMid slice' : fit === 'fill' ? 'none' : 'xMidYMid meet';

    return `<image href="${escapeXml(element.src)}" x="0" y="0" width="${element.w}" height="${
      element.h
    }" preserveAspectRatio="${preserve}"/>`;
  }

  renderOverlay() {
    const { selectedElements, overlayGuides, marquee } = this.store;
    const scale = this.getScale();
    const parts = [];

    for (const element of selectedElements) {
      const rotation = element.rotation || 0;
      const transform = `translate(${element.x} ${element.y})${
        rotation ? ` rotate(${rotation} ${element.w / 2} ${element.h / 2})` : ''
      }`;
      parts.push(
        `<g transform="${transform}"><rect class="selection-outline" x="0" y="0" width="${
          element.w
        }" height="${element.h}"/></g>`
      );
    }

    if (selectedElements.length > 1) {
      const bounds = unionBounds(selectedElements.map(elementBounds));
      parts.push(
        `<rect class="selection-group" x="${bounds.x}" y="${bounds.y}" width="${bounds.w}" height="${bounds.h}"/>`
      );
    }

    if (selectedElements.length === 1) {
      parts.push(this.renderHandles(selectedElements[0], scale));
    }

    for (const [id, assessment] of this._warnings) {
      const element = this.store.getElement(id);
      if (!element) continue;
      const radius = Math.min(1.4, Math.max(0.6, Math.min(element.w, element.h) * 0.08));
      const cx = element.w - radius - 0.2;
      const cy = radius + 0.2;
      const transform = `translate(${element.x} ${element.y})${
        element.rotation ? ` rotate(${element.rotation} ${element.w / 2} ${element.h / 2})` : ''
      }`;
      parts.push(
        `<g transform="${transform}" pointer-events="none" class="code-warning" data-warning-element="${escapeXml(
          id
        )}"><circle cx="${cx}" cy="${cy}" r="${radius}" fill="${
          assessment.level === 'error' ? '#a4161a' : '#e5383b'
        }" stroke="#ffffff" stroke-width="${radius * 0.18}"/><text x="${cx}" y="${
          cy + radius * 0.45
        }" font-family="sans-serif" font-size="${radius * 1.5}" font-weight="700" text-anchor="middle" fill="#ffffff">!</text></g>`
      );
    }

    for (const guide of overlayGuides) {
      if (guide.axis === 'x') {
        parts.push(
          `<line class="guide-line" x1="${guide.position}" y1="0" x2="${guide.position}" y2="${this.store.label.height}"/>`
        );
      } else {
        parts.push(
          `<line class="guide-line" x1="0" y1="${guide.position}" x2="${this.store.label.width}" y2="${guide.position}"/>`
        );
      }
    }

    if (marquee) {
      parts.push(
        `<rect class="marquee" x="${marquee.x}" y="${marquee.y}" width="${marquee.w}" height="${marquee.h}"/>`
      );
    }

    this.overlayLayer.innerHTML = parts.join('');
  }

  renderHandles(element, scale) {
    const handleSize = HANDLE_SIZE_PX / scale;
    const rotation = element.rotation || 0;
    const transform = `translate(${element.x} ${element.y})${
      rotation ? ` rotate(${rotation} ${element.w / 2} ${element.h / 2})` : ''
    }`;
    const parts = [];

    for (const handle of HANDLE_NAMES) {
      const position = localHandlePosition(element, handle);
      const cursor = `${handle}-resize`;
      parts.push(
        `<rect class="selection-handle" data-handle="${handle}" data-element-id="${escapeXml(
          element.id
        )}" x="${position.x - handleSize / 2}" y="${position.y - handleSize / 2}" width="${handleSize}" height="${handleSize}" rx="${
          handleSize * 0.12
        }" style="cursor:${cursor}"/>`
      );
    }

    const offset = ROTATE_OFFSET_PX / scale;
    const rotateY = element.y - offset < 0 ? element.h + offset : -offset;
    const rotateStartY = rotateY > 0 ? element.h : 0;
    parts.push(
      `<line class="rotate-connector" x1="${element.w / 2}" y1="${rotateStartY}" x2="${
        element.w / 2
      }" y2="${rotateY}"/>
      <circle class="rotate-handle" data-rotate="true" data-element-id="${escapeXml(
        element.id
      )}" cx="${element.w / 2}" cy="${rotateY}" r="${handleSize * 0.7}" style="cursor:grab"/>`
    );

    return `<g class="selection-handles" transform="${transform}">${parts.join('')}</g>`;
  }

  updateGeometry(force = false) {
    if (!this.viewport || !this.stage) return false;
    const scale = this.getScale();
    const { width, height } = this.store.label;
    const pxWidth = width * scale;
    const pxHeight = height * scale;
    const viewportWidth = this.viewport.clientWidth;
    const viewportHeight = this.viewport.clientHeight;
    const key = `${pxWidth.toFixed(2)}x${pxHeight.toFixed(2)}|${viewportWidth}x${viewportHeight}`;
    if (!force && key === this._geometryKey) return false;
    this._geometryKey = key;

    this.svg.setAttribute('width', pxWidth.toFixed(2));
    this.svg.setAttribute('height', pxHeight.toFixed(2));
    this.stage.style.width = `${Math.max(viewportWidth, Math.ceil(pxWidth) + 64)}px`;
    this.stage.style.height = `${Math.max(viewportHeight, Math.ceil(pxHeight) + 64)}px`;
    return true;
  }

  updateRulers() {
    if (!this.rulerH || !this.rulerV || !this.area) return;
    const visible = this.store.rulersVisible;
    this.area.classList.toggle('no-rulers', !visible);
    if (!visible) return;

    const scale = this.getScale();
    const width = Math.max(1, Math.round(this.viewport.clientWidth));
    const height = Math.max(1, Math.round(this.viewport.clientHeight));
    const viewportRect = this.viewport.getBoundingClientRect();
    const labelRect = this.svg.getBoundingClientRect();

    this.rulerH.setAttribute('width', width);
    this.rulerH.setAttribute('height', RULER_SIZE);
    this.rulerH.setAttribute('viewBox', `0 0 ${width} ${RULER_SIZE}`);
    this.rulerH.innerHTML = this.buildHorizontalRuler(
      scale,
      labelRect.left - viewportRect.left,
      width
    );

    this.rulerV.setAttribute('width', RULER_SIZE);
    this.rulerV.setAttribute('height', height);
    this.rulerV.setAttribute('viewBox', `0 0 ${RULER_SIZE} ${height}`);
    this.rulerV.innerHTML = this.buildVerticalRuler(
      scale,
      labelRect.top - viewportRect.top,
      height
    );
  }

  buildHorizontalRuler(scale, origin, width) {
    const step = chooseRulerStep(scale);
    const major = step * 5;
    const start = Math.floor(-origin / scale);
    const end = Math.ceil((width - origin) / scale);
    const parts = [];

    for (let mm = Math.ceil(start / step) * step; mm <= end; mm += step) {
      const x = origin + mm * scale;
      const isMajor = Math.abs(mm % major) < 1e-6;
      parts.push(
        `<line x1="${x.toFixed(1)}" y1="${isMajor ? 3 : 11}" x2="${x.toFixed(
          1
        )}" y2="${RULER_SIZE}" stroke="${isMajor ? '#8a8584' : '#c9c4c3'}"/>`
      );
      if (isMajor) {
        parts.push(
          `<text x="${(x + 2).toFixed(1)}" y="10" font-size="9" font-family="sans-serif" fill="#5e5a59">${mm}</text>`
        );
      }
    }
    return parts.join('');
  }

  buildVerticalRuler(scale, origin, height) {
    const step = chooseRulerStep(scale);
    const major = step * 5;
    const start = Math.floor(-origin / scale);
    const end = Math.ceil((height - origin) / scale);
    const parts = [];

    for (let mm = Math.ceil(start / step) * step; mm <= end; mm += step) {
      const y = origin + mm * scale;
      const isMajor = Math.abs(mm % major) < 1e-6;
      parts.push(
        `<line x1="${isMajor ? 3 : 11}" y1="${y.toFixed(1)}" x2="${RULER_SIZE}" y2="${y.toFixed(
          1
        )}" stroke="${isMajor ? '#8a8584' : '#c9c4c3'}"/>`
      );
      if (isMajor) {
        parts.push(
          `<text x="2" y="${(y - 3).toFixed(1)}" font-size="9" font-family="sans-serif" fill="#5e5a59">${mm}</text>`
        );
      }
    }
    return parts.join('');
  }
}
