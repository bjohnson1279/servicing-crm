export type CatalogVersionStatusValue =
  | 'draft'
  | 'in_review'
  | 'active'
  | 'rejected'
  | 'superseded'
  | 'withdrawn';

/**
 * Value Object representing the lifecycle status of a verified product catalog version.
 * Enforces domain invariants for valid catalog version states and state transitions
 * aligned with the verified product catalog domain rules.
 */
export class CatalogVersionStatus {
  public static readonly VALID_STATUSES: readonly CatalogVersionStatusValue[] = [
    'draft',
    'in_review',
    'active',
    'rejected',
    'superseded',
    'withdrawn',
  ] as const;

  public static readonly DRAFT = new CatalogVersionStatus('draft');
  public static readonly IN_REVIEW = new CatalogVersionStatus('in_review');
  public static readonly ACTIVE = new CatalogVersionStatus('active');
  public static readonly REJECTED = new CatalogVersionStatus('rejected');
  public static readonly SUPERSEDED = new CatalogVersionStatus('superseded');
  public static readonly WITHDRAWN = new CatalogVersionStatus('withdrawn');

  private readonly value: CatalogVersionStatusValue;

  constructor(value: CatalogVersionStatusValue | string) {
    if (typeof value !== 'string') {
      throw new Error('Catalog version status must be a string.');
    }

    const trimmed = value.trim().toLowerCase();

    if (!trimmed) {
      throw new Error('Catalog version status cannot be empty.');
    }

    if (!CatalogVersionStatus.isValid(trimmed)) {
      throw new Error(
        `Invalid catalog version status: '${value}'. Must be one of: ${CatalogVersionStatus.VALID_STATUSES.join(', ')}`
      );
    }

    this.value = trimmed as CatalogVersionStatusValue;
  }

  public static isValid(value: string): value is CatalogVersionStatusValue {
    if (typeof value !== 'string') return false;
    return CatalogVersionStatus.VALID_STATUSES.includes(value.trim().toLowerCase() as CatalogVersionStatusValue);
  }

  public getValue(): CatalogVersionStatusValue {
    return this.value;
  }

  public isDraft(): boolean {
    return this.value === 'draft';
  }

  public isInReview(): boolean {
    return this.value === 'in_review';
  }

  public isActive(): boolean {
    return this.value === 'active';
  }

  public isRejected(): boolean {
    return this.value === 'rejected';
  }

  public isSuperseded(): boolean {
    return this.value === 'superseded';
  }

  public isWithdrawn(): boolean {
    return this.value === 'withdrawn';
  }

  /**
   * Only drafts can have product details and attached evidence edited.
   */
  public isEditable(): boolean {
    return this.isDraft();
  }

  /**
   * Statuses that are open (draft or undergoing review).
   */
  public isOpen(): boolean {
    return this.value === 'draft' || this.value === 'in_review';
  }

  /**
   * Whether a manager can perform source verification and activate or reject the version.
   */
  public canActivateOrReject(): boolean {
    return this.isInReview();
  }

  /**
   * Only active versions can be withdrawn.
   */
  public canWithdraw(): boolean {
    return this.isActive();
  }

  /**
   * A successor draft can only be created once the current version is past review (active, rejected, superseded, withdrawn).
   * It cannot be created while an existing draft or in-review version is still open.
   */
  public canCreateSuccessorDraft(): boolean {
    return !this.isOpen();
  }

  /**
   * Terminal / archived states where no further direct actions can be taken on this revision.
   */
  public isTerminal(): boolean {
    return this.value === 'rejected' || this.value === 'superseded' || this.value === 'withdrawn';
  }

  /**
   * Validates whether a state transition from this status to the next status is permitted
   * by the catalog domain rules (enforced in database migration 026):
   * - draft -> in_review
   * - in_review -> active | rejected
   * - active -> superseded | withdrawn
   */
  public canTransitionTo(next: CatalogVersionStatus | CatalogVersionStatusValue | string): boolean {
    if (!next) return false;
    const nextValue = next instanceof CatalogVersionStatus ? next.getValue() : next.trim().toLowerCase();

    if (!CatalogVersionStatus.isValid(nextValue)) {
      return false;
    }

    if (this.value === nextValue) {
      return true; // No-op transition
    }

    switch (this.value) {
      case 'draft':
        return nextValue === 'in_review';
      case 'in_review':
        return nextValue === 'active' || nextValue === 'rejected';
      case 'active':
        return nextValue === 'superseded' || nextValue === 'withdrawn';
      case 'rejected':
      case 'superseded':
      case 'withdrawn':
        return false;
      default:
        return false;
    }
  }

  public getLabel(): string {
    return this.value.replace(/_/g, ' ');
  }

  public equals(other: CatalogVersionStatus | string): boolean {
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
