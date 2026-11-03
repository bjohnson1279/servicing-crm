export type CommonPestType =
  | 'Ants'
  | 'Termites'
  | 'Cockroaches'
  | 'Spiders'
  | 'Wasps & Hornets'
  | 'Rodents'
  | 'Bed Bugs'
  | 'Mosquitoes'
  | 'Fleas & Ticks';

/**
 * Value Object representing a Target Pest in pest control chemical application.
 * Encapsulates domain invariants for pest names, provides canonical recognition
 * of common target pests, and ensures immutability.
 */
export class TargetPest {
  public static readonly COMMON_PESTS: readonly CommonPestType[] = [
    'Ants',
    'Termites',
    'Cockroaches',
    'Spiders',
    'Wasps & Hornets',
    'Rodents',
    'Bed Bugs',
    'Mosquitoes',
    'Fleas & Ticks',
  ] as const;

  private static readonly MAX_LENGTH = 100;

  private readonly value: string;

  constructor(name: string) {
    if (typeof name !== 'string') {
      throw new Error('Target pest name must be a string.');
    }

    const trimmed = name.trim();

    if (!trimmed) {
      throw new Error('Target pest name cannot be empty.');
    }

    if (trimmed.length > TargetPest.MAX_LENGTH) {
      throw new Error(
        `Target pest name cannot exceed ${TargetPest.MAX_LENGTH} characters.`
      );
    }

    // If matches a known common pest (case-insensitive), normalize to canonical casing
    const matchedCommon = TargetPest.COMMON_PESTS.find(
      (p) => p.toLowerCase() === trimmed.toLowerCase()
    );

    this.value = matchedCommon || trimmed;
  }

  public static isValid(name: string): boolean {
    if (typeof name !== 'string') return false;
    const trimmed = name.trim();
    return trimmed.length > 0 && trimmed.length <= TargetPest.MAX_LENGTH;
  }

  public getValue(): string {
    return this.value;
  }

  public isCommonPest(): boolean {
    return TargetPest.COMMON_PESTS.includes(this.value as CommonPestType);
  }

  public equals(other: TargetPest | string): boolean {
    if (!other) return false;
    if (typeof other === 'string') {
      return this.value.toLowerCase() === other.trim().toLowerCase();
    }
    return this.value.toLowerCase() === other.getValue().toLowerCase();
  }

  public toString(): string {
    return this.value;
  }
}
