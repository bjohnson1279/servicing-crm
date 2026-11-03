import { describe, test, expect } from 'vitest';
import { TargetPest } from '../TargetPest';

describe('TargetPest Value Object', () => {
  test('creates valid TargetPest instances for common pests', () => {
    const pest = new TargetPest('Ants');
    expect(pest.getValue()).toBe('Ants');
    expect(pest.toString()).toBe('Ants');
    expect(pest.isCommonPest()).toBe(true);
  });

  test('normalizes casing for common pests', () => {
    const pest = new TargetPest('ants');
    expect(pest.getValue()).toBe('Ants');
    expect(pest.isCommonPest()).toBe(true);

    const wasps = new TargetPest('  wasps & hornets  ');
    expect(wasps.getValue()).toBe('Wasps & Hornets');
    expect(wasps.isCommonPest()).toBe(true);
  });

  test('supports custom pest names within length constraints', () => {
    const custom = new TargetPest('Silverfish');
    expect(custom.getValue()).toBe('Silverfish');
    expect(custom.isCommonPest()).toBe(false);

    const trimmedCustom = new TargetPest('  Boxelder Bugs  ');
    expect(trimmedCustom.getValue()).toBe('Boxelder Bugs');
    expect(trimmedCustom.isCommonPest()).toBe(false);
  });

  test('exposes all recognized common pests in COMMON_PESTS', () => {
    expect(TargetPest.COMMON_PESTS).toHaveLength(9);
    expect(TargetPest.COMMON_PESTS).toContain('Ants');
    expect(TargetPest.COMMON_PESTS).toContain('Termites');
    expect(TargetPest.COMMON_PESTS).toContain('Cockroaches');
    expect(TargetPest.COMMON_PESTS).toContain('Spiders');
    expect(TargetPest.COMMON_PESTS).toContain('Wasps & Hornets');
    expect(TargetPest.COMMON_PESTS).toContain('Rodents');
    expect(TargetPest.COMMON_PESTS).toContain('Bed Bugs');
    expect(TargetPest.COMMON_PESTS).toContain('Mosquitoes');
    expect(TargetPest.COMMON_PESTS).toContain('Fleas & Ticks');
  });

  test('validates names using isValid', () => {
    expect(TargetPest.isValid('Ants')).toBe(true);
    expect(TargetPest.isValid('Silverfish')).toBe(true);
    expect(TargetPest.isValid('')).toBe(false);
    expect(TargetPest.isValid('   ')).toBe(false);
    expect(TargetPest.isValid(null as any)).toBe(false);
    expect(TargetPest.isValid(123 as any)).toBe(false);
    expect(TargetPest.isValid('a'.repeat(101))).toBe(false);
    expect(TargetPest.isValid('a'.repeat(100))).toBe(true);
  });

  test('throws error for empty or non-string inputs', () => {
    expect(() => new TargetPest('')).toThrow(/Target pest name cannot be empty/);
    expect(() => new TargetPest('   ')).toThrow(/Target pest name cannot be empty/);
    expect(() => new TargetPest(null as any)).toThrow(
      /Target pest name must be a string/
    );
    expect(() => new TargetPest(undefined as any)).toThrow(
      /Target pest name must be a string/
    );
  });

  test('throws error when pest name exceeds maximum length', () => {
    const overlyLong = 'P'.repeat(101);
    expect(() => new TargetPest(overlyLong)).toThrow(
      /Target pest name cannot exceed 100 characters/
    );
  });

  test('checks equality correctly across instances and strings', () => {
    const pest1 = new TargetPest('Cockroaches');
    const pest2 = new TargetPest('cockroaches');
    const pest3 = new TargetPest('Spiders');

    expect(pest1.equals(pest2)).toBe(true);
    expect(pest1.equals('Cockroaches')).toBe(true);
    expect(pest1.equals('cockroaches')).toBe(true);
    expect(pest1.equals('  Cockroaches  ')).toBe(true);
    expect(pest1.equals(pest3)).toBe(false);
    expect(pest1.equals('Spiders')).toBe(false);
    expect(pest1.equals(null as any)).toBe(false);
  });
});
