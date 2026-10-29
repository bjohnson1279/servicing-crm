import { describe, test, expect } from 'vitest';
import { ChemicalQuantity } from '../ChemicalQuantity';

describe('ChemicalQuantity Value Object', () => {
  test('creates valid ChemicalQuantity instances', () => {
    const qty = new ChemicalQuantity(2.5, 'oz');
    expect(qty.getAmount()).toBe(2.5);
    expect(qty.getUnit()).toBe('oz');
    expect(qty.toString()).toBe('2.5 oz');
  });

  test('validates units correctly using isValidUnit static method', () => {
    expect(ChemicalQuantity.isValidUnit('oz')).toBe(true);
    expect(ChemicalQuantity.isValidUnit('fl oz')).toBe(true);
    expect(ChemicalQuantity.isValidUnit('gallons')).toBe(true);
    expect(ChemicalQuantity.isValidUnit('lbs')).toBe(true);
    expect(ChemicalQuantity.isValidUnit('granules')).toBe(true);
    expect(ChemicalQuantity.isValidUnit('liters')).toBe(false);
    expect(ChemicalQuantity.isValidUnit('')).toBe(false);
  });

  test('throws error for non-positive or non-numeric amount', () => {
    expect(() => new ChemicalQuantity(0, 'oz')).toThrow(/Amount must be a positive number/);
    expect(() => new ChemicalQuantity(-5, 'fl oz')).toThrow(/Amount must be a positive number/);
    expect(() => new ChemicalQuantity(NaN, 'gallons')).toThrow(/Amount must be a positive number/);
  });

  test('throws error for invalid chemical quantity unit', () => {
    expect(() => new ChemicalQuantity(1, 'liters')).toThrow(/Invalid chemical quantity unit/);
    expect(() => new ChemicalQuantity(1, '')).toThrow(/Invalid chemical quantity unit/);
  });

  test('checks equality between ChemicalQuantity instances', () => {
    const qty1 = new ChemicalQuantity(1.5, 'fl oz');
    const qty2 = new ChemicalQuantity(1.5, 'fl oz');
    const qty3 = new ChemicalQuantity(2.0, 'fl oz');
    const qty4 = new ChemicalQuantity(1.5, 'oz');

    expect(qty1.equals(qty2)).toBe(true);
    expect(qty1.equals(qty3)).toBe(false);
    expect(qty1.equals(qty4)).toBe(false);
  });
});
