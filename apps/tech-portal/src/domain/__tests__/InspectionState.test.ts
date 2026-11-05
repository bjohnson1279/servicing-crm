import { describe, test, expect } from 'vitest';
import { InspectionState } from '../InspectionState';

describe('InspectionState Value Object', () => {
  test('creates valid InspectionState instances', () => {
    const scheduled = new InspectionState('scheduled');
    expect(scheduled.getValue()).toBe('scheduled');
    expect(scheduled.toString()).toBe('scheduled');
    expect(scheduled.getLabel()).toBe('scheduled');
    expect(scheduled.isScheduled()).toBe(true);
    expect(scheduled.isInProgress()).toBe(false);
    expect(scheduled.isSubmitted()).toBe(false);
    expect(scheduled.isReviewed()).toBe(false);
    expect(scheduled.isCancelled()).toBe(false);
    expect(scheduled.isTerminal()).toBe(false);
    expect(scheduled.isEditable()).toBe(false);
    expect(scheduled.canCancel()).toBe(true);

    const inProgress = new InspectionState('in_progress');
    expect(inProgress.getValue()).toBe('in_progress');
    expect(inProgress.getLabel()).toBe('in progress');
    expect(inProgress.isInProgress()).toBe(true);
    expect(inProgress.isEditable()).toBe(true);
    expect(inProgress.isTerminal()).toBe(false);
    expect(inProgress.canCancel()).toBe(true);

    const submitted = new InspectionState('submitted');
    expect(submitted.getValue()).toBe('submitted');
    expect(submitted.isSubmitted()).toBe(true);
    expect(submitted.isEditable()).toBe(false);
    expect(submitted.isTerminal()).toBe(false);
    expect(submitted.canCancel()).toBe(true);

    const reviewed = new InspectionState('reviewed');
    expect(reviewed.getValue()).toBe('reviewed');
    expect(reviewed.isReviewed()).toBe(true);
    expect(reviewed.isTerminal()).toBe(true);
    expect(reviewed.isEditable()).toBe(false);
    expect(reviewed.canCancel()).toBe(false);

    const cancelled = new InspectionState('cancelled');
    expect(cancelled.getValue()).toBe('cancelled');
    expect(cancelled.isCancelled()).toBe(true);
    expect(cancelled.isTerminal()).toBe(true);
    expect(cancelled.isEditable()).toBe(false);
    expect(cancelled.canCancel()).toBe(false);
  });

  test('exposes static constant instances', () => {
    expect(InspectionState.SCHEDULED.getValue()).toBe('scheduled');
    expect(InspectionState.IN_PROGRESS.getValue()).toBe('in_progress');
    expect(InspectionState.SUBMITTED.getValue()).toBe('submitted');
    expect(InspectionState.REVIEWED.getValue()).toBe('reviewed');
    expect(InspectionState.CANCELLED.getValue()).toBe('cancelled');
  });

  test('normalizes casing and trims whitespace', () => {
    const state = new InspectionState('  IN_PROGRESS  ');
    expect(state.getValue()).toBe('in_progress');
    expect(state.isInProgress()).toBe(true);
  });

  test('validates states using isValid', () => {
    expect(InspectionState.isValid('scheduled')).toBe(true);
    expect(InspectionState.isValid('in_progress')).toBe(true);
    expect(InspectionState.isValid('submitted')).toBe(true);
    expect(InspectionState.isValid('reviewed')).toBe(true);
    expect(InspectionState.isValid('cancelled')).toBe(true);
    expect(InspectionState.isValid('  SUBMITTED  ')).toBe(true);
    expect(InspectionState.isValid('unknown')).toBe(false);
    expect(InspectionState.isValid('')).toBe(false);
    expect(InspectionState.isValid(null as any)).toBe(false);
    expect(InspectionState.isValid(undefined as any)).toBe(false);
  });

  test('throws error for invalid, empty, or non-string inputs', () => {
    expect(() => new InspectionState('invalid_state')).toThrow(/Invalid inspection state/);
    expect(() => new InspectionState('')).toThrow(/Inspection state cannot be empty/);
    expect(() => new InspectionState('   ')).toThrow(/Inspection state cannot be empty/);
    expect(() => new InspectionState(null as any)).toThrow(/Inspection state must be a string/);
    expect(() => new InspectionState(undefined as any)).toThrow(/Inspection state must be a string/);
  });

  test('validates state transitions accurately according to domain rules', () => {
    // Scheduled transitions
    expect(InspectionState.SCHEDULED.canTransitionTo(InspectionState.IN_PROGRESS)).toBe(true);
    expect(InspectionState.SCHEDULED.canTransitionTo(InspectionState.CANCELLED)).toBe(true);
    expect(InspectionState.SCHEDULED.canTransitionTo(InspectionState.SCHEDULED)).toBe(true);
    expect(InspectionState.SCHEDULED.canTransitionTo('in_progress')).toBe(true);
    expect(InspectionState.SCHEDULED.canTransitionTo('cancelled')).toBe(true);
    expect(InspectionState.SCHEDULED.canTransitionTo(InspectionState.SUBMITTED)).toBe(false);
    expect(InspectionState.SCHEDULED.canTransitionTo(InspectionState.REVIEWED)).toBe(false);

    // In Progress transitions
    expect(InspectionState.IN_PROGRESS.canTransitionTo(InspectionState.SUBMITTED)).toBe(true);
    expect(InspectionState.IN_PROGRESS.canTransitionTo(InspectionState.CANCELLED)).toBe(true);
    expect(InspectionState.IN_PROGRESS.canTransitionTo(InspectionState.IN_PROGRESS)).toBe(true);
    expect(InspectionState.IN_PROGRESS.canTransitionTo(InspectionState.SCHEDULED)).toBe(false);
    expect(InspectionState.IN_PROGRESS.canTransitionTo(InspectionState.REVIEWED)).toBe(false);

    // Submitted transitions
    expect(InspectionState.SUBMITTED.canTransitionTo(InspectionState.REVIEWED)).toBe(true);
    expect(InspectionState.SUBMITTED.canTransitionTo(InspectionState.IN_PROGRESS)).toBe(true); // revision requested
    expect(InspectionState.SUBMITTED.canTransitionTo(InspectionState.CANCELLED)).toBe(true);
    expect(InspectionState.SUBMITTED.canTransitionTo(InspectionState.SCHEDULED)).toBe(false);

    // Reviewed transitions (terminal)
    expect(InspectionState.REVIEWED.canTransitionTo(InspectionState.REVIEWED)).toBe(true);
    expect(InspectionState.REVIEWED.canTransitionTo(InspectionState.IN_PROGRESS)).toBe(false);
    expect(InspectionState.REVIEWED.canTransitionTo(InspectionState.CANCELLED)).toBe(false);

    // Cancelled transitions (terminal)
    expect(InspectionState.CANCELLED.canTransitionTo(InspectionState.CANCELLED)).toBe(true);
    expect(InspectionState.CANCELLED.canTransitionTo(InspectionState.IN_PROGRESS)).toBe(false);
    expect(InspectionState.CANCELLED.canTransitionTo(InspectionState.SCHEDULED)).toBe(false);

    // Invalid transition target
    expect(InspectionState.SCHEDULED.canTransitionTo('invalid')).toBe(false);
    expect(InspectionState.SCHEDULED.canTransitionTo(null as any)).toBe(false);
  });

  test('checks equality across instances and strings', () => {
    const s1 = new InspectionState('in_progress');
    const s2 = new InspectionState('IN_PROGRESS');
    const s3 = new InspectionState('scheduled');

    expect(s1.equals(s2)).toBe(true);
    expect(s1.equals(InspectionState.IN_PROGRESS)).toBe(true);
    expect(s1.equals('in_progress')).toBe(true);
    expect(s1.equals('IN_PROGRESS')).toBe(true);
    expect(s1.equals('  in_progress  ')).toBe(true);
    expect(s1.equals(s3)).toBe(false);
    expect(s1.equals(InspectionState.SCHEDULED)).toBe(false);
    expect(s1.equals('scheduled')).toBe(false);
    expect(s1.equals(null as any)).toBe(false);
  });
});
