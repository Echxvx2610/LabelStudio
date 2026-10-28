import { describe, it, expect } from 'vitest';
import {
  assessCodeReadability,
  codeLayout,
  ean13CheckDigit,
  validateBarcode,
  validateQr
} from '../src/renderer/editor/element-validation.js';

describe('validación de códigos de barras', () => {
  it('acepta Code 128 con ASCII imprimible', () => {
    expect(validateBarcode('code128', 'EQ-0001/A').valid).toBe(true);
  });

  it('rechaza acentos en Code 128', () => {
    const result = validateBarcode('code128', 'EQ-ÁÑ');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('ASCII');
  });

  it('normaliza Code 39 a mayúsculas y avisa', () => {
    const result = validateBarcode('code39', 'eq-01');
    expect(result.valid).toBe(true);
    expect(result.text).toBe('EQ-01');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('rechaza caracteres no válidos en Code 39', () => {
    expect(validateBarcode('code39', 'EQ_01').valid).toBe(false);
  });

  it('calcula el dígito verificador de EAN-13', () => {
    expect(ean13CheckDigit('123456789012')).toBe(8);
  });

  it('acepta EAN-13 de 12 o 13 dígitos con verificador correcto', () => {
    expect(validateBarcode('ean13', '123456789012').valid).toBe(true);
    expect(validateBarcode('ean13', '1234567890128').valid).toBe(true);
    expect(validateBarcode('ean13', '1234567890123').valid).toBe(false);
  });

  it('rechaza letras en EAN-13', () => {
    expect(validateBarcode('ean13', '12345678901A').valid).toBe(false);
  });

  it('exige cantidad par de dígitos en ITF', () => {
    expect(validateBarcode('interleaved2of5', '123456').valid).toBe(true);
    expect(validateBarcode('interleaved2of5', '12345').valid).toBe(false);
  });

  it('acepta texto libre en DataMatrix', () => {
    expect(validateBarcode('datamatrix', 'EQ-0001 / Área 4').valid).toBe(true);
  });

  it('rechaza contenido vacío', () => {
    expect(validateBarcode('code128', '').valid).toBe(false);
    expect(validateQr('', 'M').valid).toBe(false);
  });
});

describe('validación de QR', () => {
  it('acepta texto normal', () => {
    const result = validateQr('EQ-0001', 'M');
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('avisa con contenido no ASCII', () => {
    const result = validateQr('Etiqueta Á', 'M');
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('rechaza contenido que supera la capacidad', () => {
    const result = validateQr('x'.repeat(3000), 'H');
    expect(result.valid).toBe(false);
  });
});

describe('legibilidad de códigos', () => {
  const linearMeta = {
    kind: 'linear',
    naturalWidth: 404,
    naturalHeight: 145,
    modulePx: 4,
    modules: 101
  };

  it('calcula el tamaño de módulo de un código lineal', () => {
    const element = {
      type: 'barcode',
      symbology: 'code128',
      w: 30,
      h: 12,
      quietZone: 1,
      showText: true
    };
    const layout = codeLayout(element, linearMeta);
    expect(layout.moduleMm).toBeCloseTo(4 * (10 / 145), 6);
    expect(assessCodeReadability(element, linearMeta).level).toBe('ok');
  });

  it('marca error cuando el código lineal es demasiado estrecho', () => {
    const element = {
      type: 'barcode',
      symbology: 'code128',
      w: 8,
      h: 12,
      quietZone: 1,
      showText: false
    };
    const assessment = assessCodeReadability(element, linearMeta);
    expect(assessment.level).toBe('error');
    expect(assessment.moduleMm).toBeLessThan(0.15);
  });

  it('descuenta la quiet zone del QR', () => {
    const element = { type: 'qr', w: 14, h: 14, quietZone: 1 };
    const meta = {
      kind: 'matrix',
      naturalWidth: 168,
      naturalHeight: 168,
      modulePx: 8,
      modules: 21
    };
    const layout = codeLayout(element, meta);
    expect(layout.w).toBeCloseTo(12, 6);
    expect(layout.moduleMm).toBeCloseTo(12 / 21, 6);
    expect(assessCodeReadability(element, meta).level).toBe('ok');
  });

  it('marca error con un QR diminuto', () => {
    const element = { type: 'qr', w: 6, h: 6, quietZone: 0.5 };
    const meta = {
      kind: 'matrix',
      naturalWidth: 168,
      naturalHeight: 168,
      modulePx: 8,
      modules: 21
    };
    const assessment = assessCodeReadability(element, meta);
    expect(assessment.level).toBe('error');
  });

  it('propaga el error de generación', () => {
    const assessment = assessCodeReadability({ type: 'qr', w: 10, h: 10 }, { error: 'inválido' });
    expect(assessment.level).toBe('error');
    expect(assessment.messages[0]).toBe('inválido');
  });
});
