import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { LazyDetails } from '../LazyDetails';

describe('LazyDetails Component', () => {
  test('does not render children initially until details element is toggled open', () => {
    const childSpy = vi.fn();
    const ChildComponent = () => {
      childSpy();
      return <div data-testid="lazy-child">Child Content</div>;
    };

    const { container } = render(
      <LazyDetails summary={<span>Accordion Header</span>} className="custom-accordion">
        <ChildComponent />
      </LazyDetails>
    );

    // Summary is visible
    expect(screen.getByText('Accordion Header')).toBeInTheDocument();
    // Child is not mounted
    expect(screen.queryByTestId('lazy-child')).not.toBeInTheDocument();
    expect(childSpy).not.toHaveBeenCalled();

    // Toggle open
    const details = container.querySelector('details')!;
    expect(details).toHaveClass('custom-accordion');

    // Simulate opening details
    details.open = true;
    fireEvent(details, new Event('toggle'));

    // Child is now mounted and rendered
    expect(screen.getByTestId('lazy-child')).toBeInTheDocument();
    expect(childSpy).toHaveBeenCalledTimes(1);
  });

  test('keeps children mounted when closed after having been opened', () => {
    const childSpy = vi.fn();
    const ChildComponent = () => {
      childSpy();
      return <div data-testid="lazy-child">Persistent Child</div>;
    };

    const { container } = render(
      <LazyDetails summary="Expandable Section">
        <ChildComponent />
      </LazyDetails>
    );

    const details = container.querySelector('details')!;

    // Open
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(screen.getByTestId('lazy-child')).toBeInTheDocument();
    expect(childSpy).toHaveBeenCalledTimes(1);

    // Close
    details.open = false;
    fireEvent(details, new Event('toggle'));

    // Child should still remain mounted in DOM
    expect(screen.getByTestId('lazy-child')).toBeInTheDocument();
    // Should not re-mount or re-render child unnecessarily
    expect(childSpy).toHaveBeenCalledTimes(1);
  });

  test('ignores toggle events when open is false initially', () => {
    const { container } = render(
      <LazyDetails summary="Closed Section">
        <div data-testid="never-opened">Should not be rendered</div>
      </LazyDetails>
    );

    const details = container.querySelector('details')!;
    // Toggle while closed
    details.open = false;
    fireEvent(details, new Event('toggle'));

    expect(screen.queryByTestId('never-opened')).not.toBeInTheDocument();
  });
});
