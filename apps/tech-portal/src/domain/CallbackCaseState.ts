export type CallbackCaseStateValue =
  | 'submitted'
  | 'triage'
  | 'awaiting_customer'
  | 'approved'
  | 'scheduled'
  | 'in_service'
  | 'awaiting_review'
  | 'resolved'
  | 'declined'
  | 'cancelled';

/**
 * Value Object representing the lifecycle state of a service callback or warranty case.
 * Enforces domain invariants for valid callback states, transition rules, and domain capabilities.
 */
export class CallbackCaseState {
  public static readonly VALID_STATES: readonly CallbackCaseStateValue[] = [
    'submitted',
    'triage',
    'awaiting_customer',
    'approved',
    'scheduled',
    'in_service',
    'awaiting_review',
    'resolved',
    'declined',
    'cancelled',
  ] as const;

  public static readonly CLOSED_STATES: readonly CallbackCaseStateValue[] = [
    'resolved',
    'declined',
    'cancelled',
  ] as const;

  public static readonly SUBMITTED = new CallbackCaseState('submitted');
  public static readonly TRIAGE = new CallbackCaseState('triage');
  public static readonly AWAITING_CUSTOMER = new CallbackCaseState('awaiting_customer');
  public static readonly APPROVED = new CallbackCaseState('approved');
  public static readonly SCHEDULED = new CallbackCaseState('scheduled');
  public static readonly IN_SERVICE = new CallbackCaseState('in_service');
  public static readonly AWAITING_REVIEW = new CallbackCaseState('awaiting_review');
  public static readonly RESOLVED = new CallbackCaseState('resolved');
  public static readonly DECLINED = new CallbackCaseState('declined');
  public static readonly CANCELLED = new CallbackCaseState('cancelled');

  private readonly value: CallbackCaseStateValue;

  constructor(value: CallbackCaseStateValue | string) {
    if (typeof value !== 'string') {
      throw new Error('Callback case state must be a string.');
    }

    const trimmed = value.trim().toLowerCase();

    if (!trimmed) {
      throw new Error('Callback case state cannot be empty.');
    }

    if (!CallbackCaseState.isValid(trimmed)) {
      throw new Error(
        `Invalid callback case state: '${value}'. Must be one of: ${CallbackCaseState.VALID_STATES.join(', ')}`
      );
    }

    this.value = trimmed as CallbackCaseStateValue;
  }

  public static isValid(value: string): value is CallbackCaseStateValue {
    if (typeof value !== 'string') return false;
    return CallbackCaseState.VALID_STATES.includes(value.trim().toLowerCase() as CallbackCaseStateValue);
  }

  public getValue(): CallbackCaseStateValue {
    return this.value;
  }

  public isSubmitted(): boolean {
    return this.value === 'submitted';
  }

  public isTriage(): boolean {
    return this.value === 'triage';
  }

  public isAwaitingCustomer(): boolean {
    return this.value === 'awaiting_customer';
  }

  public isApproved(): boolean {
    return this.value === 'approved';
  }

  public isScheduled(): boolean {
    return this.value === 'scheduled';
  }

  public isInService(): boolean {
    return this.value === 'in_service';
  }

  public isAwaitingReview(): boolean {
    return this.value === 'awaiting_review';
  }

  public isResolved(): boolean {
    return this.value === 'resolved';
  }

  public isDeclined(): boolean {
    return this.value === 'declined';
  }

  public isCancelled(): boolean {
    return this.value === 'cancelled';
  }

  /**
   * Closed states represent finalized or rejected callback cases ('resolved', 'declined', 'cancelled').
   */
  public isClosed(): boolean {
    return CallbackCaseState.CLOSED_STATES.includes(this.value);
  }

  /**
   * Active, non-closed callback case.
   */
  public isOpen(): boolean {
    return !this.isClosed();
  }

  /**
   * Terminal states where a case cannot be directly cancelled or updated without reopening.
   */
  public isTerminal(): boolean {
    return this.isClosed();
  }

  /**
   * Whether the case can undergo coverage assessment or CSR review/decision.
   */
  public canBeAssessedOrDecided(): boolean {
    return this.value === 'submitted' || this.value === 'triage' || this.value === 'awaiting_customer';
  }

  /**
   * Whether visits can be scheduled or dispatched for this case.
   */
  public canScheduleVisit(): boolean {
    return this.value === 'approved' || this.value === 'awaiting_review';
  }

  /**
   * Whether a technician can perform or submit visit outcomes for this case.
   */
  public canReceiveOutcome(): boolean {
    return this.value === 'scheduled' || this.value === 'in_service';
  }

  /**
   * Whether attachments (photos/documents) can be uploaded.
   */
  public canAddAttachment(): boolean {
    return !this.isClosed();
  }

  /**
   * Validates whether a lifecycle transition from this state to the next state is permitted by domain rules.
   */
  public canTransitionTo(next: CallbackCaseState | CallbackCaseStateValue | string): boolean {
    if (!next) return false;
    const nextValue = next instanceof CallbackCaseState ? next.getValue() : next.trim().toLowerCase();

    if (!CallbackCaseState.isValid(nextValue)) {
      return false;
    }

    if (this.value === nextValue) {
      return true; // No-op transition
    }

    switch (this.value) {
      case 'submitted':
        return nextValue === 'triage' || nextValue === 'awaiting_customer' || nextValue === 'approved' || nextValue === 'declined' || nextValue === 'cancelled';
      case 'triage':
        return nextValue === 'awaiting_customer' || nextValue === 'approved' || nextValue === 'declined' || nextValue === 'cancelled';
      case 'awaiting_customer':
        return nextValue === 'triage' || nextValue === 'approved' || nextValue === 'declined' || nextValue === 'cancelled';
      case 'approved':
        return nextValue === 'scheduled' || nextValue === 'cancelled';
      case 'scheduled':
        return nextValue === 'in_service' || nextValue === 'awaiting_review' || nextValue === 'approved' || nextValue === 'cancelled';
      case 'in_service':
        return nextValue === 'awaiting_review' || nextValue === 'approved' || nextValue === 'cancelled';
      case 'awaiting_review':
        return nextValue === 'resolved' || nextValue === 'scheduled' || nextValue === 'cancelled';
      case 'resolved':
        return nextValue === 'triage'; // Reopened
      case 'declined':
      case 'cancelled':
        return false;
      default:
        return false;
    }
  }

  public getLabel(): string {
    return this.value.replace(/_/g, ' ');
  }

  public equals(other: CallbackCaseState | string): boolean {
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
