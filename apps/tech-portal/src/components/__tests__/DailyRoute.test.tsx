import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, test, expect } from 'vitest';
import { DailyRoute } from '../DailyRoute';

// Mock react-leaflet components for lightweight DOM rendering
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Polyline: () => <div data-testid="polyline" />,
  Marker: ({ children }: any) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
}));

describe('DailyRoute Component', () => {
  test('renders DailyRoute heading and map without crashing', () => {
    render(
      <MemoryRouter>
        <DailyRoute />
      </MemoryRouter>
    );

    expect(screen.getByText('Daily Route')).toBeInTheDocument();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });
});
