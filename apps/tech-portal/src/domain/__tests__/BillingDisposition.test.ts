import { describe, it, expect } from 'vitest';
import { BillingDisposition } from '../BillingDisposition';

describe('BillingDisposition Value Object', () => {
  it('instantiates valid billing dispositions and normalizes case and whitespace', () => {
    const noCharge = new BillingDisposition('no_charge');
    expect(noCharge.getValue()).toBe('no_charge');
    expect(noCharge.isNoCharge()).toBe(true);
    expect(noCharge.isGoodwill()).toBe(false);
    expect(noCharge.isQuotedPaid()).toBe(false);

    const goodwill = new BillingDisposition('  GOODWILL ');
    expect(goodwill.getValue()).toBe('goodwill');
    expect(goodwill.isGoodwill()).toBe(true);

    const quotedPaid = new BillingDisposition('Quoted_Paid');
    expect(quotedPaid.getValue()).toBe('quoted_paid');
    expect(quotedPaid.isQuotedPaid()).toBe(true);
  });

  it('provides static constants for domain dispositions', () => {
    expect(BillingDisposition.NO_CHARGE.getValue()).toBe('no_charge');
    expect(BillingDisposition.GOODWILL.getValue()).toBe('goodwill');
    expect(BillingDisposition.QUOTED_PAID.getValue()).toBe('quoted_paid');
  });

  it('validates dispositions using isValid', () => {
    expect(BillingDisposition.isValid('no_charge')).toBe(true);
    expect(BillingDisposition.isValid('GOODWILL')).toBe(true);
    expect(BillingDisposition.isValid('quoted_paid')).toBe(true);
    expect(BillingDisposition.isValid('free')).toBe(false);
    expect(BillingDisposition.isValid('')).toBe(false);
    expect(BillingDisposition.isValid(null as any)).toBe(false);
    expect(BillingDisposition.isValid(undefined as any)).toBe(false);
  });

  it('throws descriptive errors on invalid inputs', () => {
    expect(() => new BillingDisposition('standard')).toThrow(/Invalid billing disposition/);
    expect(() => new BillingDisposition('')).toThrow(/Billing disposition cannot be empty/);
    expect(() => new BillingDisposition('   ')).toThrow(/Billing disposition cannot be empty/);
    expect(() => new BillingDisposition(null as any)).toThrow(/Billing disposition must be a string/);
    expect(() => new BillingDisposition(undefined as any)).toThrow(/Billing disposition must be a string/);
  });

  it('correctly assesses whether quote is required', () => {
    expect(BillingDisposition.NO_CHARGE.requiresQuote()).toBe(false);
    expect(BillingDisposition.GOODWILL.requiresQuote()).toBe(false);
    expect(BillingDisposition.QUOTED_PAID.requiresQuote()).toBe(true);
  });

  it('correctly identifies when manager override is required', () => {
    // Goodwill always requires manager approval
    expect(BillingDisposition.GOODWILL.requiresManagerOverride(true)).toBe(true);
    expect(BillingDisposition.GOODWILL.requiresManagerOverride(false)).toBe(true);

    // No charge requires override only if not covered
    expect(BillingDisposition.NO_CHARGE.requiresManagerOverride(true)).toBe(false);
    expect(BillingDisposition.NO_CHARGE.requiresManagerOverride(false)).toBe(true);

    // Quoted paid does not require manager override
    expect(BillingDisposition.QUOTED_PAID.requiresManagerOverride(true)).toBe(false);
    expect(BillingDisposition.QUOTED_PAID.requiresManagerOverride(false)).toBe(false);
  });

  it('provides human-readable labels matching ubiquitous language', () => {
    expect(BillingDisposition.NO_CHARGE.getLabel()).toBe('Covered — no charge');
    expect(BillingDisposition.GOODWILL.getLabel()).toBe('Goodwill — manager approval');
    expect(BillingDisposition.QUOTED_PAID.getLabel()).toBe('Paid — customer quote acceptance required');
  });

  it('supports equality check with VO or string', () => {
    const disp = new BillingDisposition('no_charge');
    expect(disp.equals(BillingDisposition.NO_CHARGE)).toBe(true);
    expect(disp.equals('no_charge')).toBe(true);
    expect(disp.equals('NO_CHARGE')).toBe(true);
    expect(disp.equals(BillingDisposition.GOODWILL)).toBe(false);
    expect(disp.equals('goodwill')).toBe(false);
    expect(disp.equals(null)).toBe(false);
    expect(disp.equals(undefined)).toBe(false);
    expect(disp.toString()).toBe('no_charge');
  });
});
