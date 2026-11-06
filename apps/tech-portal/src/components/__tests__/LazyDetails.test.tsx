import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect } from 'vitest';
import { LazyDetails } from '../LazyDetails';

describe('LazyDetails Component', () => {
  test('does not render children initially before details element is toggled open', () => {
    render(
      <LazyDetails summary="Test Summary">
        <div data-testid="lazy-content">Heavy Child Content</div>
      </LazyDetails>
    );

    expect(screen.getByText('Test Summary')).toBeInTheDocument();
    expect(screen.queryByTestId('lazy-content')).not.toBeInTheDocument();
  });

  test('mounts children when details element is opened via toggle event', () => {
    const { container } = render(
      <LazyDetails summary="Test Summary">
        <div data-testid="lazy-content">Heavy Child Content</div>
      </LazyDetails>
    );

    const details = container.querySelector('details')!;
    expect(details).toBeInTheDocument();
    expect(screen.queryByTestId('lazy-content')).not.toBeInTheDocument();

    // Simulate opening the details element
    details.open = true;
    fireEvent(details, new Event('toggle'));

    expect(screen.getByTestId('lazy-content')).toBeInTheDocument();
    expect(screen.getByText('Heavy Child Content')).toBeInTheDocument();
  });

  test('keeps children mounted even when details element is toggled closed afterwards', () => {
    const { container } = render(
      <LazyDetails summary="Test Summary">
        <div data-testid="lazy-content">Heavy Child Content</div>
      </LazyDetails>
    );

    const details = container.querySelector('details')!;

    // Open details
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(screen.getByTestId('lazy-content')).toBeInTheDocument();

    // Close details
    details.open = false;
    fireEvent(details, new Event('toggle'));

    // Should remain mounted to preserve internal state
    expect(screen.getByTestId('lazy-content')).toBeInTheDocument();
  });

  test('handles toggle event when details element is toggled while remaining closed', () => {
    const { container } = render(
      <LazyDetails summary="Test Summary">
        <div data-testid="lazy-content">Heavy Child Content</div>
      </LazyDetails>
    );

    const details = container.querySelector('details')!;
    details.open = false;
    fireEvent(details, new Event('toggle'));

    expect(screen.queryByTestId('lazy-content')).not.toBeInTheDocument();
  });
});
