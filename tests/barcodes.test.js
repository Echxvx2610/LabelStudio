import { beforeEach, describe, it, expect } from 'vitest';
import { clearCodeCache, generateCode } from '../src/renderer/editor/barcodes.js';

describe('generación de códigos con bwip-js', () => {
  beforeEach(() => clearCodeCache());

  it('genera un QR real con 21 módulos', () => {
    const meta = generateCode({
      type: 'qr',
      text: 'EQ-0001',
      errorLevel: 'M',
      color: '#0b090a'
    });
    expect(meta.error).toBeUndefined();
    expect(meta.kind).toBe('matrix');
    expect(meta.modules).toBe(21);
    expect(meta.inner).toContain('<path');
  });

  it('respeta el nivel de corrección de errores elegido', () => {
    const low = generateCode({
      type: 'qr',
      text: 'EQ-0001',
      errorLevel: 'L',
      color: '#000000'
    });
    const high = generateCode({
      type: 'qr',
      text: 'EQ-0001',
      errorLevel: 'H',
      color: '#000000'
    });
    expect(low.error).toBeUndefined();
    expect(high.error).toBeUndefined();
    expect(low.inner).not.toBe(high.inner);
  });

  it('genera Code 128 con texto legible', () => {
    const meta = generateCode({
      type: 'barcode',
      text: 'EQ-0001',
      symbology: 'code128',
      showText: true,
      color: '#0b090a'
    });
    expect(meta.error).toBeUndefined();
    expect(meta.kind).toBe('linear');
    expect(meta.naturalWidth).toBeGreaterThan(100);
    expect(meta.inner.length).toBeGreaterThan(100);
  });

  it('genera DataMatrix', () => {
    const meta = generateCode({
      type: 'barcode',
      text: 'EQ-0001',
      symbology: 'datamatrix',
      color: '#000000'
    });
    expect(meta.error).toBeUndefined();
    expect(meta.kind).toBe('matrix');
    expect(meta.modules).toBeGreaterThan(5);
  });

  it('genera EAN-13', () => {
    const meta = generateCode({
      type: 'barcode',
      text: '123456789012',
      symbology: 'ean13',
      showText: true,
      color: '#000000'
    });
    expect(meta.error).toBeUndefined();
    expect(meta.kind).toBe('linear');
  });

  it('devuelve error si bwip-js rechaza el contenido', () => {
    const meta = generateCode({
      type: 'barcode',
      text: 'NO-ES-EAN',
      symbology: 'ean13',
      showText: false
    });
    expect(meta.error).toBeTruthy();
  });

  it('reutiliza la caché para el mismo contenido', () => {
    const options = {
      type: 'qr',
      text: 'CACHE-1',
      errorLevel: 'L',
      color: '#000000'
    };
    const first = generateCode(options);
    const second = generateCode(options);
    expect(second).toBe(first);
  });
});
