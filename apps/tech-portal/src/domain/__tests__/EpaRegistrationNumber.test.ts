import { describe, test, expect } from 'vitest';
import { EpaRegistrationNumber } from '../EpaRegistrationNumber';

describe('EpaRegistrationNumber Value Object', () => {
  test('creates valid EpaRegistrationNumber with 2-part and 3-part numbers', () => {
    const epa1 = new EpaRegistrationNumber('12345-678');
    expect(epa1.getValue()).toBe('12345-678');
    expect(epa1.toString()).toBe('12345-678');

    const epa2 = new EpaRegistrationNumber(' 12345-678-90123  ');
    expect(epa2.getValue()).toBe('12345-678-90123');
  });

  test('validates format with isValid static method', () => {
    expect(EpaRegistrationNumber.isValid('12345-678')).toBe(true);
    expect(EpaRegistrationNumber.isValid('100-1234')).toBe(true);
    expect(EpaRegistrationNumber.isValid('100-1234-567')).toBe(true);

    expect(EpaRegistrationNumber.isValid('')).toBe(false);
    expect(EpaRegistrationNumber.isValid('abc')).toBe(false);
    expect(EpaRegistrationNumber.isValid('12345')).toBe(false);
    expect(EpaRegistrationNumber.isValid('12345-abc')).toBe(false);
  });

  test('throws error for invalid registration numbers', () => {
    expect(() => new EpaRegistrationNumber('')).toThrow('EPA Registration Number cannot be empty.');
    expect(() => new EpaRegistrationNumber('   ')).toThrow('EPA Registration Number cannot be empty.');
    expect(() => new EpaRegistrationNumber('invalid-epa')).toThrow('Invalid EPA Registration Number format');
    expect(() => new EpaRegistrationNumber('12345')).toThrow('Invalid EPA Registration Number format');
  });

  test('compares equality correctly', () => {
    const epa1 = new EpaRegistrationNumber('12345-678');
    const epa2 = new EpaRegistrationNumber('12345-678');
    const epa3 = new EpaRegistrationNumber('99999-111');

    expect(epa1.equals(epa2)).toBe(true);
    expect(epa1.equals(epa3)).toBe(false);
    expect(epa1.equals('12345-678')).toBe(true);
    expect(epa1.equals(' 12345-678 ')).toBe(true);
    expect(epa1.equals('99999-111')).toBe(false);
  });
});
