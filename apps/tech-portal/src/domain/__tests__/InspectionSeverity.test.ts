import { describe, test, expect } from 'vitest';
import { InspectionSeverity } from '../InspectionSeverity';

describe('InspectionSeverity Value Object', () => {
  test('creates valid InspectionSeverity instances', () => {
    const sev1 = new InspectionSeverity('low');
    expect(sev1.getValue()).toBe('low');
    expect(sev1.isLow()).toBe(true);
    expect(sev1.isModerate()).toBe(false);
    expect(sev1.isHigh()).toBe(false);
    expect(sev1.isUnknown()).toBe(false);
    expect(sev1.getLabel()).toBe('low');
    expect(sev1.toString()).toBe('low');

    const sev2 = new InspectionSeverity('MODERATE ');
    expect(sev2.getValue()).toBe('moderate');
    expect(sev2.isModerate()).toBe(true);

    const sev3 = new InspectionSeverity('high');
    expect(sev3.isHigh()).toBe(true);

    const sev4 = new InspectionSeverity('unknown');
    expect(sev4.isUnknown()).toBe(true);
  });

  test('validates valid and invalid severity values using isValid', () => {
    expect(InspectionSeverity.isValid('low')).toBe(true);
    expect(InspectionSeverity.isValid('moderate')).toBe(true);
    expect(InspectionSeverity.isValid('high')).toBe(true);
    expect(InspectionSeverity.isValid('unknown')).toBe(true);
    expect(InspectionSeverity.isValid('  HIGH  ')).toBe(true);

    expect(InspectionSeverity.isValid('extreme')).toBe(false);
    expect(InspectionSeverity.isValid('')).toBe(false);
    expect(InspectionSeverity.isValid('   ')).toBe(false);
    expect(InspectionSeverity.isValid(null as unknown as string)).toBe(false);
    expect(InspectionSeverity.isValid(undefined as unknown as string)).toBe(false);
  });

  test('throws error for invalid values during construction', () => {
    expect(() => new InspectionSeverity('')).toThrow('Inspection severity cannot be empty.');
    expect(() => new InspectionSeverity('   ')).toThrow('Inspection severity cannot be empty.');
    expect(() => new InspectionSeverity(null as unknown as string)).toThrow(
      'Inspection severity must be a string.'
    );
    expect(() => new InspectionSeverity(undefined as unknown as string)).toThrow(
      'Inspection severity must be a string.'
    );
    expect(() => new InspectionSeverity('critical')).toThrow(
      "Invalid inspection severity: 'critical'. Must be one of: low, moderate, high, unknown"
    );
  });

  test('checks equality between instances and string values', () => {
    const sev1 = new InspectionSeverity('high');
    const sev2 = new InspectionSeverity('HIGH');
    const sev3 = new InspectionSeverity('low');

    expect(sev1.equals(sev2)).toBe(true);
    expect(sev1.equals('high')).toBe(true);
    expect(sev1.equals(' HIGH ')).toBe(true);
    expect(sev1.equals(sev3)).toBe(false);
    expect(sev1.equals('moderate')).toBe(false);
    expect(sev1.equals(null as unknown as InspectionSeverity)).toBe(false);
  });

  test('exposes static constant instances and list of valid values', () => {
    expect(InspectionSeverity.LOW.getValue()).toBe('low');
    expect(InspectionSeverity.MODERATE.getValue()).toBe('moderate');
    expect(InspectionSeverity.HIGH.getValue()).toBe('high');
    expect(InspectionSeverity.UNKNOWN.getValue()).toBe('unknown');
    expect(InspectionSeverity.VALID_SEVERITIES).toEqual([
      'low',
      'moderate',
      'high',
      'unknown',
    ]);
  });
});
