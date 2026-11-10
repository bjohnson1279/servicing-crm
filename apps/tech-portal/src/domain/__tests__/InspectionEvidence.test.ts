import { describe, test, expect } from 'vitest';
import { InspectionEvidence } from '../InspectionEvidence';

describe('InspectionEvidence Value Object', () => {
  test('creates valid InspectionEvidence instances', () => {
    const ev1 = new InspectionEvidence('observed');
    expect(ev1.getValue()).toBe('observed');
    expect(ev1.isObserved()).toBe(true);
    expect(ev1.isReported()).toBe(false);
    expect(ev1.isNone()).toBe(false);
    expect(ev1.isUnknown()).toBe(false);
    expect(ev1.getLabel()).toBe('observed');
    expect(ev1.toString()).toBe('observed');

    const ev2 = new InspectionEvidence('REPORTED ');
    expect(ev2.getValue()).toBe('reported');
    expect(ev2.isReported()).toBe(true);

    const ev3 = new InspectionEvidence('none');
    expect(ev3.isNone()).toBe(true);

    const ev4 = new InspectionEvidence('unknown');
    expect(ev4.isUnknown()).toBe(true);
  });

  test('validates valid and invalid evidence values using isValid', () => {
    expect(InspectionEvidence.isValid('observed')).toBe(true);
    expect(InspectionEvidence.isValid('reported')).toBe(true);
    expect(InspectionEvidence.isValid('none')).toBe(true);
    expect(InspectionEvidence.isValid('unknown')).toBe(true);
    expect(InspectionEvidence.isValid('  OBSERVED  ')).toBe(true);

    expect(InspectionEvidence.isValid('high')).toBe(false);
    expect(InspectionEvidence.isValid('')).toBe(false);
    expect(InspectionEvidence.isValid('   ')).toBe(false);
    expect(InspectionEvidence.isValid(null as unknown as string)).toBe(false);
    expect(InspectionEvidence.isValid(undefined as unknown as string)).toBe(false);
  });

  test('throws error for invalid values during construction', () => {
    expect(() => new InspectionEvidence('')).toThrow('Inspection evidence cannot be empty.');
    expect(() => new InspectionEvidence('   ')).toThrow('Inspection evidence cannot be empty.');
    expect(() => new InspectionEvidence(null as unknown as string)).toThrow(
      'Inspection evidence must be a string.'
    );
    expect(() => new InspectionEvidence(undefined as unknown as string)).toThrow(
      'Inspection evidence must be a string.'
    );
    expect(() => new InspectionEvidence('critical')).toThrow(
      "Invalid inspection evidence: 'critical'. Must be one of: observed, reported, none, unknown"
    );
  });

  test('checks equality between instances and string values', () => {
    const ev1 = new InspectionEvidence('observed');
    const ev2 = new InspectionEvidence('OBSERVED');
    const ev3 = new InspectionEvidence('reported');

    expect(ev1.equals(ev2)).toBe(true);
    expect(ev1.equals('observed')).toBe(true);
    expect(ev1.equals(' OBSERVED ')).toBe(true);
    expect(ev1.equals(ev3)).toBe(false);
    expect(ev1.equals('none')).toBe(false);
    expect(ev1.equals(null as unknown as InspectionEvidence)).toBe(false);
  });

  test('exposes static constant instances and list of valid values', () => {
    expect(InspectionEvidence.OBSERVED.getValue()).toBe('observed');
    expect(InspectionEvidence.REPORTED.getValue()).toBe('reported');
    expect(InspectionEvidence.NONE.getValue()).toBe('none');
    expect(InspectionEvidence.UNKNOWN.getValue()).toBe('unknown');
    expect(InspectionEvidence.VALID_EVIDENCES).toEqual([
      'observed',
      'reported',
      'none',
      'unknown',
    ]);
  });
});
