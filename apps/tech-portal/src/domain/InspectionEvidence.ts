export type InspectionEvidenceValue = 'observed' | 'reported' | 'none' | 'unknown';

/**
 * Value Object representing the level/type of evidence for pest activity observed in an inspection zone.
 * Enforces domain invariants for valid inspection evidence according to inspection capture specifications.
 */
export class InspectionEvidence {
  public static readonly VALID_EVIDENCES: readonly InspectionEvidenceValue[] = [
    'observed',
    'reported',
    'none',
    'unknown',
  ] as const;

  public static readonly OBSERVED = new InspectionEvidence('observed');
  public static readonly REPORTED = new InspectionEvidence('reported');
  public static readonly NONE = new InspectionEvidence('none');
  public static readonly UNKNOWN = new InspectionEvidence('unknown');

  private readonly value: InspectionEvidenceValue;

  constructor(value: InspectionEvidenceValue | string) {
    if (typeof value !== 'string') {
      throw new Error('Inspection evidence must be a string.');
    }

    const trimmed = value.trim().toLowerCase();

    if (!trimmed) {
      throw new Error('Inspection evidence cannot be empty.');
    }

    if (!InspectionEvidence.isValid(trimmed)) {
      throw new Error(
        `Invalid inspection evidence: '${value}'. Must be one of: ${InspectionEvidence.VALID_EVIDENCES.join(', ')}`
      );
    }

    this.value = trimmed as InspectionEvidenceValue;
  }

  public static isValid(value: string): value is InspectionEvidenceValue {
    if (typeof value !== 'string') return false;
    return InspectionEvidence.VALID_EVIDENCES.includes(
      value.trim().toLowerCase() as InspectionEvidenceValue
    );
  }

  public getValue(): InspectionEvidenceValue {
    return this.value;
  }

  public isObserved(): boolean {
    return this.value === 'observed';
  }

  public isReported(): boolean {
    return this.value === 'reported';
  }

  public isNone(): boolean {
    return this.value === 'none';
  }

  public isUnknown(): boolean {
    return this.value === 'unknown';
  }

  public getLabel(): string {
    return this.value;
  }

  public equals(other: InspectionEvidence | string): boolean {
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
