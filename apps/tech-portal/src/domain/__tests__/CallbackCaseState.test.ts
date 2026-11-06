import { describe, test, expect } from 'vitest';
import { CallbackCaseState } from '../CallbackCaseState';

describe('CallbackCaseState Value Object', () => {
  test('creates valid CallbackCaseState instances', () => {
    const submitted = new CallbackCaseState('submitted');
    expect(submitted.getValue()).toBe('submitted');
    expect(submitted.toString()).toBe('submitted');
    expect(submitted.getLabel()).toBe('submitted');
    expect(submitted.isSubmitted()).toBe(true);
    expect(submitted.isOpen()).toBe(true);
    expect(submitted.isClosed()).toBe(false);
    expect(submitted.isTerminal()).toBe(false);
    expect(submitted.canBeAssessedOrDecided()).toBe(true);
    expect(submitted.canScheduleVisit()).toBe(false);
    expect(submitted.canReceiveOutcome()).toBe(false);
    expect(submitted.canAddAttachment()).toBe(true);

    const triage = new CallbackCaseState('triage');
    expect(triage.isTriage()).toBe(true);
    expect(triage.canBeAssessedOrDecided()).toBe(true);
    expect(triage.isOpen()).toBe(true);

    const awaitingCust = new CallbackCaseState('awaiting_customer');
    expect(awaitingCust.isAwaitingCustomer()).toBe(true);
    expect(awaitingCust.getLabel()).toBe('awaiting customer');
    expect(awaitingCust.canBeAssessedOrDecided()).toBe(true);

    const approved = new CallbackCaseState('approved');
    expect(approved.isApproved()).toBe(true);
    expect(approved.canScheduleVisit()).toBe(true);
    expect(approved.canBeAssessedOrDecided()).toBe(false);

    const scheduled = new CallbackCaseState('scheduled');
    expect(scheduled.isScheduled()).toBe(true);
    expect(scheduled.canReceiveOutcome()).toBe(true);

    const inService = new CallbackCaseState('in_service');
    expect(inService.isInService()).toBe(true);
    expect(inService.getLabel()).toBe('in service');
    expect(inService.canReceiveOutcome()).toBe(true);

    const awaitingReview = new CallbackCaseState('awaiting_review');
    expect(awaitingReview.isAwaitingReview()).toBe(true);
    expect(awaitingReview.getLabel()).toBe('awaiting review');
    expect(awaitingReview.canScheduleVisit()).toBe(true);

    const resolved = new CallbackCaseState('resolved');
    expect(resolved.isResolved()).toBe(true);
    expect(resolved.isClosed()).toBe(true);
    expect(resolved.isOpen()).toBe(false);
    expect(resolved.isTerminal()).toBe(true);
    expect(resolved.canAddAttachment()).toBe(false);

    const declined = new CallbackCaseState('declined');
    expect(declined.isDeclined()).toBe(true);
    expect(declined.isClosed()).toBe(true);
    expect(declined.isOpen()).toBe(false);
    expect(declined.isTerminal()).toBe(true);

    const cancelled = new CallbackCaseState('cancelled');
    expect(cancelled.isCancelled()).toBe(true);
    expect(cancelled.isClosed()).toBe(true);
    expect(cancelled.isOpen()).toBe(false);
    expect(cancelled.isTerminal()).toBe(true);
  });

  test('exposes static constant instances', () => {
    expect(CallbackCaseState.SUBMITTED.getValue()).toBe('submitted');
    expect(CallbackCaseState.TRIAGE.getValue()).toBe('triage');
    expect(CallbackCaseState.AWAITING_CUSTOMER.getValue()).toBe('awaiting_customer');
    expect(CallbackCaseState.APPROVED.getValue()).toBe('approved');
    expect(CallbackCaseState.SCHEDULED.getValue()).toBe('scheduled');
    expect(CallbackCaseState.IN_SERVICE.getValue()).toBe('in_service');
    expect(CallbackCaseState.AWAITING_REVIEW.getValue()).toBe('awaiting_review');
    expect(CallbackCaseState.RESOLVED.getValue()).toBe('resolved');
    expect(CallbackCaseState.DECLINED.getValue()).toBe('declined');
    expect(CallbackCaseState.CANCELLED.getValue()).toBe('cancelled');
  });

  test('normalizes casing and trims whitespace', () => {
    const state = new CallbackCaseState('  IN_SERVICE  ');
    expect(state.getValue()).toBe('in_service');
    expect(state.isInService()).toBe(true);
  });

  test('validates states using isValid', () => {
    expect(CallbackCaseState.isValid('submitted')).toBe(true);
    expect(CallbackCaseState.isValid('triage')).toBe(true);
    expect(CallbackCaseState.isValid('awaiting_customer')).toBe(true);
    expect(CallbackCaseState.isValid('approved')).toBe(true);
    expect(CallbackCaseState.isValid('scheduled')).toBe(true);
    expect(CallbackCaseState.isValid('in_service')).toBe(true);
    expect(CallbackCaseState.isValid('awaiting_review')).toBe(true);
    expect(CallbackCaseState.isValid('resolved')).toBe(true);
    expect(CallbackCaseState.isValid('declined')).toBe(true);
    expect(CallbackCaseState.isValid('cancelled')).toBe(true);
    expect(CallbackCaseState.isValid('  RESOLVED  ')).toBe(true);
    expect(CallbackCaseState.isValid('unknown')).toBe(false);
    expect(CallbackCaseState.isValid('')).toBe(false);
    expect(CallbackCaseState.isValid(null as any)).toBe(false);
    expect(CallbackCaseState.isValid(undefined as any)).toBe(false);
  });

  test('throws error for invalid, empty, or non-string inputs', () => {
    expect(() => new CallbackCaseState('invalid_state')).toThrow(/Invalid callback case state/);
    expect(() => new CallbackCaseState('')).toThrow(/Callback case state cannot be empty/);
    expect(() => new CallbackCaseState('   ')).toThrow(/Callback case state cannot be empty/);
    expect(() => new CallbackCaseState(null as any)).toThrow(/Callback case state must be a string/);
    expect(() => new CallbackCaseState(undefined as any)).toThrow(/Callback case state must be a string/);
  });

  test('validates state transitions accurately according to domain rules', () => {
    // Submitted transitions
    expect(CallbackCaseState.SUBMITTED.canTransitionTo(CallbackCaseState.TRIAGE)).toBe(true);
    expect(CallbackCaseState.SUBMITTED.canTransitionTo(CallbackCaseState.AWAITING_CUSTOMER)).toBe(true);
    expect(CallbackCaseState.SUBMITTED.canTransitionTo(CallbackCaseState.APPROVED)).toBe(true);
    expect(CallbackCaseState.SUBMITTED.canTransitionTo(CallbackCaseState.DECLINED)).toBe(true);
    expect(CallbackCaseState.SUBMITTED.canTransitionTo(CallbackCaseState.CANCELLED)).toBe(true);
    expect(CallbackCaseState.SUBMITTED.canTransitionTo(CallbackCaseState.SUBMITTED)).toBe(true);
    expect(CallbackCaseState.SUBMITTED.canTransitionTo(CallbackCaseState.SCHEDULED)).toBe(false);
    expect(CallbackCaseState.SUBMITTED.canTransitionTo(CallbackCaseState.RESOLVED)).toBe(false);

    // Triage transitions
    expect(CallbackCaseState.TRIAGE.canTransitionTo(CallbackCaseState.APPROVED)).toBe(true);
    expect(CallbackCaseState.TRIAGE.canTransitionTo(CallbackCaseState.DECLINED)).toBe(true);
    expect(CallbackCaseState.TRIAGE.canTransitionTo(CallbackCaseState.AWAITING_CUSTOMER)).toBe(true);
    expect(CallbackCaseState.TRIAGE.canTransitionTo(CallbackCaseState.CANCELLED)).toBe(true);
    expect(CallbackCaseState.TRIAGE.canTransitionTo(CallbackCaseState.SCHEDULED)).toBe(false);

    // Awaiting Customer transitions
    expect(CallbackCaseState.AWAITING_CUSTOMER.canTransitionTo(CallbackCaseState.TRIAGE)).toBe(true);
    expect(CallbackCaseState.AWAITING_CUSTOMER.canTransitionTo(CallbackCaseState.APPROVED)).toBe(true);
    expect(CallbackCaseState.AWAITING_CUSTOMER.canTransitionTo(CallbackCaseState.CANCELLED)).toBe(true);

    // Approved transitions
    expect(CallbackCaseState.APPROVED.canTransitionTo(CallbackCaseState.SCHEDULED)).toBe(true);
    expect(CallbackCaseState.APPROVED.canTransitionTo(CallbackCaseState.CANCELLED)).toBe(true);
    expect(CallbackCaseState.APPROVED.canTransitionTo(CallbackCaseState.RESOLVED)).toBe(false);

    // Scheduled transitions
    expect(CallbackCaseState.SCHEDULED.canTransitionTo(CallbackCaseState.IN_SERVICE)).toBe(true);
    expect(CallbackCaseState.SCHEDULED.canTransitionTo(CallbackCaseState.AWAITING_REVIEW)).toBe(true);
    expect(CallbackCaseState.SCHEDULED.canTransitionTo(CallbackCaseState.APPROVED)).toBe(true);
    expect(CallbackCaseState.SCHEDULED.canTransitionTo(CallbackCaseState.CANCELLED)).toBe(true);
    expect(CallbackCaseState.SCHEDULED.canTransitionTo(CallbackCaseState.RESOLVED)).toBe(false);

    // In Service transitions
    expect(CallbackCaseState.IN_SERVICE.canTransitionTo(CallbackCaseState.AWAITING_REVIEW)).toBe(true);
    expect(CallbackCaseState.IN_SERVICE.canTransitionTo(CallbackCaseState.APPROVED)).toBe(true);
    expect(CallbackCaseState.IN_SERVICE.canTransitionTo(CallbackCaseState.CANCELLED)).toBe(true);

    // Awaiting Review transitions
    expect(CallbackCaseState.AWAITING_REVIEW.canTransitionTo(CallbackCaseState.RESOLVED)).toBe(true);
    expect(CallbackCaseState.AWAITING_REVIEW.canTransitionTo(CallbackCaseState.SCHEDULED)).toBe(true);
    expect(CallbackCaseState.AWAITING_REVIEW.canTransitionTo(CallbackCaseState.CANCELLED)).toBe(true);

    // Resolved (can reopen to triage)
    expect(CallbackCaseState.RESOLVED.canTransitionTo(CallbackCaseState.TRIAGE)).toBe(true);
    expect(CallbackCaseState.RESOLVED.canTransitionTo(CallbackCaseState.SCHEDULED)).toBe(false);
    expect(CallbackCaseState.RESOLVED.canTransitionTo(CallbackCaseState.CANCELLED)).toBe(false);

    // Declined and Cancelled (terminal)
    expect(CallbackCaseState.DECLINED.canTransitionTo(CallbackCaseState.TRIAGE)).toBe(false);
    expect(CallbackCaseState.CANCELLED.canTransitionTo(CallbackCaseState.TRIAGE)).toBe(false);

    // Invalid transition target
    expect(CallbackCaseState.SUBMITTED.canTransitionTo('invalid')).toBe(false);
    expect(CallbackCaseState.SUBMITTED.canTransitionTo(null as any)).toBe(false);
  });

  test('checks equality across instances and strings', () => {
    const s1 = new CallbackCaseState('in_service');
    const s2 = new CallbackCaseState('IN_SERVICE');
    const s3 = new CallbackCaseState('submitted');

    expect(s1.equals(s2)).toBe(true);
    expect(s1.equals(CallbackCaseState.IN_SERVICE)).toBe(true);
    expect(s1.equals('in_service')).toBe(true);
    expect(s1.equals('IN_SERVICE')).toBe(true);
    expect(s1.equals('  in_service  ')).toBe(true);
    expect(s1.equals(s3)).toBe(false);
    expect(s1.equals(CallbackCaseState.SUBMITTED)).toBe(false);
    expect(s1.equals('submitted')).toBe(false);
    expect(s1.equals(null as any)).toBe(false);
  });
});
