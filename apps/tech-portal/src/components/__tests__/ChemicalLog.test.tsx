import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect, beforeEach } from 'vitest';
import { ChemicalLog } from '../ChemicalLog';

// Mock offlineQueue enqueueRequest
vi.mock('../../offlineQueue', () => ({
  enqueueRequest: vi.fn(),
}));

describe('ChemicalLog Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('renders Chemical Application Log without crashing inside MemoryRouter', () => {
    render(
      <MemoryRouter>
        <ChemicalLog />
      </MemoryRouter>
    );

    expect(screen.getByText(/Chemical Application Log/i)).toBeInTheDocument();
    expect(screen.getByText(/Save & Log Application/i)).toBeInTheDocument();
  });
});
