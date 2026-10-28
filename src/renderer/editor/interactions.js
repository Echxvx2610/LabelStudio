/**
 * Interacciones del lienzo: selección, arrastre, redimensión, rotación,
 * caja de selección, zoom con Ctrl+rueda y desplazamiento (Space/rueda central).
 */

import {
  angleFromCenter,
  boundsIntersect,
  clamp,
  computeMoveSnap,
  elementBounds,
  moveElements,
  normalizeAngle,
  resizeElement,
  roundTo,
  snapPoint,
  unionBounds
} from './geometry.js';

function isTypingTarget(target) {
  return Boolean(
    target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
  );
}

export class EditorInteractions {
  constructor({ store, renderer }) {
    this.store = store;
    this.renderer = renderer;
    this.svg = renderer.svg;
    this.viewport = renderer.viewport;
    this.cursorEl = document.getElementById('status-cursor');

    this.drag = null;
    this.pan = null;
    this.spaceDown = false;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onHover = this.onHover.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  attach() {
    this.svg.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.viewport.addEventListener('wheel', this.onWheel, { passive: false });
    this.viewport.addEventListener('pointermove', this.onHover);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => {
      if (this.drag || this.pan) this.cancel();
    });
  }

  toMm(event) {
    const point = this.svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = this.svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  otherBounds(excludedIds) {
    const excluded = excludedIds || this.store.selection;
    return this.store.template.elements
      .filter((element) => !excluded.has(element.id))
      .map((element) => elementBounds(element));
  }

  onPointerDown(event) {
    const panButton = event.button === 1 || (event.button === 0 && this.spaceDown);
    if (panButton) {
      event.preventDefault();
      this.startPan(event);
      return;
    }
    if (event.button !== 0) return;

    const handle = event.target.closest('[data-handle]');
    if (handle) {
      event.preventDefault();
      this.startResize(event, handle.dataset.handle);
      return;
    }

    if (event.target.closest('[data-rotate]')) {
      event.preventDefault();
      this.startRotate();
      return;
    }

    const elementGroup = event.target.closest('[data-element-id]');
    if (elementGroup) {
      const id = elementGroup.dataset.elementId;
      if (event.shiftKey) {
        event.preventDefault();
        this.store.toggleSelection(id);
        this.store.clearOverlay();
        return;
      }
      if (!this.store.selection.has(id)) this.store.select([id]);
      this.startMove(event);
      return;
    }

    if (!event.shiftKey) this.store.clearSelection();
    this.startMarquee(event);
  }

  startPan(event) {
    this.pan = {
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: this.viewport.scrollLeft,
      scrollTop: this.viewport.scrollTop
    };
    this.viewport.classList.add('panning');
  }

  startMove(event) {
    const originals = this.store.selectedElements.map((element) => ({ ...element }));
    if (!originals.length) return;

    this.store.beginTransient();
    this.drag = {
      mode: 'move',
      start: this.toMm(event),
      ids: new Set(originals.map((element) => element.id)),
      originals,
      bounds: unionBounds(originals.map(elementBounds))
    };
  }

  startResize(event, handle) {
    if (this.store.selection.size !== 1) return;
    const element = this.store.selectedElements[0];
    if (!element) return;

    this.store.beginTransient();
    this.drag = {
      mode: 'resize',
      handle,
      id: element.id,
      original: { ...element },
      start: this.toMm(event)
    };
  }

  startRotate() {
    if (this.store.selection.size !== 1) return;
    const element = this.store.selectedElements[0];
    if (!element) return;

    this.store.beginTransient();
    this.drag = {
      mode: 'rotate',
      id: element.id,
      center: { x: element.x + element.w / 2, y: element.y + element.h / 2 }
    };
  }

  startMarquee(event) {
    this.drag = {
      mode: 'marquee',
      start: this.toMm(event),
      additive: event.shiftKey,
      baseSelection: new Set(this.store.selection)
    };
  }

  onPointerMove(event) {
    if (this.pan) {
      this.viewport.scrollLeft =
        this.pan.scrollLeft - (event.clientX - this.pan.clientX);
      this.viewport.scrollTop = this.pan.scrollTop - (event.clientY - this.pan.clientY);
      this.renderer.updateRulers();
      return;
    }
    if (!this.drag) return;

    const point = this.toMm(event);
    switch (this.drag.mode) {
      case 'move':
        this.updateMove(point);
        break;
      case 'resize':
        this.updateResize(point);
        break;
      case 'rotate':
        this.updateRotate(point, event.shiftKey);
        break;
      case 'marquee':
        this.updateMarquee(point);
        break;
      default:
        break;
    }
  }

  updateMove(point) {
    const { start, bounds, originals } = this.drag;
    let dx = point.x - start.x;
    let dy = point.y - start.y;

    const threshold = 6 / this.renderer.getScale();
    const proposed = { ...bounds, x: bounds.x + dx, y: bounds.y + dy };
    const snap = computeMoveSnap(proposed, this.otherBounds(this.drag.ids), {
      gridSize: this.store.grid.size,
      threshold,
      snapGrid: this.store.grid.visible && this.store.snapEnabled,
      snapElements: this.store.snapEnabled
    });

    dx += snap.dx;
    dy += snap.dy;

    const moved = moveElements(originals, dx, dy, this.store.label);
    const updates = {};
    for (const element of moved) updates[element.id] = { x: element.x, y: element.y };

    this.store.overlayGuides = snap.guides;
    const changed = this.store.setPositions(updates, { transient: true });
    if (!changed) this.renderer.render('overlay');
  }

  updateResize(point) {
    const threshold = 6 / this.renderer.getScale();
    const snapped = snapPoint(point, this.otherBounds(new Set([this.drag.id])), {
      gridSize: this.store.grid.size,
      threshold,
      snapGrid: this.store.grid.visible && this.store.snapEnabled,
      snapElements: this.store.snapEnabled
    });

    const target = {
      x: clamp(snapped.x, 0, this.store.label.width),
      y: clamp(snapped.y, 0, this.store.label.height)
    };
    const next = resizeElement(this.drag.original, this.drag.handle, target, {
      minSize: 1
    });

    this.store.overlayGuides = snapped.guides;
    const changed = this.store.updateElement(
      this.drag.id,
      { x: next.x, y: next.y, w: next.w, h: next.h },
      { transient: true, sanitize: false }
    );
    if (!changed) this.renderer.render('overlay');
  }

  updateRotate(point, snapToAngle) {
    let angle = angleFromCenter(this.drag.center, point);
    angle = snapToAngle ? roundTo(angle, 15) : Math.round(angle * 10) / 10;
    this.store.updateElement(
      this.drag.id,
      { rotation: normalizeAngle(angle) },
      { transient: true, sanitize: false }
    );
  }

  updateMarquee(point) {
    const { start, additive, baseSelection } = this.drag;
    const rect = {
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      w: Math.abs(point.x - start.x),
      h: Math.abs(point.y - start.y)
    };

    this.store.marquee = rect;
    const hits = this.store.template.elements
      .filter((element) => boundsIntersect(elementBounds(element), rect))
      .map((element) => element.id);

    const next = additive ? new Set([...baseSelection, ...hits]) : new Set(hits);
    this.store.setSelection([...next]);
  }

  onPointerUp() {
    if (this.pan) {
      this.pan = null;
      this.viewport.classList.remove('panning');
      return;
    }
    if (!this.drag) return;

    const mode = this.drag.mode;
    this.drag = null;
    this.store.clearOverlay();
    if (mode === 'move' || mode === 'resize' || mode === 'rotate') {
      this.store.commitTransient();
    }
  }

  onWheel(event) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.zoomAt(event.clientX, event.clientY, this.store.zoom * factor);
  }

  zoomAt(clientX, clientY, nextZoom) {
    const rect = this.viewport.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    const ratioX = (offsetX + this.viewport.scrollLeft) / Math.max(1, this.viewport.scrollWidth);
    const ratioY = (offsetY + this.viewport.scrollTop) / Math.max(1, this.viewport.scrollHeight);

    this.store.setZoom(nextZoom);

    this.viewport.scrollLeft = ratioX * this.viewport.scrollWidth - offsetX;
    this.viewport.scrollTop = ratioY * this.viewport.scrollHeight - offsetY;
    this.renderer.updateRulers();
  }

  onHover(event) {
    if (!this.cursorEl) return;
    const point = this.toMm(event);
    this.cursorEl.textContent = `X: ${point.x.toFixed(1)} mm, Y: ${point.y.toFixed(1)} mm`;
  }

  onKeyDown(event) {
    if (isTypingTarget(event.target)) return;
    if (event.target.closest?.('button, a, [role="button"]')) return;
    if (event.code === 'Space' && !event.repeat) {
      this.spaceDown = true;
      this.viewport.classList.add('pan-ready');
      event.preventDefault();
    }
  }

  onKeyUp(event) {
    if (event.code === 'Space') {
      this.spaceDown = false;
      this.viewport.classList.remove('pan-ready');
    }
  }

  cancel() {
    if (this.drag) {
      this.store.cancelTransient();
      this.drag = null;
    }
    this.pan = null;
    this.spaceDown = false;
    this.viewport.classList.remove('panning', 'pan-ready');
  }
}
