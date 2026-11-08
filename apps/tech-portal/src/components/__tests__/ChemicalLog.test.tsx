import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ChemicalLog } from '../ChemicalLog';
import { enqueueRequest } from '../../offlineQueue';

// Mock offlineQueue enqueueRequest
vi.mock('../../offlineQueue', () => ({
  enqueueRequest: vi.fn(),
}));

describe('ChemicalLog Component', () => {
  const mockInventoryItems = [
    { id: 'item-1', name: 'Permethrin SFR', sku: 'PERM-001', quantity: 25 },
    { id: 'item-2', name: 'Bifenthrin Pro', sku: 'BIF-002', quantity: 5 },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn().mockImplementation((key: string) => {
        if (key === 'crm_access_token') return 'mock-jwt-token';
        return null;
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderChemicalLog = (jobId = 'job-456') => {
    return render(
      <MemoryRouter initialEntries={[`/job/${jobId}/chemicals`]}>
        <Routes>
          <Route path="/job/:id/chemicals" element={<ChemicalLog />} />
          <Route path="/job/:id" element={<div data-testid="job-details-view">Job Details Page</div>} />
        </Routes>
      </MemoryRouter>
    );
  };

  test('renders Chemical Application Log without crashing inside MemoryRouter', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockInventoryItems,
    } as any);

    renderChemicalLog();

    expect(screen.getByText(/Chemical Application Log/i)).toBeInTheDocument();
    expect(screen.getByText(/EPA Compliance/i)).toBeInTheDocument();
    expect(screen.getByText('job-456')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Permethrin SFR \(PERM-001\)/i })).toBeInTheDocument();
    });
  });

  test('handles inventory fetch failure gracefully on mount', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

    renderChemicalLog();

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not fetch inventory items'));
    });
    // The dropdown still exists with default option
    expect(screen.getByRole('option', { name: /-- Custom \/ Unlisted Chemical --/i })).toBeInTheDocument();
  });

  test('selecting an inventory item populates chemical name and resets epa registration number', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockInventoryItems,
    } as any);

    renderChemicalLog();

    await screen.findByRole('option', { name: /Permethrin SFR/i });
    const select = screen.getByLabelText(/Select Chemical from Inventory/i);
    const chemNameInput = screen.getByLabelText(/Chemical Brand \/ Trade Name/i) as HTMLInputElement;
    const epaInput = screen.getByLabelText(/EPA Registration #/i) as HTMLInputElement;

    // Manually enter an EPA number first
    fireEvent.change(epaInput, { target: { value: '12345-67' } });
    expect(epaInput.value).toBe('12345-67');

    // Select inventory item
    fireEvent.change(select, { target: { value: 'item-1' } });
    expect(chemNameInput.value).toBe('Permethrin SFR');
    // EPA reg should be cleared because inventory doesn't establish product registration identity
    expect(epaInput.value).toBe('');

    // Selecting custom item clears chemical name and epa reg
    fireEvent.change(select, { target: { value: '' } });
    expect(chemNameInput.value).toBe('');
    expect(epaInput.value).toBe('');
  });

  test('allows toggling target pests', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as any);

    renderChemicalLog();

    const antsCheckbox = screen.getByLabelText('Ants') as HTMLInputElement;
    const spidersCheckbox = screen.getByLabelText('Spiders') as HTMLInputElement;

    // Ants is checked by default
    expect(antsCheckbox.checked).toBe(true);
    expect(spidersCheckbox.checked).toBe(false);

    // Toggle Ants off
    fireEvent.click(antsCheckbox);
    expect(antsCheckbox.checked).toBe(false);

    // Toggle Spiders on
    fireEvent.click(spidersCheckbox);
    expect(spidersCheckbox.checked).toBe(true);
  });

  test('displays error message when chemical name is empty upon submission', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as any);

    renderChemicalLog();

    const form = screen.getByRole('button', { name: /Save & Log Application/i }).closest('form')!;
    const chemNameInput = screen.getByLabelText(/Chemical Brand \/ Trade Name/i);
    fireEvent.change(chemNameInput, { target: { value: '   ' } });

    fireEvent.submit(form);

    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter or select a chemical name');
  });

  test('displays error message when quantity is invalid or negative', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as any);

    renderChemicalLog();

    const form = screen.getByRole('button', { name: /Save & Log Application/i }).closest('form')!;
    const chemNameInput = screen.getByLabelText(/Chemical Brand \/ Trade Name/i);
    const qtyInput = screen.getByLabelText(/Quantity Applied/i);

    fireEvent.change(chemNameInput, { target: { value: 'Termidor SC' } });
    fireEvent.change(qtyInput, { target: { value: '-2.5' } });

    fireEvent.submit(form);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Invalid chemical quantity amount: '-2.5'/i);
  });

  test('displays error message when EPA registration number format is invalid', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as any);

    renderChemicalLog();

    const form = screen.getByRole('button', { name: /Save & Log Application/i }).closest('form')!;
    const chemNameInput = screen.getByLabelText(/Chemical Brand \/ Trade Name/i);
    const epaInput = screen.getByLabelText(/EPA Registration #/i);

    fireEvent.change(chemNameInput, { target: { value: 'Termidor SC' } });
    fireEvent.change(epaInput, { target: { value: 'invalid-epa-format!' } });

    fireEvent.submit(form);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Invalid EPA Registration Number format/i);
  });

  test('displays error message when weather conditions are invalid', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as any);

    renderChemicalLog();

    const form = screen.getByRole('button', { name: /Save & Log Application/i }).closest('form')!;
    const chemNameInput = screen.getByLabelText(/Chemical Brand \/ Trade Name/i);
    const tempInput = screen.getByLabelText(/Temperature/i);

    fireEvent.change(chemNameInput, { target: { value: 'Termidor SC' } });
    fireEvent.change(tempInput, { target: { value: '   ' } });

    fireEvent.submit(form);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Invalid temperature value/i);
  });

  test('submits valid form successfully and handles stock deduction & warning', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockInventoryItems,
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          inventory_updated: true,
          low_stock_warning: true,
        }),
      } as any);

    renderChemicalLog('job-789');

    await screen.findByRole('option', { name: /Permethrin SFR/i });
    const select = screen.getByLabelText(/Select Chemical from Inventory/i);
    fireEvent.change(select, { target: { value: 'item-1' } });

    const epaInput = screen.getByLabelText(/EPA Registration #/i);
    fireEvent.change(epaInput, { target: { value: '7969-210' } });

    const qtyInput = screen.getByLabelText(/Quantity Applied/i);
    fireEvent.change(qtyInput, { target: { value: '4.5' } });

    const notesInput = screen.getByLabelText(/Application Notes & Site Observations/i);
    fireEvent.change(notesInput, { target: { value: 'Perimeter barrier application' } });

    const submitBtn = screen.getByRole('button', { name: /Save & Log Application/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    const postCall = vi.mocked(globalThis.fetch).mock.calls[1];
    expect(postCall[0]).toBe('/api/v1/inventory/chemical-logs');
    const requestOptions = postCall[1] as RequestInit;
    expect(requestOptions.method).toBe('POST');
    expect(requestOptions.headers).toEqual({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer mock-jwt-token',
    });

    const parsedBody = JSON.parse(requestOptions.body as string);
    expect(parsedBody).toMatchObject({
      job_id: 'job-789',
      technician_id: '00000000-0000-0000-0000-000000000002',
      chemical_name: 'Permethrin SFR',
      epa_registration_no: '7969-210',
      inventory_item_id: 'item-1',
      quantity_used: 4.5,
      unit: 'oz',
      application_method: 'Exterior Perimeter Barrier (Liquid Spray)',
      target_pests: ['Ants'],
      notes: 'Perimeter barrier application',
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Chemical log recorded successfully!/i);
    expect(alert).toHaveTextContent(/Auto-deducted 4.5 oz from warehouse inventory/i);
    expect(alert).toHaveTextContent(/Stock dropped below threshold! Purchase Order draft automatically created/i);

    // Clicking 'Return to Job Details' navigates to the job page
    const returnBtn = screen.getByRole('button', { name: /Return to Job Details/i });
    fireEvent.click(returnBtn);
    expect(await screen.findByTestId('job-details-view')).toBeInTheDocument();
  });

  test('falls back to offline queue when submission fails or backend is unreachable', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as any)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderChemicalLog('job-offline-1');

    const chemNameInput = screen.getByLabelText(/Chemical Brand \/ Trade Name/i);
    fireEvent.change(chemNameInput, { target: { value: 'Bifenthrin 7.9%' } });

    const submitBtn = screen.getByRole('button', { name: /Save & Log Application/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(enqueueRequest).toHaveBeenCalledWith(
        '/api/v1/inventory/chemical-logs',
        'POST',
        expect.objectContaining({
          job_id: 'job-offline-1',
          chemical_name: 'Bifenthrin 7.9%',
          quantity_used: 1.0,
          unit: 'oz',
        })
      );
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Device is offline or server unreachable\. Log queued locally/i);
  });

  test('validates file upload type and size', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as any);

    const { container } = renderChemicalLog();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    // 1. Invalid file type (e.g., text/plain)
    const textFile = new File(['text content'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [textFile] } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid file type. Only images are allowed.');

    // 2. File size exceeding 5MB
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [bigFile] } });

    expect(await screen.findByRole('alert')).toHaveTextContent('File size must be under 5MB.');
  });

  test('loads valid image via file upload and allows removing photo with confirm dialog', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as any);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    // Mock FileReader constructor class
    class MockFileReader {
      result: string | null = null;
      onloadend: (() => void) | null = null;
      readAsDataURL() {
        this.result = 'data:image/png;base64,mockImageData';
        setTimeout(() => {
          this.onloadend?.();
        }, 10);
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);

    const { container } = renderChemicalLog();

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const imageFile = new File(['fake image bytes'], 'test.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [imageFile] } });

    const img = await screen.findByAltText('Chemical Application');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'data:image/png;base64,mockImageData');

    // Remove photo
    const removeBtn = screen.getByRole('button', { name: /Remove Photo/i });
    fireEvent.click(removeBtn);

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to remove this photo?');
    expect(screen.queryByAltText('Chemical Application')).not.toBeInTheDocument();
  });
});
