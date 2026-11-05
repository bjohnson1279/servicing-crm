export type DeviceLifecycleValue = 'planned' | 'installed' | 'retired';

/**
 * Value Object representing the lifecycle state of a pest control device (e.g. bait station, trap, monitor).
 * Enforces domain invariants for valid lifecycle states and valid lifecycle transitions.
 */
export class DeviceLifecycle {
  public static readonly VALID_LIFECYCLES: readonly DeviceLifecycleValue[] = [
    'planned',
    'installed',
    'retired',
  ] as const;

  public static readonly PLANNED = new DeviceLifecycle('planned');
  public static readonly INSTALLED = new DeviceLifecycle('installed');
  public static readonly RETIRED = new DeviceLifecycle('retired');

  private readonly value: DeviceLifecycleValue;

  constructor(value: DeviceLifecycleValue | string) {
    if (typeof value !== 'string') {
      throw new Error('Device lifecycle must be a string.');
    }

    const trimmed = value.trim().toLowerCase();

    if (!trimmed) {
      throw new Error('Device lifecycle cannot be empty.');
    }

    if (!DeviceLifecycle.isValid(trimmed)) {
      throw new Error(
        `Invalid device lifecycle: '${value}'. Must be one of: ${DeviceLifecycle.VALID_LIFECYCLES.join(', ')}`
      );
    }

    this.value = trimmed as DeviceLifecycleValue;
  }

  public static isValid(value: string): value is DeviceLifecycleValue {
    if (typeof value !== 'string') return false;
    return DeviceLifecycle.VALID_LIFECYCLES.includes(value.trim().toLowerCase() as DeviceLifecycleValue);
  }

  public getValue(): DeviceLifecycleValue {
    return this.value;
  }

  public isPlanned(): boolean {
    return this.value === 'planned';
  }

  public isInstalled(): boolean {
    return this.value === 'installed';
  }

  public isRetired(): boolean {
    return this.value === 'retired';
  }

  /**
   * Only installed devices can be actively serviced.
   * Planned devices must first be installed; retired devices are immutable historical records.
   */
  public canBeServiced(): boolean {
    return this.isInstalled();
  }

  /**
   * Validates whether a lifecycle transition from this state to the next state is permitted.
   * planned -> installed | retired
   * installed -> retired
   * retired -> none (terminal state)
   */
  public canTransitionTo(next: DeviceLifecycle | DeviceLifecycleValue | string): boolean {
    if (!next) return false;
    const nextValue = next instanceof DeviceLifecycle ? next.getValue() : next.trim().toLowerCase();

    if (!DeviceLifecycle.isValid(nextValue)) {
      return false;
    }

    if (this.value === nextValue) {
      return true; // No-op transition
    }

    switch (this.value) {
      case 'planned':
        return nextValue === 'installed' || nextValue === 'retired';
      case 'installed':
        return nextValue === 'retired';
      case 'retired':
        return false;
      default:
        return false;
    }
  }

  public equals(other: DeviceLifecycle | string): boolean {
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
