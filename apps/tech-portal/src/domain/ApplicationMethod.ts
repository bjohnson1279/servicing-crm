export type ApplicationMethodType =
  | 'Exterior Perimeter Barrier (Liquid Spray)'
  | 'Broadcast Granular Application'
  | 'Crack & Crevice Treatment'
  | 'Wall Void Dusting / Injection'
  | 'Tamper-Resistant Bait Stations'
  | 'Direct Nest Treatment'
  | 'Interior Baseboard Treatment';

/**
 * Value Object representing a pest control Chemical Application Method.
 * Encapsulates domain invariants, standard recognized application techniques,
 * and treatment targeting classifications.
 */
export class ApplicationMethod {
  public static readonly EXTERIOR_PERIMETER_BARRIER: ApplicationMethodType =
    'Exterior Perimeter Barrier (Liquid Spray)';
  public static readonly BROADCAST_GRANULAR: ApplicationMethodType =
    'Broadcast Granular Application';
  public static readonly CRACK_AND_CREVICE: ApplicationMethodType =
    'Crack & Crevice Treatment';
  public static readonly WALL_VOID_DUSTING: ApplicationMethodType =
    'Wall Void Dusting / Injection';
  public static readonly BAIT_STATIONS: ApplicationMethodType =
    'Tamper-Resistant Bait Stations';
  public static readonly DIRECT_NEST: ApplicationMethodType =
    'Direct Nest Treatment';
  public static readonly INTERIOR_BASEBOARD: ApplicationMethodType =
    'Interior Baseboard Treatment';

  public static readonly VALID_METHODS: readonly ApplicationMethodType[] = [
    ApplicationMethod.EXTERIOR_PERIMETER_BARRIER,
    ApplicationMethod.BROADCAST_GRANULAR,
    ApplicationMethod.CRACK_AND_CREVICE,
    ApplicationMethod.WALL_VOID_DUSTING,
    ApplicationMethod.BAIT_STATIONS,
    ApplicationMethod.DIRECT_NEST,
    ApplicationMethod.INTERIOR_BASEBOARD,
  ] as const;

  private readonly value: ApplicationMethodType;

  constructor(value: ApplicationMethodType | string) {
    if (typeof value !== 'string') {
      throw new Error('Application method must be a string.');
    }

    const trimmed = value.trim();

    if (!trimmed) {
      throw new Error('Application method cannot be empty.');
    }

    if (!ApplicationMethod.isValid(trimmed)) {
      throw new Error(
        `Invalid application method: '${value}'. Must be one of: ${ApplicationMethod.VALID_METHODS.join(', ')}`
      );
    }

    this.value = trimmed as ApplicationMethodType;
  }

  public static isValid(value: string): value is ApplicationMethodType {
    if (typeof value !== 'string') return false;
    return ApplicationMethod.VALID_METHODS.includes(value as ApplicationMethodType);
  }

  public getValue(): ApplicationMethodType {
    return this.value;
  }

  public isOutdoorTargeted(): boolean {
    return (
      this.value === ApplicationMethod.EXTERIOR_PERIMETER_BARRIER ||
      this.value === ApplicationMethod.BROADCAST_GRANULAR
    );
  }

  public isIndoorTargeted(): boolean {
    return (
      this.value === ApplicationMethod.INTERIOR_BASEBOARD ||
      this.value === ApplicationMethod.WALL_VOID_DUSTING
    );
  }

  public equals(other: ApplicationMethod | string): boolean {
    if (!other) return false;
    if (typeof other === 'string') {
      return this.value === other.trim();
    }
    return this.value === other.getValue();
  }

  public toString(): string {
    return this.value;
  }
}
