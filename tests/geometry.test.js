import { describe, it, expect } from 'vitest';
import {
  alignElements,
  clampElementToLabel,
  computeMoveSnap,
  distributeElements,
  elementCorners,
  moveElements,
  resizeElement,
  rotatePoint,
  snapPoint
} from '../src/renderer/editor/geometry.js';

function element(overrides = {}) {
  return { id: 'a', type: 'rect', x: 10, y: 10, w: 10, h: 10, rotation: 0, ...overrides };
}

const closeTo = (actual, expected) => expect(actual).toBeCloseTo(expected, 6);

describe('geometría: redimensión', () => {
  it('redimensiona desde el manejador se manteniendo fijo el nw', () => {
    const result = resizeElement(element(), 'se', { x: 25, y: 23 });
    closeTo(result.x, 10);
    closeTo(result.y, 10);
    closeTo(result.w, 15);
    closeTo(result.h, 13);
  });

  it('redimensiona desde el manejador nw manteniendo fijo el se', () => {
    const result = resizeElement(element(), 'nw', { x: 5, y: 5 });
    closeTo(result.x, 5);
    closeTo(result.y, 5);
    closeTo(result.w, 15);
    closeTo(result.h, 15);
  });

  it('respeta el tamaño mínimo al cruzar el ancla', () => {
    const result = resizeElement(element(), 'e', { x: -50, y: 15 });
    closeTo(result.w, 1);
    closeTo(result.x, 10);
  });

  it('mantiene fijo el ancla con rotación', () => {
    const rotated = element({ rotation: 90 });
    const anchorBefore = elementCorners(rotated)[0];
    const result = resizeElement(rotated, 'se', { x: 25, y: 5 });
    const anchorAfter = elementCorners(result)[0];
    closeTo(anchorAfter.x, anchorBefore.x);
    closeTo(anchorAfter.y, anchorBefore.y);
  });
});

describe('geometría: movimiento y límites', () => {
  it('mueve un grupo sin salir de la etiqueta', () => {
    const elements = [element({ x: 45, y: 5 }), element({ id: 'b', x: 10, y: 5 })];
    const moved = moveElements(elements, 20, 0, { width: 50, height: 30 });
    closeTo(moved[0].x, 40);
    closeTo(moved[1].x, 5);
  });

  it('mantiene el elemento dentro de la etiqueta al normalizar', () => {
    const result = clampElementToLabel(element({ x: 80, y: -5 }), { width: 50, height: 30 });
    closeTo(result.x, 40);
    closeTo(result.y, 0);
  });
});

describe('geometría: snap', () => {
  it('ajusta a la cuadrícula cuando no hay otros elementos', () => {
    const snap = computeMoveSnap(
      { x: 10.4, y: 4.4, w: 5, h: 5 },
      [],
      { gridSize: 1, threshold: 0.6, snapGrid: true }
    );
    closeTo(snap.dx, -0.4);
    closeTo(snap.dy, -0.4);
    expect(snap.guides).toHaveLength(0);
  });

  it('prioriza el borde de otro elemento y devuelve guía', () => {
    const target = { x: 20, y: 0, w: 10, h: 10 };
    const snap = computeMoveSnap(
      { x: 10.2, y: 5, w: 10, h: 4 },
      [target],
      { gridSize: 1, threshold: 0.5, snapGrid: true }
    );
    closeTo(snap.dx, -0.2);
    expect(snap.guides.some((guide) => guide.axis === 'x' && guide.position === 20)).toBe(true);
  });

  it('ajusta un punto a la cuadrícula', () => {
    const snap = snapPoint({ x: 4.4, y: 9.7 }, [], { gridSize: 1, threshold: 0.5 });
    closeTo(snap.x, 4);
    closeTo(snap.y, 10);
  });
});

describe('geometría: alinear y distribuir', () => {
  it('alinea a la izquierda contra el bounding box de la selección', () => {
    const elements = [element({ x: 25 }), element({ id: 'b', x: 5 })];
    const aligned = alignElements(elements, 'left', { width: 50, height: 30 });
    closeTo(aligned[0].x, 5);
    closeTo(aligned[1].x, 5);
  });

  it('centra un solo elemento contra la etiqueta', () => {
    const aligned = alignElements([element({ x: 0, w: 10 })], 'center-h', {
      width: 50,
      height: 30
    });
    closeTo(aligned[0].x, 20);
  });

  it('distribuye tres elementos con separaciones iguales', () => {
    const elements = [
      element({ id: 'a', x: 0 }),
      element({ id: 'b', x: 10 }),
      element({ id: 'c', x: 30 })
    ];
    const distributed = distributeElements(elements, 'x');
    closeTo(distributed[0].x, 0);
    closeTo(distributed[1].x, 15);
    closeTo(distributed[2].x, 30);
  });
});

describe('geometría: rotación', () => {
  it('rota un punto alrededor de un centro', () => {
    const result = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    closeTo(result.x, 0);
    closeTo(result.y, 10);
  });
});
