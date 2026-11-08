import { describe, test, expect } from 'vitest';
import { DeviceType } from '../DeviceType';

describe('DeviceType Value Object', () => {
  test('creates valid DeviceType instances', () => {
    const baitStation = new DeviceType('bait_station');
    expect(baitStation.getValue()).toBe('bait_station');
    expect(baitStation.isBaitStation()).toBe(true);
    expect(baitStation.isTrap()).toBe(false);
    expect(baitStation.isMonitor()).toBe(false);
    expect(baitStation.getLabel()).toBe('bait station');
    expect(baitStation.toString()).toBe('bait_station');

    const trap = new DeviceType('trap');
    expect(trap.getValue()).toBe('trap');
    expect(trap.isBaitStation()).toBe(false);
    expect(trap.isTrap()).toBe(true);
    expect(trap.isMonitor()).toBe(false);
    expect(trap.getLabel()).toBe('trap');

    const monitor = new DeviceType('monitor');
    expect(monitor.getValue()).toBe('monitor');
    expect(monitor.isBaitStation()).toBe(false);
    expect(monitor.isTrap()).toBe(false);
    expect(monitor.isMonitor()).toBe(true);
    expect(monitor.getLabel()).toBe('monitor');
  });

  test('provides static constants', () => {
    expect(DeviceType.BAIT_STATION.getValue()).toBe('bait_station');
    expect(DeviceType.TRAP.getValue()).toBe('trap');
    expect(DeviceType.MONITOR.getValue()).toBe('monitor');
    expect(DeviceType.VALID_DEVICE_TYPES).toEqual(['bait_station', 'trap', 'monitor']);
  });

  test('normalizes casing and whitespace', () => {
    const dt = new DeviceType('  BAIT_STATION  ');
    expect(dt.getValue()).toBe('bait_station');
    expect(dt.isBaitStation()).toBe(true);
  });

  test('validates device types with isValid()', () => {
    expect(DeviceType.isValid('bait_station')).toBe(true);
    expect(DeviceType.isValid('trap')).toBe(true);
    expect(DeviceType.isValid('monitor')).toBe(true);
    expect(DeviceType.isValid('BAIT_STATION')).toBe(true);
    expect(DeviceType.isValid('  trap  ')).toBe(true);
    expect(DeviceType.isValid('sensor')).toBe(false);
    expect(DeviceType.isValid('')).toBe(false);
    expect(DeviceType.isValid(null as any)).toBe(false);
    expect(DeviceType.isValid(undefined as any)).toBe(false);
  });

  test('throws error for invalid device types', () => {
    expect(() => new DeviceType('sensor')).toThrow(/Invalid device type/);
    expect(() => new DeviceType('')).toThrow(/Device type cannot be empty/);
    expect(() => new DeviceType('   ')).toThrow(/Device type cannot be empty/);
    expect(() => new DeviceType(null as any)).toThrow(/Device type must be a string/);
    expect(() => new DeviceType(undefined as any)).toThrow(/Device type must be a string/);
  });

  test('implements value equality correctly', () => {
    const dt1 = new DeviceType('bait_station');
    const dt2 = new DeviceType('BAIT_STATION');
    const dt3 = new DeviceType('trap');

    expect(dt1.equals(dt2)).toBe(true);
    expect(dt1.equals(DeviceType.BAIT_STATION)).toBe(true);
    expect(dt1.equals('bait_station')).toBe(true);
    expect(dt1.equals('BAIT_STATION')).toBe(true);
    expect(dt1.equals('  bait_station  ')).toBe(true);

    expect(dt1.equals(dt3)).toBe(false);
    expect(dt1.equals('trap')).toBe(false);
    expect(dt1.equals(null as any)).toBe(false);
    expect(dt1.equals(undefined as any)).toBe(false);
  });
});
