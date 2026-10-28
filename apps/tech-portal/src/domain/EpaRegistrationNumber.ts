/**
 * Value Object representing an EPA Registration Number.
 * Standard EPA Registration Numbers consist of 2 or 3 sets of numbers separated by hyphens
 * (e.g., Company Number - Product Number - optional Distributor Number: "12345-678" or "12345-678-90123").
 */
export class EpaRegistrationNumber {
  private static readonly EPA_REG_PATTERN = /^\d+-\d+(-\d+)?$/;

  private readonly value: string;

  constructor(value: string) {
    if (typeof value !== 'string') {
      throw new Error('EPA Registration Number must be a string.');
    }

    const trimmed = value.trim();

    if (!trimmed) {
      throw new Error('EPA Registration Number cannot be empty.');
    }

    if (!EpaRegistrationNumber.isValid(trimmed)) {
      throw new Error(
        `Invalid EPA Registration Number format: '${value}'. Expected format: '12345-678' or '12345-678-90123'.`
      );
    }

    this.value = trimmed;
  }

  public static isValid(value: string): boolean {
    if (typeof value !== 'string') return false;
    return EpaRegistrationNumber.EPA_REG_PATTERN.test(value.trim());
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: EpaRegistrationNumber | string): boolean {
    if (typeof other === 'string') {
      return this.value === other.trim();
    }
    return Boolean(other) && this.value === other.getValue();
  }

  public toString(): string {
    return this.value;
  }
}
