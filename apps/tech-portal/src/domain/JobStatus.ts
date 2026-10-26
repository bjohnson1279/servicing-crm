export type JobStatusValue = 'Available' | 'En Route' | 'On Site' | 'Completed';

export class JobStatus {
  private static readonly VALID_STATUSES: JobStatusValue[] = [
    'Available',
    'En Route',
    'On Site',
    'Completed',
  ];

  public static readonly AVAILABLE = new JobStatus('Available');
  public static readonly EN_ROUTE = new JobStatus('En Route');
  public static readonly ON_SITE = new JobStatus('On Site');
  public static readonly COMPLETED = new JobStatus('Completed');

  private readonly value: JobStatusValue;

  constructor(value: JobStatusValue | string) {
    if (!JobStatus.isValid(value)) {
      throw new Error(`Invalid JobStatus: '${value}'. Must be one of: ${JobStatus.VALID_STATUSES.join(', ')}`);
    }
    this.value = value as JobStatusValue;
  }

  public static isValid(value: string): value is JobStatusValue {
    return JobStatus.VALID_STATUSES.includes(value as JobStatusValue);
  }

  public getValue(): JobStatusValue {
    return this.value;
  }

  public isTerminal(): boolean {
    return this.value === 'Completed';
  }

  public canAdvance(): boolean {
    return !this.isTerminal();
  }

  public nextStatus(): JobStatus {
    switch (this.value) {
      case 'Available':
        return JobStatus.EN_ROUTE;
      case 'En Route':
        return JobStatus.ON_SITE;
      case 'On Site':
        return JobStatus.COMPLETED;
      case 'Completed':
        throw new Error("Cannot advance status beyond 'Completed'");
    }
  }

  public getNextStatusLabel(): string | null {
    if (!this.canAdvance()) return null;
    return this.nextStatus().getValue();
  }

  public equals(other: JobStatus | string): boolean {
    if (typeof other === 'string') {
      return this.value === other;
    }
    return this.value === other.getValue();
  }

  public toString(): string {
    return this.value;
  }
}
