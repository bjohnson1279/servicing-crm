import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect } from 'vitest';
import { JobDetail } from '../JobDetail';

// Mock subcomponents
vi.mock('../TimeTracker', () => ({
  TimeTracker: () => <div data-testid="time-tracker">TimeTracker Mock</div>,
}));
vi.mock('./callbacks/CallbackWorkspace', () => ({
  default: () => <div data-testid="callback-workspace">CallbackWorkspace Mock</div>,
}));
vi.mock('./CallbackDrafts', () => ({
  CallbackDrafts: () => <div data-testid="callback-drafts">CallbackDrafts Mock</div>,
}));

describe('JobDetail Component', () => {
  test('renders Job Detail and advances status on button click', () => {
    render(
      <MemoryRouter>
        <JobDetail />
      </MemoryRouter>
    );

    expect(screen.getByText(/Job Detail/i)).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();

    const advanceBtn = screen.getByRole('button', { name: /Mark job status as En Route/i });
    fireEvent.click(advanceBtn);

    expect(screen.getByText('En Route')).toBeInTheDocument();
  });
});
