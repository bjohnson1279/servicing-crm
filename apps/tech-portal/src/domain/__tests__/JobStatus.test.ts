import { describe, test, expect } from 'vitest';
import { JobStatus } from '../JobStatus';

describe('JobStatus Value Object', () => {
  test('creates valid JobStatus instances', () => {
    const status = new JobStatus('Available');
    expect(status.getValue()).toBe('Available');
    expect(status.toString()).toBe('Available');
  });

  test('static constants return correct status values', () => {
    expect(JobStatus.AVAILABLE.getValue()).toBe('Available');
    expect(JobStatus.EN_ROUTE.getValue()).toBe('En Route');
    expect(JobStatus.ON_SITE.getValue()).toBe('On Site');
    expect(JobStatus.COMPLETED.getValue()).toBe('Completed');
  });

  test('throws error for invalid JobStatus values', () => {
    expect(() => new JobStatus('InvalidStatus')).toThrow(/Invalid JobStatus/);
    expect(() => new JobStatus('')).toThrow(/Invalid JobStatus/);
  });

  test('validates statuses correctly using isValid static method', () => {
    expect(JobStatus.isValid('Available')).toBe(true);
    expect(JobStatus.isValid('En Route')).toBe(true);
    expect(JobStatus.isValid('On Site')).toBe(true);
    expect(JobStatus.isValid('Completed')).toBe(true);
    expect(JobStatus.isValid('Unknown')).toBe(false);
  });

  test('advances status through valid lifecycle transitions', () => {
    let status = JobStatus.AVAILABLE;
    expect(status.canAdvance()).toBe(true);
    expect(status.getNextStatusLabel()).toBe('En Route');

    status = status.nextStatus();
    expect(status.getValue()).toBe('En Route');
    expect(status.canAdvance()).toBe(true);
    expect(status.getNextStatusLabel()).toBe('On Site');

    status = status.nextStatus();
    expect(status.getValue()).toBe('On Site');
    expect(status.canAdvance()).toBe(true);
    expect(status.getNextStatusLabel()).toBe('Completed');

    status = status.nextStatus();
    expect(status.getValue()).toBe('Completed');
    expect(status.canAdvance()).toBe(false);
    expect(status.isTerminal()).toBe(true);
    expect(status.getNextStatusLabel()).toBeNull();
  });

  test('throws error when trying to advance terminal Completed status', () => {
    expect(() => JobStatus.COMPLETED.nextStatus()).toThrow("Cannot advance status beyond 'Completed'");
  });

  test('checks equality with string and JobStatus instances', () => {
    const status = new JobStatus('En Route');
    expect(status.equals('En Route')).toBe(true);
    expect(status.equals('Available')).toBe(false);
    expect(status.equals(JobStatus.EN_ROUTE)).toBe(true);
    expect(status.equals(JobStatus.ON_SITE)).toBe(false);
  });
});
