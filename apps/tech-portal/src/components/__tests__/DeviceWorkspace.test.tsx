import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeviceWorkspace from '../devices/DeviceWorkspace';
import { deviceApi, deviceToken, DeviceError, PropertyDevice } from '../devices/deviceApi';

vi.mock('../devices/deviceApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../devices/deviceApi')>();
  return {
    ...actual,
    deviceApi: vi.fn(),
    deviceToken: vi.fn(),
  };
});

describe('DeviceWorkspace Component', () => {
  const mockToken = 'mock-access-token';

  const mockDevice: PropertyDevice = {
    id: 'dev-1',
    property_id: 'prop-1',
    property_address: '123 Main St',
    label: 'BS-01',
    device_type: 'bait_station',
    lifecycle: 'planned',
    version: 1,
    location_version: 1,
    historical_installation: false,
    locations: [
      {
        version: 1,
        zone: 'North Yard',
        description: 'Near fence gate',
        latitude: 40.7128,
        longitude: -74.006,
        accuracy_meters: 5,
        reason: 'Initial inspection',
        effective_at: '2026-01-01T00:00:00Z',
      },
    ],
    events: [
      {
        id: 'evt-1',
        action: 'register',
        reason: 'Planned perimeter defense',
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
  };

  const mockOptions = {
    properties: [
      { id: 'prop-1', address: '123 Main St', customer_name: 'Acme Corp' },
    ],
    equipment: [
      { id: 'eq-1', name: 'Rodent Bait Box', sku: 'RBB-100' },
    ],
    jobs: [
      { id: 'job-101', property_id: 'prop-1', scheduled_start: '2026-02-01T10:00:00Z' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deviceToken).mockReturnValue(mockToken);
  });

  it('renders unauthenticated prompt when access token is missing', async () => {
    vi.mocked(deviceToken).mockReturnValue(null);

    render(<DeviceWorkspace mode="staff" />);

    expect(
      screen.getByText('Sign in through your organization to view devices.')
    ).toBeInTheDocument();
  });

  it('displays organization disabled notice and allows managers to enable device tracking', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string) => {
      if (path === '/settings') {
        return { enabled: false, role: 'MANAGER' };
      }
      return {};
    });

    render(<DeviceWorkspace mode="staff" />);

    expect(
      await screen.findByText('Device tracking is not enabled for your organization.')
    ).toBeInTheDocument();

    const enableButton = screen.getByRole('button', { name: 'Enable device tracking' });
    expect(enableButton).toBeInTheDocument();

    fireEvent.click(enableButton);

    await waitFor(() => {
      expect(deviceApi).toHaveBeenCalledWith('/settings', { enabled: true });
    });
  });

  it('renders technician view scoped to job_id and handles empty list gracefully', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string) => {
      if (path === '/settings') {
        return { enabled: true, role: 'TECHNICIAN' };
      }
      if (path.startsWith('/?')) {
        return { items: [], has_more: false };
      }
      return {};
    });

    render(<DeviceWorkspace mode="technician" jobId="job-tech-99" />);

    expect(
      await screen.findByText(
        'No registered devices are available for this assigned job.'
      )
    ).toBeInTheDocument();

    expect(deviceApi).toHaveBeenCalledWith(expect.stringContaining('job_id=job-tech-99'));
    expect(screen.queryByText('Register planned device')).not.toBeInTheDocument();
  });

  it('allows staff to view devices, filter by property and register a new planned device', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/settings') {
        return { enabled: true, role: 'SUPER_ADMIN' };
      }
      if (path === '/options') {
        return mockOptions;
      }
      if (path.startsWith('/?')) {
        return { items: [mockDevice], has_more: false };
      }
      if (path === '/' && body) {
        return {
          ...mockDevice,
          id: 'dev-2',
          label: 'BS-02',
        };
      }
      return {};
    });

    render(<DeviceWorkspace mode="staff" />);

    expect(await screen.findByText(/BS-01 — 123 Main St · planned/i)).toBeInTheDocument();
    expect(await screen.findByText('Register planned device')).toBeInTheDocument();

    // Select property
    const propertySelect = screen.getByLabelText('Property');
    fireEvent.change(propertySelect, { target: { value: 'prop-1' } });

    // Wait for the re-fetch triggered by property change to complete
    expect(await screen.findByText('Register planned device')).toBeInTheDocument();

    // Fill registration form
    fireEvent.change(screen.getByLabelText('Permanent label'), { target: { value: 'BS-02' } });
    fireEvent.change(screen.getByLabelText('Location zone'), { target: { value: 'Back Patio' } });
    fireEvent.change(screen.getByLabelText('Location description'), {
      target: { value: 'Behind deck stairs' },
    });
    fireEvent.change(screen.getByLabelText('Registration reason'), {
      target: { value: 'Customer rodent sighting' },
    });

    const registerButton = screen.getByRole('button', { name: 'Register device' });
    expect(registerButton).toBeEnabled();

    fireEvent.click(registerButton);

    await waitFor(() => {
      expect(deviceApi).toHaveBeenCalledWith(
        '/',
        expect.objectContaining({
          property_id: 'prop-1',
          label: 'BS-02',
          zone: 'Back Patio',
          description: 'Behind deck stairs',
          reason: 'Customer rodent sighting',
        })
      );
    });

    expect(await screen.findByText('Saved and confirmed by the server.')).toBeInTheDocument();
  });

  it('selects a device, displays location history, and displays warning if retired', async () => {
    const retiredDevice: PropertyDevice = {
      ...mockDevice,
      id: 'dev-retired',
      label: 'TRAP-99',
      lifecycle: 'retired',
      locations: [
        {
          version: 1,
          zone: 'Basement',
          description: 'Near boiler',
          reason: 'Initial setup',
          effective_at: '2025-01-01T00:00:00Z',
        },
      ],
      events: [
        {
          id: 'evt-retired',
          action: 'retire',
          reason: 'Damaged by flooding',
          created_at: '2025-06-01T00:00:00Z',
        },
      ],
    };

    vi.mocked(deviceApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [retiredDevice], has_more: false };
      if (path === '/dev-retired') return retiredDevice;
      return {};
    });

    render(<DeviceWorkspace mode="staff" />);

    const itemButton = await screen.findByRole('button', {
      name: /TRAP-99 — 123 Main St · retired/i,
    });
    fireEvent.click(itemButton);

    expect(
      await screen.findByText(
        'Retired device — do not service. Its label continues to identify this original device.'
      )
    ).toBeInTheDocument();

    expect(screen.getByText('Device ID: dev-retired')).toBeInTheDocument();
    expect(screen.getByText(/Version 1: Basement — Near boiler/i)).toBeInTheDocument();
    expect(screen.queryByText('Manage device')).not.toBeInTheDocument();
  });

  it('confirms installation for a planned device with an active job or historical checkbox', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [mockDevice], has_more: false };
      if (path === '/dev-1') return mockDevice;
      if (path === '/dev-1/install') {
        return {
          ...mockDevice,
          lifecycle: 'installed',
        };
      }
      return {};
    });

    render(<DeviceWorkspace mode="staff" />);

    const itemButton = await screen.findByRole('button', {
      name: /BS-01 — 123 Main St · planned/i,
    });
    fireEvent.click(itemButton);

    expect(await screen.findByText('Manage device')).toBeInTheDocument();

    // Fill reason and select historical installation
    fireEvent.change(screen.getByLabelText('Decision reason'), {
      target: { value: 'Device already in place from prior vendor' },
    });
    const historicalCheckbox = screen.getByLabelText(/Record an existing historical installation/i);
    fireEvent.click(historicalCheckbox);

    const confirmButton = screen.getByRole('button', { name: 'Confirm installation' });
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deviceApi).toHaveBeenCalledWith(
        '/dev-1/install',
        expect.objectContaining({
          id: 'dev-1',
          historical_installation: true,
          job_id: null,
          reason: 'Device already in place from prior vendor',
        })
      );
    });
  });

  it('manages an installed device: relocates and retires device', async () => {
    const installedDevice: PropertyDevice = {
      ...mockDevice,
      lifecycle: 'installed',
    };

    vi.mocked(deviceApi).mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [installedDevice], has_more: false };
      if (path === '/dev-1') return installedDevice;
      if (path === '/dev-1/relocate') {
        return {
          ...installedDevice,
          location_version: 2,
          locations: [
            ...installedDevice.locations,
            {
              version: 2,
              zone: 'South Garden',
              description: 'Next to shed',
              reason: 'Better bait exposure',
              effective_at: '2026-03-01T00:00:00Z',
            },
          ],
        };
      }
      return {};
    });

    render(<DeviceWorkspace mode="staff" />);

    const itemButton = await screen.findByRole('button', {
      name: /BS-01 — 123 Main St · installed/i,
    });
    fireEvent.click(itemButton);

    expect(await screen.findByText('Manage device')).toBeInTheDocument();

    // Relocate
    fireEvent.change(screen.getByLabelText('Decision reason'), {
      target: { value: 'Optimizing coverage' },
    });
    fireEvent.change(screen.getByLabelText('New location zone'), {
      target: { value: 'South Garden' },
    });
    fireEvent.change(screen.getByLabelText('New location description'), {
      target: { value: 'Next to shed' },
    });

    const relocateButton = screen.getByRole('button', { name: 'Record relocation' });
    expect(relocateButton).toBeEnabled();
    fireEvent.click(relocateButton);

    await waitFor(() => {
      expect(deviceApi).toHaveBeenCalledWith(
        '/dev-1/relocate',
        expect.objectContaining({
          zone: 'South Garden',
          description: 'Next to shed',
          reason: 'Optimizing coverage',
        })
      );
    });
  });

  it('handles network failure (status 0) and enables retry of unconfirmed action', async () => {
    let callCount = 0;
    vi.mocked(deviceApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) return { items: [mockDevice], has_more: false };
      if (path === '/dev-1') return mockDevice;
      if (path === '/dev-1/retire') {
        callCount++;
        if (callCount === 1) {
          throw new DeviceError(0, 'Connection interrupted. Your action is not confirmed; retry when connected.');
        }
        return {
          ...mockDevice,
          lifecycle: 'retired',
        };
      }
      return {};
    });

    render(<DeviceWorkspace mode="staff" />);

    const itemButton = await screen.findByRole('button', {
      name: /BS-01 — 123 Main St · planned/i,
    });
    fireEvent.click(itemButton);

    fireEvent.change(await screen.findByLabelText('Decision reason'), {
      target: { value: 'No longer needed' },
    });

    const retireButton = screen.getByRole('button', { name: 'Retire device' });
    fireEvent.click(retireButton);

    expect(
      await screen.findByText(
        'Connection interrupted. Your action is not confirmed; retry when connected.'
      )
    ).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: 'Retry unconfirmed action' });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(callCount).toBe(2);
    });

    expect(await screen.findByText('Saved and confirmed by the server.')).toBeInTheDocument();
  });

  it('resets selected device and items when authorization error occurs', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' };
      if (path === '/options') return mockOptions;
      if (path.startsWith('/?')) {
        throw new DeviceError(401, 'Sign in through your organization to view devices.');
      }
      return {};
    });

    render(<DeviceWorkspace mode="staff" />);

    expect(
      await screen.findByText('Sign in through your organization to view devices.')
    ).toBeInTheDocument();

    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText('No devices match this view. Select a property to register a planned device.')).toBeInTheDocument();
  });
});
