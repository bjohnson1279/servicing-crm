export type ChemicalUnit = 'oz' | 'fl oz' | 'gallons' | 'lbs' | 'granules';

export class ChemicalQuantity {
  private static readonly VALID_UNITS: ChemicalUnit[] = [
    'oz',
    'fl oz',
    'gallons',
    'lbs',
    'granules',
  ];

  private readonly amount: number;
  private readonly unit: ChemicalUnit;

  constructor(amount: number, unit: ChemicalUnit | string) {
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new Error(`Invalid chemical quantity amount: '${amount}'. Amount must be a positive number.`);
    }
    if (!ChemicalQuantity.isValidUnit(unit)) {
      throw new Error(
        `Invalid chemical quantity unit: '${unit}'. Must be one of: ${ChemicalQuantity.VALID_UNITS.join(', ')}`
      );
    }
    this.amount = amount;
    this.unit = unit as ChemicalUnit;
  }

  public static isValidUnit(unit: string): unit is ChemicalUnit {
    return ChemicalQuantity.VALID_UNITS.includes(unit as ChemicalUnit);
  }

  public getAmount(): number {
    return this.amount;
  }

  public getUnit(): ChemicalUnit {
    return this.unit;
  }

  public equals(other: ChemicalQuantity): boolean {
    return this.amount === other.getAmount() && this.unit === other.getUnit();
  }

  public toString(): string {
    return `${this.amount} ${this.unit}`;
  }
}
