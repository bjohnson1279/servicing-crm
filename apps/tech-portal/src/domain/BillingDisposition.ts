export type BillingDispositionValue = 'no_charge' | 'goodwill' | 'quoted_paid';

/**
 * Value Object representing the billing disposition of a service callback or warranty return visit.
 * Enforces domain invariants for allowed billing types and provides business domain helpers.
 */
export class BillingDisposition {
  public static readonly VALID_DISPOSITIONS: readonly BillingDispositionValue[] = [
    'no_charge',
    'goodwill',
    'quoted_paid',
  ] as const;

  public static readonly NO_CHARGE = new BillingDisposition('no_charge');
  public static readonly GOODWILL = new BillingDisposition('goodwill');
  public static readonly QUOTED_PAID = new BillingDisposition('quoted_paid');

  private readonly value: BillingDispositionValue;

  constructor(value: BillingDispositionValue | string) {
    if (typeof value !== 'string') {
      throw new Error('Billing disposition must be a string.');
    }

    const trimmed = value.trim().toLowerCase();

    if (!trimmed) {
      throw new Error('Billing disposition cannot be empty.');
    }

    if (!BillingDisposition.isValid(trimmed)) {
      throw new Error(
        `Invalid billing disposition: '${value}'. Must be one of: ${BillingDisposition.VALID_DISPOSITIONS.join(', ')}`
      );
    }

    this.value = trimmed as BillingDispositionValue;
  }

  public static isValid(value: string): value is BillingDispositionValue {
    if (typeof value !== 'string') return false;
    return BillingDisposition.VALID_DISPOSITIONS.includes(
      value.trim().toLowerCase() as BillingDispositionValue
    );
  }

  public getValue(): BillingDispositionValue {
    return this.value;
  }

  public isNoCharge(): boolean {
    return this.value === 'no_charge';
  }

  public isGoodwill(): boolean {
    return this.value === 'goodwill';
  }

  public isQuotedPaid(): boolean {
    return this.value === 'quoted_paid';
  }

  /**
   * Quoted paid disposition requires quote generation and customer acceptance.
   */
  public requiresQuote(): boolean {
    return this.isQuotedPaid();
  }

  /**
   * Manager override is required if goodwill is granted or if no-charge is given when coverage is not covered.
   */
  public requiresManagerOverride(isCovered: boolean): boolean {
    if (this.isGoodwill()) {
      return true;
    }
    if (this.isNoCharge() && !isCovered) {
      return true;
    }
    return false;
  }

  public getLabel(): string {
    switch (this.value) {
      case 'no_charge':
        return 'Covered — no charge';
      case 'goodwill':
        return 'Goodwill — manager approval';
      case 'quoted_paid':
        return 'Paid — customer quote acceptance required';
    }
  }

  public equals(other: BillingDisposition | string | null | undefined): boolean {
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
