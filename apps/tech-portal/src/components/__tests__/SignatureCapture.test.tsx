import React, { forwardRef, useImperativeHandle } from 'react';
import { vi, test, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SignatureCapture } from '../SignatureCapture';
import { enqueueRequest, syncQueue } from '../../offlineQueue';

let mockEmpty = false;
const mockClear = vi.fn();

vi.mock('../../offlineQueue', () => ({
  enqueueRequest: vi.fn().mockResolvedValue(undefined),
  syncQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react-signature-canvas', () => ({
  default: forwardRef((props: any, ref: any) => {
    useImperativeHandle(ref, () => ({
      isEmpty: () => mockEmpty,
      toDataURL: () => 'data:image/png;base64,SIGNATURE_BYTES',
      clear: mockClear,
    }));
    return (
      <div
        data-testid="sig-pad"
        onClick={() => {
          props.onBegin?.();
          props.onEnd?.();
        }}
      >
        SignatureCanvas Mock
      </div>
    );
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockEmpty = false;
});

test('renders SignatureCapture without crashing', () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/job/job-42/signature']}>
      <Routes>
        <Route path="/job/:id/signature" element={<SignatureCapture />} />
      </Routes>
    </MemoryRouter>
  );
  expect(container).toBeDefined();
  expect(screen.getByText('Customer Signature - Job job-42')).toBeInTheDocument();
});

test('enqueues offline signature payload and syncs when saved', async () => {
  render(
    <MemoryRouter initialEntries={['/job/job-42/signature']}>
      <Routes>
        <Route path="/job/:id/signature" element={<SignatureCapture />} />
        <Route path="/job/:id" element={<div>Job Detail View</div>} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByTestId('sig-pad'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() =>
    expect(vi.mocked(enqueueRequest)).toHaveBeenCalledWith(
      '/api/v1/jobs/job-42/signature',
      'POST',
      expect.objectContaining({
        signatureDataUrl: 'data:image/png;base64,SIGNATURE_BYTES',
        capturedAt: expect.any(String),
      })
    )
  );
  expect(vi.mocked(syncQueue)).toHaveBeenCalled();
  expect(await screen.findByText('Job Detail View')).toBeInTheDocument();
});

test('shows validation error when signature canvas reports empty', async () => {
  mockEmpty = true;
  render(
    <MemoryRouter initialEntries={['/job/job-42/signature']}>
      <Routes>
        <Route path="/job/:id/signature" element={<SignatureCapture />} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByTestId('sig-pad'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Please provide a signature first.');
  expect(vi.mocked(enqueueRequest)).not.toHaveBeenCalled();
});

test('clears signature when confirmed', () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(
    <MemoryRouter initialEntries={['/job/job-42/signature']}>
      <Routes>
        <Route path="/job/:id/signature" element={<SignatureCapture />} />
      </Routes>
    </MemoryRouter>
  );

  fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(mockClear).toHaveBeenCalled();
});
