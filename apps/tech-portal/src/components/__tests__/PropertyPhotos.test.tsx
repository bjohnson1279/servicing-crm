import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, test, expect, beforeEach } from 'vitest';
import axios from 'axios';
import PropertyPhotos from '../PropertyPhotos';

vi.mock('axios');

describe('PropertyPhotos Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('renders property photos header and file input', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: [
        {
          id: 'photo-1',
          url: 'https://example.com/photo1.jpg',
          caption: 'Front yard',
          tags: ['exterior'],
          uploaded_at: '2026-10-10T12:00:00Z',
        },
      ],
    });

    render(<PropertyPhotos propertyId="prop-123" />);

    expect(screen.getByText('Property Photos')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Front yard')).toBeInTheDocument();
    });
  });

  test('displays empty state when no photos are present', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: [] });

    render(<PropertyPhotos propertyId="prop-456" />);

    await waitFor(() => {
      expect(screen.getByText(/No photos available/i)).toBeInTheDocument();
    });
  });
});
