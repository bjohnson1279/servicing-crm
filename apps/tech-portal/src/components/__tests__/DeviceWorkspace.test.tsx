import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import DeviceWorkspace from '../devices/DeviceWorkspace';
import { deviceApi, deviceToken, DeviceError } from '../devices/deviceApi';
import type { PropertyDevice } from '../devices/deviceApi';

vi.mock('../devices/deviceApi', async () => {
  const actual = await vi.importActual<typeof import('../devices/deviceApi')>('../devices/deviceApi');
  return {
    ...actual,
    deviceApi: vi.fn(),
    deviceToken: vi.fn(),
  };
});

describe('DeviceWorkspace Component', () => {
  const mockPlannedDevice: PropertyDevice = {
    id: 'dev-1',
    property_id: 'prop-1',
    property_address: '123 Elm St',
    label: 'BS-01',
    device_type: 'bait_station',
    lifecycle: 'planned',
    version: 1,
    location_version: 1,
    historical_installation: false,
    locations: [
      {
        version: 1,
        zone: 'Perimeter North',
        description: 'Near north fence',
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy_meters: 5,
        reason: 'Initial setup',
        effective_at: '2026-10-01T10:00:00Z',
      },
    ],
    events: [
      {
        id: 'evt-1',
        action: 'register',
        reason: 'Initial setup',
        created_at: '2026-10-01T10:00:00Z',
      },
    ],
  };

  const mockInstalledDevice: PropertyDevice = {
    id: 'dev-2',
    property_id: 'prop-1',
    property_address: '123 Elm St',
    label: 'BS-02',
    device_type: 'bait_station',
    lifecycle: 'installed',
    version: 2,
    location_version: 1,
    historical_installation: false,
    installed_at: '2026-10-02T10:00:00Z',
    locations: [
      {
        version: 1,
        zone: 'Perimeter South',
        description: 'Near south gate',
        reason: 'Initial setup',
        effective_at: '2026-10-02T10:00:00Z',
      },
    ],
    events: [
      {
        id: 'evt-2',
        action: 'install',
        reason: 'Confirmed installation on site',
        created_at: '2026-10-02T10:00:00Z',
      },
    ],
  };

  const mockStaffOptions = {
    properties: [{ id: 'prop-1', address: '123 Elm St', customer_name: 'Acme Corp' }],
    equipment: [{ id: 'eq-1', name: 'Standard Bait Station', sku: 'BS-100' }],
    jobs: [{ id: 'job-101', property_id: 'prop-1', scheduled_start: '2026-10-15 09:00' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deviceToken).mockReturnValue('mock-valid-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders sign-in prompt when authentication token is missing', async () => {
    vi.mocked(deviceToken).mockReturnValue(null);
    vi.mocked(deviceApi).mockResolvedValue({ enabled: false, role: '' });

    render(<DeviceWorkspace mode="staff" />);

    expect(await screen.findByText('Sign in through your organization to view devices.')).toBeInTheDocument();
  });

  it('renders disabled tracking message without enable button for non-admin roles', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: false, role: 'TECHNICIAN' } as any;
      return {} as any;
    });

    render(<DeviceWorkspace mode="technician" jobId="job-1" />);

    expect(await screen.findByText('Device tracking is not enabled for your organization.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enable device tracking/i })).not.toBeInTheDocument();
  });

  it('renders enable button for MANAGER role and enables device tracking when clicked', async () => {
    let trackingEnabled = false;
    vi.mocked(deviceApi).mockImplementation(async (path: string, body?: any) => {
      if (path === '/settings' && body?.enabled === true) {
        trackingEnabled = true;
        return { enabled: true, role: 'MANAGER' } as any;
      }
      if (path === '/settings') {
        return { enabled: trackingEnabled, role: 'MANAGER' } as any;
      }
      if (path.startsWith('/?')) {
        return { items: [], has_more: false } as any;
      }
      if (path === '/options') {
        return mockStaffOptions as any;
      }
      return {} as any;
    });

    render(<DeviceWorkspace mode="staff" />);

    const enableBtn = await screen.findByRole('button', { name: /enable device tracking/i });
    expect(enableBtn).toBeInTheDocument();

    fireEvent.click(enableBtn);

    await waitFor(() => {
      expect(deviceApi).toHaveBeenCalledWith('/settings', { enabled: true });
    });
    expect(await screen.findByText(/No devices match this view/i)).toBeInTheDocument();
  });

  it('renders technician view with assigned job empty state', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'TECHNICIAN' } as any;
      if (path.startsWith('/?')) return { items: [], has_more: false } as any;
      return {} as any;
    });

    render(<DeviceWorkspace mode="technician" jobId="job-99" />);

    expect(await screen.findByText('No registered devices are available for this assigned job.')).toBeInTheDocument();
    // In technician mode, property and lifecycle filters should not be shown
    expect(screen.queryByLabelText(/^Property$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Lifecycle$/i)).not.toBeInTheDocument();
  });

  it('searches for a device by permanent label using lookup button', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'TECHNICIAN' } as any;
      if (path.startsWith('/?')) return { items: [], has_more: false } as any;
      if (path.startsWith('/lookup?')) return mockInstalledDevice as any;
      return {} as any;
    });

    render(<DeviceWorkspace mode="technician" jobId="job-1" />);

    const lookupInput = await screen.findByLabelText(/find permanent label/i);
    const findBtn = screen.getByRole('button', { name: /find device/i });

    expect(findBtn).toBeDisabled();

    fireEvent.change(lookupInput, { target: { value: 'BS-02' } });
    expect(findBtn).not.toBeDisabled();

    fireEvent.click(findBtn);

    await waitFor(() => {
      expect(deviceApi).toHaveBeenCalledWith('/lookup?label=BS-02&job_id=job-1');
    });

    expect(await screen.findByText('BS-02 · installed')).toBeInTheDocument();
    expect(screen.getByText(/123 Elm St · bait station/i)).toBeInTheDocument();
  });

  it('allows staff to register a planned device when form fields are complete', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string, body?: any) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' } as any;
      if (path === '/options') return mockStaffOptions as any;
      if (path.startsWith('/?')) return { items: [], has_more: false } as any;
      if (path === '/' && body) {
        return mockPlannedDevice as any;
      }
      return {} as any;
    });

    render(<DeviceWorkspace mode="staff" />);

    // Wait until loading finishes and empty view text appears
    expect(await screen.findByText(/No devices match this view/i)).toBeInTheDocument();

    // Select property
    const propSelect = screen.getByLabelText('Property');
    fireEvent.change(propSelect, { target: { value: 'prop-1' } });

    // Wait until form fields are rendered after property change finishes reload
    const labelInput = await screen.findByLabelText('Permanent label');
    const zoneInput = screen.getByLabelText('Location zone');
    const descInput = screen.getByLabelText('Location description');
    const reasonInput = screen.getByLabelText('Registration reason');
    const registerBtn = screen.getByRole('button', { name: /register device/i });

    expect(registerBtn).toBeDisabled();

    fireEvent.change(labelInput, { target: { value: 'BS-01' } });
    fireEvent.change(zoneInput, { target: { value: 'Perimeter North' } });
    fireEvent.change(descInput, { target: { value: 'Near north fence' } });
    fireEvent.change(reasonInput, { target: { value: 'Initial setup' } });

    expect(registerBtn).not.toBeDisabled();

    fireEvent.click(registerBtn);

    await waitFor(() => {
      expect(deviceApi).toHaveBeenCalledWith('/', expect.objectContaining({
        property_id: 'prop-1',
        label: 'BS-01',
        device_type: 'bait_station',
        zone: 'Perimeter North',
        description: 'Near north fence',
        reason: 'Initial setup',
      }));
    });

    expect(await screen.findByText('Saved and confirmed by the server.')).toBeInTheDocument();
    expect(screen.getByText('BS-01 · planned')).toBeInTheDocument();
  });

  it('confirms device installation with job ID and with historical checkbox', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string, body?: any) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' } as any;
      if (path === '/options') return mockStaffOptions as any;
      if (path.startsWith('/?')) return { items: [mockPlannedDevice], has_more: false } as any;
      if (path === '/dev-1') return mockPlannedDevice as any;
      if (path === '/dev-1/install') {
        return { ...mockPlannedDevice, lifecycle: 'installed', installed_at: '2026-10-15T09:00:00Z' } as any;
      }
      return {} as any;
    });

    render(<DeviceWorkspace mode="staff" />);

    const deviceItemBtn = await screen.findByRole('button', { name: /BS-01 — 123 Elm St · planned/i });
    fireEvent.click(deviceItemBtn);

    expect(await screen.findByText('BS-01 · planned')).toBeInTheDocument();

    const reasonInput = screen.getByLabelText('Decision reason');
    const jobSelect = screen.getByLabelText('Installation job');
    const historicalCheckbox = screen.getByLabelText(/Record an existing historical installation/i);
    const confirmBtn = screen.getByRole('button', { name: /confirm installation/i });

    expect(confirmBtn).toBeDisabled();

    // Fill reason and select job
    fireEvent.change(reasonInput, { target: { value: 'Installed on scheduled service' } });
    fireEvent.change(jobSelect, { target: { value: 'job-101' } });
    expect(confirmBtn).not.toBeDisabled();

    // Toggle historical: job input should become disabled and cleared
    fireEvent.click(historicalCheckbox);
    expect(jobSelect).toBeDisabled();
    expect(confirmBtn).not.toBeDisabled();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deviceApi).toHaveBeenCalledWith('/dev-1/install', expect.objectContaining({
        id: 'dev-1',
        version: 1,
        reason: 'Installed on scheduled service',
        job_id: null,
        historical_installation: true,
      }));
    });
  });

  it('handles device relocation and retirement', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string, body?: any) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' } as any;
      if (path === '/options') return mockStaffOptions as any;
      if (path.startsWith('/?')) return { items: [mockInstalledDevice], has_more: false } as any;
      if (path === '/dev-2') return mockInstalledDevice as any;
      if (path === '/dev-2/relocate') {
        return {
          ...mockInstalledDevice,
          locations: [
            ...mockInstalledDevice.locations,
            { version: 2, zone: 'Zone B', description: 'Moved to back garden', reason: 'Landscaping change', effective_at: '2026-10-20T10:00:00Z' },
          ],
          location_version: 2,
        } as any;
      }
      if (path === '/dev-2/retire') {
        return { ...mockInstalledDevice, lifecycle: 'retired' } as any;
      }
      return {} as any;
    });

    render(<DeviceWorkspace mode="staff" />);

    const openBtn = await screen.findByRole('button', { name: /BS-02 — 123 Elm St · installed/i });
    fireEvent.click(openBtn);

    expect(await screen.findByText('BS-02 · installed')).toBeInTheDocument();

    // Test Relocate
    const reasonInput = screen.getByLabelText('Decision reason');
    const newZoneInput = screen.getByLabelText('New location zone');
    const newDescInput = screen.getByLabelText('New location description');
    const relocateBtn = screen.getByRole('button', { name: /record relocation/i });

    fireEvent.change(reasonInput, { target: { value: 'Moved due to lawn remodel' } });
    fireEvent.change(newZoneInput, { target: { value: 'Zone B' } });
    fireEvent.change(newDescInput, { target: { value: 'Moved to back garden' } });

    fireEvent.click(relocateBtn);

    await waitFor(() => {
      expect(deviceApi).toHaveBeenCalledWith('/dev-2/relocate', expect.objectContaining({
        zone: 'Zone B',
        description: 'Moved to back garden',
        reason: 'Moved due to lawn remodel',
      }));
    });

    // In DeviceWorkspace, successful run() calls choose() which resets reason to ''
    // To retire the device, provide a reason for retirement
    const retireReasonInput = await screen.findByLabelText('Decision reason');
    fireEvent.change(retireReasonInput, { target: { value: 'Retiring old device' } });

    const retireBtn = screen.getByRole('button', { name: /retire device/i });
    expect(retireBtn).not.toBeDisabled();
    fireEvent.click(retireBtn);

    await waitFor(() => {
      expect(deviceApi).toHaveBeenCalledWith('/dev-2/retire', expect.objectContaining({
        id: 'dev-2',
        reason: 'Retiring old device',
      }));
    });
  });

  it('retains unconfirmed action and allows retry on network interruption (status 0)', async () => {
    let callCount = 0;
    vi.mocked(deviceApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' } as any;
      if (path === '/options') return mockStaffOptions as any;
      if (path.startsWith('/?')) return { items: [mockInstalledDevice], has_more: false } as any;
      if (path === '/dev-2') return mockInstalledDevice as any;
      if (path === '/dev-2/retire') {
        callCount++;
        if (callCount === 1) {
          throw new DeviceError(0, 'Connection interrupted. Your action is not confirmed; retry when connected.');
        }
        return { ...mockInstalledDevice, lifecycle: 'retired' } as any;
      }
      return {} as any;
    });

    render(<DeviceWorkspace mode="staff" />);

    const openBtn = await screen.findByRole('button', { name: /BS-02 — 123 Elm St · installed/i });
    fireEvent.click(openBtn);

    const reasonInput = await screen.findByLabelText('Decision reason');
    fireEvent.change(reasonInput, { target: { value: 'Damaged by tractor' } });

    const retireBtn = screen.getByRole('button', { name: /retire device/i });
    fireEvent.click(retireBtn);

    // Initial attempt fails with status 0
    expect(await screen.findByText('Connection interrupted. Your action is not confirmed; retry when connected.')).toBeInTheDocument();

    const retryBtn = await screen.findByRole('button', { name: /retry unconfirmed action/i });
    expect(retryBtn).toBeInTheDocument();

    // Click retry
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(callCount).toBe(2);
      expect(screen.getByText('Saved and confirmed by the server.')).toBeInTheDocument();
    });
  });

  it('clears selection and items when deviceApi returns 401 or 403', async () => {
    vi.mocked(deviceApi).mockImplementation(async (path: string) => {
      if (path === '/settings') return { enabled: true, role: 'STAFF' } as any;
      if (path === '/options') return mockStaffOptions as any;
      if (path.startsWith('/?')) return { items: [mockInstalledDevice], has_more: false } as any;
      if (path === '/dev-2') return mockInstalledDevice as any;
      if (path === '/dev-2/retire') {
        throw new DeviceError(401, 'Your session changed. Reload the register.');
      }
      return {} as any;
    });

    render(<DeviceWorkspace mode="staff" />);

    const openBtn = await screen.findByRole('button', { name: /BS-02 — 123 Elm St · installed/i });
    fireEvent.click(openBtn);

    const reasonInput = await screen.findByLabelText('Decision reason');
    fireEvent.change(reasonInput, { target: { value: 'Retire reason' } });

    const retireBtn = screen.getByRole('button', { name: /retire device/i });
    fireEvent.click(retireBtn);

    expect(await screen.findByText('Your session changed. Reload the register.')).toBeInTheDocument();
    // Selected device article should be dismissed
    expect(screen.queryByText('BS-02 · installed')).not.toBeInTheDocument();
  });
});
