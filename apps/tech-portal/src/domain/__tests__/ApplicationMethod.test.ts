import { describe, test, expect } from 'vitest';
import { ApplicationMethod } from '../ApplicationMethod';

describe('ApplicationMethod Value Object', () => {
  test('creates valid ApplicationMethod instances', () => {
    const method = new ApplicationMethod('Exterior Perimeter Barrier (Liquid Spray)');
    expect(method.getValue()).toBe('Exterior Perimeter Barrier (Liquid Spray)');
    expect(method.toString()).toBe('Exterior Perimeter Barrier (Liquid Spray)');
  });

  test('trims whitespace on construction', () => {
    const method = new ApplicationMethod('  Direct Nest Treatment  ');
    expect(method.getValue()).toBe('Direct Nest Treatment');
  });

  test('exposes all recognized methods in VALID_METHODS', () => {
    expect(ApplicationMethod.VALID_METHODS).toHaveLength(7);
    expect(ApplicationMethod.VALID_METHODS).toContain(
      'Exterior Perimeter Barrier (Liquid Spray)'
    );
    expect(ApplicationMethod.VALID_METHODS).toContain(
      'Broadcast Granular Application'
    );
    expect(ApplicationMethod.VALID_METHODS).toContain(
      'Crack & Crevice Treatment'
    );
    expect(ApplicationMethod.VALID_METHODS).toContain(
      'Wall Void Dusting / Injection'
    );
    expect(ApplicationMethod.VALID_METHODS).toContain(
      'Tamper-Resistant Bait Stations'
    );
    expect(ApplicationMethod.VALID_METHODS).toContain('Direct Nest Treatment');
    expect(ApplicationMethod.VALID_METHODS).toContain(
      'Interior Baseboard Treatment'
    );
  });

  test('validates application methods with isValid', () => {
    expect(
      ApplicationMethod.isValid('Exterior Perimeter Barrier (Liquid Spray)')
    ).toBe(true);
    expect(
      ApplicationMethod.isValid('Broadcast Granular Application')
    ).toBe(true);
    expect(ApplicationMethod.isValid('Invalid Method')).toBe(false);
    expect(ApplicationMethod.isValid('')).toBe(false);
  });

  test('throws error for invalid application method', () => {
    expect(() => new ApplicationMethod('Aerial Spray')).toThrow(
      /Invalid application method/
    );
  });

  test('throws error for empty or non-string input', () => {
    expect(() => new ApplicationMethod('')).toThrow(
      /Application method cannot be empty/
    );
    expect(() => new ApplicationMethod('   ')).toThrow(
      /Application method cannot be empty/
    );
    expect(() => new ApplicationMethod(null as any)).toThrow(
      /Application method must be a string/
    );
    expect(() => new ApplicationMethod(123 as any)).toThrow(
      /Application method must be a string/
    );
  });

  test('correctly identifies outdoor vs indoor targeted methods', () => {
    const exterior = new ApplicationMethod(
      ApplicationMethod.EXTERIOR_PERIMETER_BARRIER
    );
    const granular = new ApplicationMethod(
      ApplicationMethod.BROADCAST_GRANULAR
    );
    const baseboard = new ApplicationMethod(
      ApplicationMethod.INTERIOR_BASEBOARD
    );
    const wallVoid = new ApplicationMethod(
      ApplicationMethod.WALL_VOID_DUSTING
    );
    const nest = new ApplicationMethod(ApplicationMethod.DIRECT_NEST);

    expect(exterior.isOutdoorTargeted()).toBe(true);
    expect(exterior.isIndoorTargeted()).toBe(false);

    expect(granular.isOutdoorTargeted()).toBe(true);
    expect(granular.isIndoorTargeted()).toBe(false);

    expect(baseboard.isOutdoorTargeted()).toBe(false);
    expect(baseboard.isIndoorTargeted()).toBe(true);

    expect(wallVoid.isOutdoorTargeted()).toBe(false);
    expect(wallVoid.isIndoorTargeted()).toBe(true);

    expect(nest.isOutdoorTargeted()).toBe(false);
    expect(nest.isIndoorTargeted()).toBe(false);
  });

  test('checks equality correctly', () => {
    const method1 = new ApplicationMethod(
      ApplicationMethod.CRACK_AND_CREVICE
    );
    const method2 = new ApplicationMethod(
      'Crack & Crevice Treatment'
    );
    const method3 = new ApplicationMethod(
      ApplicationMethod.BAIT_STATIONS
    );

    expect(method1.equals(method2)).toBe(true);
    expect(method1.equals('Crack & Crevice Treatment')).toBe(true);
    expect(method1.equals(method3)).toBe(false);
    expect(method1.equals(null as any)).toBe(false);
  });
});
