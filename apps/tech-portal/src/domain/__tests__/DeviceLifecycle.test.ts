import { describe, test, expect } from 'vitest';
import { DeviceLifecycle } from '../DeviceLifecycle';

describe('DeviceLifecycle Value Object', () => {
  test('creates valid DeviceLifecycle instances', () => {
    const planned = new DeviceLifecycle('planned');
    expect(planned.getValue()).toBe('planned');
    expect(planned.toString()).toBe('planned');
    expect(planned.isPlanned()).toBe(true);
    expect(planned.isInstalled()).toBe(false);
    expect(planned.isRetired()).toBe(false);
    expect(planned.canBeServiced()).toBe(false);

    const installed = new DeviceLifecycle('installed');
    expect(installed.getValue()).toBe('installed');
    expect(installed.toString()).toBe('installed');
    expect(installed.isPlanned()).toBe(false);
    expect(installed.isInstalled()).toBe(true);
    expect(installed.isRetired()).toBe(false);
    expect(installed.canBeServiced()).toBe(true);

    const retired = new DeviceLifecycle('retired');
    expect(retired.getValue()).toBe('retired');
    expect(retired.toString()).toBe('retired');
    expect(retired.isPlanned()).toBe(false);
    expect(retired.isInstalled()).toBe(false);
    expect(retired.isRetired()).toBe(true);
    expect(retired.canBeServiced()).toBe(false);
  });

  test('exposes static constant instances', () => {
    expect(DeviceLifecycle.PLANNED.getValue()).toBe('planned');
    expect(DeviceLifecycle.INSTALLED.getValue()).toBe('installed');
    expect(DeviceLifecycle.RETIRED.getValue()).toBe('retired');
  });

  test('normalizes casing and trims whitespace', () => {
    const lifecycle = new DeviceLifecycle('  INSTALLED  ');
    expect(lifecycle.getValue()).toBe('installed');
    expect(lifecycle.isInstalled()).toBe(true);
  });

  test('validates lifecycles using isValid', () => {
    expect(DeviceLifecycle.isValid('planned')).toBe(true);
    expect(DeviceLifecycle.isValid('installed')).toBe(true);
    expect(DeviceLifecycle.isValid('retired')).toBe(true);
    expect(DeviceLifecycle.isValid('PLANNED')).toBe(true);
    expect(DeviceLifecycle.isValid('  installed  ')).toBe(true);
    expect(DeviceLifecycle.isValid('active')).toBe(false);
    expect(DeviceLifecycle.isValid('')).toBe(false);
    expect(DeviceLifecycle.isValid(null as any)).toBe(false);
    expect(DeviceLifecycle.isValid(undefined as any)).toBe(false);
  });

  test('throws error for invalid, empty, or non-string inputs', () => {
    expect(() => new DeviceLifecycle('broken')).toThrow(/Invalid device lifecycle/);
    expect(() => new DeviceLifecycle('')).toThrow(/Device lifecycle cannot be empty/);
    expect(() => new DeviceLifecycle('   ')).toThrow(/Device lifecycle cannot be empty/);
    expect(() => new DeviceLifecycle(null as any)).toThrow(/Device lifecycle must be a string/);
    expect(() => new DeviceLifecycle(undefined as any)).toThrow(/Device lifecycle must be a string/);
  });

  test('validates state transitions accurately according to domain rules', () => {
    // Planned transitions
    expect(DeviceLifecycle.PLANNED.canTransitionTo(DeviceLifecycle.INSTALLED)).toBe(true);
    expect(DeviceLifecycle.PLANNED.canTransitionTo(DeviceLifecycle.RETIRED)).toBe(true);
    expect(DeviceLifecycle.PLANNED.canTransitionTo(DeviceLifecycle.PLANNED)).toBe(true);
    expect(DeviceLifecycle.PLANNED.canTransitionTo('installed')).toBe(true);
    expect(DeviceLifecycle.PLANNED.canTransitionTo('retired')).toBe(true);
    expect(DeviceLifecycle.PLANNED.canTransitionTo('unknown')).toBe(false);
    expect(DeviceLifecycle.PLANNED.canTransitionTo(null as any)).toBe(false);

    // Installed transitions
    expect(DeviceLifecycle.INSTALLED.canTransitionTo(DeviceLifecycle.RETIRED)).toBe(true);
    expect(DeviceLifecycle.INSTALLED.canTransitionTo(DeviceLifecycle.INSTALLED)).toBe(true);
    expect(DeviceLifecycle.INSTALLED.canTransitionTo(DeviceLifecycle.PLANNED)).toBe(false);
    expect(DeviceLifecycle.INSTALLED.canTransitionTo('planned')).toBe(false);

    // Retired transitions (terminal state)
    expect(DeviceLifecycle.RETIRED.canTransitionTo(DeviceLifecycle.RETIRED)).toBe(true);
    expect(DeviceLifecycle.RETIRED.canTransitionTo(DeviceLifecycle.PLANNED)).toBe(false);
    expect(DeviceLifecycle.RETIRED.canTransitionTo(DeviceLifecycle.INSTALLED)).toBe(false);
    expect(DeviceLifecycle.RETIRED.canTransitionTo('installed')).toBe(false);
  });

  test('checks equality across instances and strings', () => {
    const lifecycle1 = new DeviceLifecycle('installed');
    const lifecycle2 = new DeviceLifecycle('INSTALLED');
    const lifecycle3 = new DeviceLifecycle('planned');

    expect(lifecycle1.equals(lifecycle2)).toBe(true);
    expect(lifecycle1.equals(DeviceLifecycle.INSTALLED)).toBe(true);
    expect(lifecycle1.equals('installed')).toBe(true);
    expect(lifecycle1.equals('INSTALLED')).toBe(true);
    expect(lifecycle1.equals('  installed  ')).toBe(true);
    expect(lifecycle1.equals(lifecycle3)).toBe(false);
    expect(lifecycle1.equals(DeviceLifecycle.PLANNED)).toBe(false);
    expect(lifecycle1.equals('planned')).toBe(false);
    expect(lifecycle1.equals(null as any)).toBe(false);
  });
});
