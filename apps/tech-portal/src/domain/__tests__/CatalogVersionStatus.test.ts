import { describe, expect, it } from 'vitest';
import {
  CatalogVersionStatus,
  CatalogVersionStatusValue,
} from '../CatalogVersionStatus';

describe('CatalogVersionStatus Value Object', () => {
  it('instantiates valid catalog version statuses correctly', () => {
    for (const valid of CatalogVersionStatus.VALID_STATUSES) {
      const status = new CatalogVersionStatus(valid);
      expect(status.getValue()).toBe(valid);
      expect(status.toString()).toBe(valid);
    }
  });

  it('normalizes whitespace and case sensitivity', () => {
    const status = new CatalogVersionStatus('  IN_REVIEW  ');
    expect(status.getValue()).toBe('in_review');
    expect(status.isInReview()).toBe(true);
    expect(status.getLabel()).toBe('in review');
  });

  it('throws on invalid status value or empty string', () => {
    expect(() => new CatalogVersionStatus('')).toThrow(
      'Catalog version status cannot be empty.'
    );
    expect(() => new CatalogVersionStatus('   ')).toThrow(
      'Catalog version status cannot be empty.'
    );
    expect(() => new CatalogVersionStatus('invalid_status')).toThrow(
      "Invalid catalog version status: 'invalid_status'."
    );
    // @ts-expect-error test non-string runtime argument
    expect(() => new CatalogVersionStatus(123)).toThrow(
      'Catalog version status must be a string.'
    );
  });

  it('validates statuses correctly using isValid static method', () => {
    expect(CatalogVersionStatus.isValid('draft')).toBe(true);
    expect(CatalogVersionStatus.isValid('active')).toBe(true);
    expect(CatalogVersionStatus.isValid('SUPERSEDED')).toBe(true);
    expect(CatalogVersionStatus.isValid('pending')).toBe(false);
    expect(CatalogVersionStatus.isValid('')).toBe(false);
    expect(CatalogVersionStatus.isValid(null as unknown as string)).toBe(false);
  });

  it('correctly reports domain state predicates', () => {
    const draft = CatalogVersionStatus.DRAFT;
    expect(draft.isDraft()).toBe(true);
    expect(draft.isEditable()).toBe(true);
    expect(draft.isOpen()).toBe(true);
    expect(draft.canActivateOrReject()).toBe(false);
    expect(draft.canWithdraw()).toBe(false);
    expect(draft.canCreateSuccessorDraft()).toBe(false);
    expect(draft.isTerminal()).toBe(false);

    const inReview = CatalogVersionStatus.IN_REVIEW;
    expect(inReview.isInReview()).toBe(true);
    expect(inReview.isEditable()).toBe(false);
    expect(inReview.isOpen()).toBe(true);
    expect(inReview.canActivateOrReject()).toBe(true);
    expect(inReview.canWithdraw()).toBe(false);
    expect(inReview.canCreateSuccessorDraft()).toBe(false);
    expect(inReview.isTerminal()).toBe(false);

    const active = CatalogVersionStatus.ACTIVE;
    expect(active.isActive()).toBe(true);
    expect(active.isEditable()).toBe(false);
    expect(active.isOpen()).toBe(false);
    expect(active.canActivateOrReject()).toBe(false);
    expect(active.canWithdraw()).toBe(true);
    expect(active.canCreateSuccessorDraft()).toBe(true);
    expect(active.isTerminal()).toBe(false);

    const rejected = CatalogVersionStatus.REJECTED;
    expect(rejected.isRejected()).toBe(true);
    expect(rejected.isEditable()).toBe(false);
    expect(rejected.isOpen()).toBe(false);
    expect(rejected.canWithdraw()).toBe(false);
    expect(rejected.canCreateSuccessorDraft()).toBe(true);
    expect(rejected.isTerminal()).toBe(true);

    const superseded = CatalogVersionStatus.SUPERSEDED;
    expect(superseded.isSuperseded()).toBe(true);
    expect(superseded.isTerminal()).toBe(true);
    expect(superseded.canCreateSuccessorDraft()).toBe(true);

    const withdrawn = CatalogVersionStatus.WITHDRAWN;
    expect(withdrawn.isWithdrawn()).toBe(true);
    expect(withdrawn.isTerminal()).toBe(true);
    expect(withdrawn.canCreateSuccessorDraft()).toBe(true);
  });

  it('validates state transitions accurately according to domain rules', () => {
    // draft -> in_review only
    expect(CatalogVersionStatus.DRAFT.canTransitionTo('in_review')).toBe(true);
    expect(CatalogVersionStatus.DRAFT.canTransitionTo(CatalogVersionStatus.IN_REVIEW)).toBe(true);
    expect(CatalogVersionStatus.DRAFT.canTransitionTo('draft')).toBe(true); // self / no-op
    expect(CatalogVersionStatus.DRAFT.canTransitionTo('active')).toBe(false);
    expect(CatalogVersionStatus.DRAFT.canTransitionTo('rejected')).toBe(false);
    expect(CatalogVersionStatus.DRAFT.canTransitionTo('withdrawn')).toBe(false);

    // in_review -> active or rejected
    expect(CatalogVersionStatus.IN_REVIEW.canTransitionTo('active')).toBe(true);
    expect(CatalogVersionStatus.IN_REVIEW.canTransitionTo('rejected')).toBe(true);
    expect(CatalogVersionStatus.IN_REVIEW.canTransitionTo('draft')).toBe(false);
    expect(CatalogVersionStatus.IN_REVIEW.canTransitionTo('superseded')).toBe(false);

    // active -> superseded or withdrawn
    expect(CatalogVersionStatus.ACTIVE.canTransitionTo('superseded')).toBe(true);
    expect(CatalogVersionStatus.ACTIVE.canTransitionTo('withdrawn')).toBe(true);
    expect(CatalogVersionStatus.ACTIVE.canTransitionTo('draft')).toBe(false);
    expect(CatalogVersionStatus.ACTIVE.canTransitionTo('in_review')).toBe(false);

    // terminal states have no valid transitions
    expect(CatalogVersionStatus.REJECTED.canTransitionTo('draft')).toBe(false);
    expect(CatalogVersionStatus.SUPERSEDED.canTransitionTo('active')).toBe(false);
    expect(CatalogVersionStatus.WITHDRAWN.canTransitionTo('active')).toBe(false);

    // invalid next state values
    expect(CatalogVersionStatus.DRAFT.canTransitionTo('unknown_state')).toBe(false);
    expect(CatalogVersionStatus.DRAFT.canTransitionTo(null as unknown as string)).toBe(false);
  });

  it('compares equality against instances and string primitives', () => {
    const status = new CatalogVersionStatus('active');
    expect(status.equals('active')).toBe(true);
    expect(status.equals('  ACTIVE  ')).toBe(true);
    expect(status.equals(CatalogVersionStatus.ACTIVE)).toBe(true);
    expect(status.equals(CatalogVersionStatus.DRAFT)).toBe(false);
    expect(status.equals('draft')).toBe(false);
    expect(status.equals(null as unknown as string)).toBe(false);
  });
});
