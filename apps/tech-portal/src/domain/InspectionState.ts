export type InspectionStateValue = 'scheduled' | 'in_progress' | 'submitted' | 'reviewed' | 'cancelled';

/**
 * Value Object representing the lifecycle state of a property inspection.
 * Enforces domain invariants for valid inspection states and valid lifecycle transitions.
 */
export class InspectionState {
  public static readonly VALID_STATES: readonly InspectionStateValue[] = [
    'scheduled',
    'in_progress',
    'submitted',
    'reviewed',
    'cancelled',
  ] as const;

  public static readonly SCHEDULED = new InspectionState('scheduled');
  public static readonly IN_PROGRESS = new InspectionState('in_progress');
  public static readonly SUBMITTED = new InspectionState('submitted');
  public static readonly REVIEWED = new InspectionState('reviewed');
  public static readonly CANCELLED = new InspectionState('cancelled');

  private readonly value: InspectionStateValue;

  constructor(value: InspectionStateValue | string) {
    if (typeof value !== 'string') {
      throw new Error('Inspection state must be a string.');
    }

    const trimmed = value.trim().toLowerCase();

    if (!trimmed) {
      throw new Error('Inspection state cannot be empty.');
    }

    if (!InspectionState.isValid(trimmed)) {
      throw new Error(
        `Invalid inspection state: '${value}'. Must be one of: ${InspectionState.VALID_STATES.join(', ')}`
      );
    }

    this.value = trimmed as InspectionStateValue;
  }

  public static isValid(value: string): value is InspectionStateValue {
    if (typeof value !== 'string') return false;
    return InspectionState.VALID_STATES.includes(value.trim().toLowerCase() as InspectionStateValue);
  }

  public getValue(): InspectionStateValue {
    return this.value;
  }

  public isScheduled(): boolean {
    return this.value === 'scheduled';
  }

  public isInProgress(): boolean {
    return this.value === 'in_progress';
  }

  public isSubmitted(): boolean {
    return this.value === 'submitted';
  }

  public isReviewed(): boolean {
    return this.value === 'reviewed';
  }

  public isCancelled(): boolean {
    return this.value === 'cancelled';
  }

  /**
   * Terminal states represent finalized inspections where no further revisions or modifications are allowed.
   */
  public isTerminal(): boolean {
    return this.value === 'reviewed' || this.value === 'cancelled';
  }

  /**
   * Findings and attachments can only be drafted and edited while in active progress.
   */
  public isEditable(): boolean {
    return this.value === 'in_progress';
  }

  /**
   * An inspection can be cancelled as long as it has not already reached a terminal state.
   */
  public canCancel(): boolean {
    return !this.isTerminal();
  }

  /**
   * Validates whether a lifecycle transition from this state to the next state is permitted.
   * - scheduled -> in_progress | cancelled
   * - in_progress -> submitted | cancelled
   * - submitted -> reviewed | in_progress (revision requested) | cancelled
   * - reviewed -> none (terminal state)
   * - cancelled -> none (terminal state)
   */
  public canTransitionTo(next: InspectionState | InspectionStateValue | string): boolean {
    if (!next) return false;
    const nextValue = next instanceof InspectionState ? next.getValue() : next.trim().toLowerCase();

    if (!InspectionState.isValid(nextValue)) {
      return false;
    }

    if (this.value === nextValue) {
      return true; // No-op transition
    }

    switch (this.value) {
      case 'scheduled':
        return nextValue === 'in_progress' || nextValue === 'cancelled';
      case 'in_progress':
        return nextValue === 'submitted' || nextValue === 'cancelled';
      case 'submitted':
        return nextValue === 'reviewed' || nextValue === 'in_progress' || nextValue === 'cancelled';
      case 'reviewed':
      case 'cancelled':
        return false;
      default:
        return false;
    }
  }

  public getLabel(): string {
    return this.value.replace(/_/g, ' ');
  }

  public equals(other: InspectionState | string): boolean {
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
