export type InspectionSeverityValue = 'low' | 'moderate' | 'high' | 'unknown';

/**
 * Value Object representing the severity level of pest activity or infestation in an inspection zone.
 * Enforces domain invariants for valid inspection severity classifications according to inspection capture specifications.
 */
export class InspectionSeverity {
  public static readonly VALID_SEVERITIES: readonly InspectionSeverityValue[] = [
    'low',
    'moderate',
    'high',
    'unknown',
  ] as const;

  public static readonly LOW = new InspectionSeverity('low');
  public static readonly MODERATE = new InspectionSeverity('moderate');
  public static readonly HIGH = new InspectionSeverity('high');
  public static readonly UNKNOWN = new InspectionSeverity('unknown');

  private readonly value: InspectionSeverityValue;

  constructor(value: InspectionSeverityValue | string) {
    if (typeof value !== 'string') {
      throw new Error('Inspection severity must be a string.');
    }

    const trimmed = value.trim().toLowerCase();

    if (!trimmed) {
      throw new Error('Inspection severity cannot be empty.');
    }

    if (!InspectionSeverity.isValid(trimmed)) {
      throw new Error(
        `Invalid inspection severity: '${value}'. Must be one of: ${InspectionSeverity.VALID_SEVERITIES.join(', ')}`
      );
    }

    this.value = trimmed as InspectionSeverityValue;
  }

  public static isValid(value: string): value is InspectionSeverityValue {
    if (typeof value !== 'string') return false;
    return InspectionSeverity.VALID_SEVERITIES.includes(
      value.trim().toLowerCase() as InspectionSeverityValue
    );
  }

  public getValue(): InspectionSeverityValue {
    return this.value;
  }

  public isLow(): boolean {
    return this.value === 'low';
  }

  public isModerate(): boolean {
    return this.value === 'moderate';
  }

  public isHigh(): boolean {
    return this.value === 'high';
  }

  public isUnknown(): boolean {
    return this.value === 'unknown';
  }

  public getLabel(): string {
    return this.value;
  }

  public equals(other: InspectionSeverity | string): boolean {
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
