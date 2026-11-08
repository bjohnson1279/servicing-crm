export type DeviceTypeValue = 'bait_station' | 'trap' | 'monitor';

/**
 * Value Object representing the classification or type of pest control device.
 * Enforces domain invariants for valid device categories according to pest management standards.
 */
export class DeviceType {
  public static readonly VALID_DEVICE_TYPES: readonly DeviceTypeValue[] = [
    'bait_station',
    'trap',
    'monitor',
  ] as const;

  public static readonly BAIT_STATION = new DeviceType('bait_station');
  public static readonly TRAP = new DeviceType('trap');
  public static readonly MONITOR = new DeviceType('monitor');

  private readonly value: DeviceTypeValue;

  constructor(value: DeviceTypeValue | string) {
    if (typeof value !== 'string') {
      throw new Error('Device type must be a string.');
    }

    const trimmed = value.trim().toLowerCase();

    if (!trimmed) {
      throw new Error('Device type cannot be empty.');
    }

    if (!DeviceType.isValid(trimmed)) {
      throw new Error(
        `Invalid device type: '${value}'. Must be one of: ${DeviceType.VALID_DEVICE_TYPES.join(', ')}`
      );
    }

    this.value = trimmed as DeviceTypeValue;
  }

  public static isValid(value: string): value is DeviceTypeValue {
    if (typeof value !== 'string') return false;
    return DeviceType.VALID_DEVICE_TYPES.includes(value.trim().toLowerCase() as DeviceTypeValue);
  }

  public getValue(): DeviceTypeValue {
    return this.value;
  }

  public isBaitStation(): boolean {
    return this.value === 'bait_station';
  }

  public isTrap(): boolean {
    return this.value === 'trap';
  }

  public isMonitor(): boolean {
    return this.value === 'monitor';
  }

  /**
   * Returns a user-friendly presentation label (e.g. 'bait station').
   */
  public getLabel(): string {
    return this.value.replace(/_/g, ' ');
  }

  public equals(other: DeviceType | string): boolean {
    if (!other) return false;
    if (typeof other === 'string') {
      return this.value === other.trim().toLowerCase();
    }
    return this.value === other.getValue();
  }

  public toString(): string {
    return this.value;
  }
}
