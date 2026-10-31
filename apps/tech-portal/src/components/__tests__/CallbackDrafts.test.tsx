import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallbackDrafts } from '../CallbackDrafts';
import { callbackDrafts, retryCallbackDraft } from '../../callbackOfflineQueue';
import { callbackApi } from '../callbacks/callbackApi';

vi.mock('../../callbackOfflineQueue', () => ({
  callbackDrafts: vi.fn(),
  retryCallbackDraft: vi.fn(),
}));

vi.mock('../callbacks/callbackApi', () => ({
  callbackApi: vi.fn(),
}));

describe('CallbackDrafts Component', () => {
  const jobId = 'job-456';

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
  });

  it('renders nothing when there are no drafts and no error', async () => {
    vi.mocked(callbackDrafts).mockResolvedValue([]);

    const { container } = render(<CallbackDrafts jobId={jobId} />);

    // Wait microtask for initial fetch
    await waitFor(() => {
      expect(callbackDrafts).toHaveBeenCalledWith(jobId);
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('renders pending and needs_review drafts with details and proper status indicators', async () => {
    const mockDrafts = [
      {
        key: 'key-1',
        id: 'case-1',
        status: 'pending',
        body: { findings: 'Wasps in attic', summary: 'Nest removed' },
      },
      {
        key: 'key-2',
        id: 'case-2',
        status: 'needs_review',
        error: 'Conflict: version mismatch',
        body: { findings: 'Termites in basement', summary: 'Barrier applied' },
      },
    ];
    vi.mocked(callbackDrafts).mockResolvedValue(mockDrafts);

    render(<CallbackDrafts jobId={jobId} />);

    expect(await screen.findByLabelText('Saved callback outcomes')).toBeInTheDocument();

    // Check findings and summary
    expect(screen.getByText('Wasps in attic')).toBeInTheDocument();
    expect(screen.getByText('Nest removed')).toBeInTheDocument();
    expect(screen.getByText('Termites in basement')).toBeInTheDocument();
    expect(screen.getByText('Barrier applied')).toBeInTheDocument();

    // Status badges
    expect(screen.getByText('Pending sync')).toBeInTheDocument();
    expect(screen.getByText('Needs review')).toBeInTheDocument();

    // Error message displayed for draft needing review
    expect(screen.getByText('Conflict: version mismatch')).toBeInTheDocument();

    // Pending draft should NOT have a retry button; needs_review draft should have one
    const retryButtons = screen.getAllByRole('button');
    expect(retryButtons).toHaveLength(1);
    expect(retryButtons[0]).toHaveTextContent(/retry saved outcome/i);
  });

  it('refreshes drafts upon receiving the window callback_sync event and cleans up listener on unmount', async () => {
    vi.mocked(callbackDrafts).mockResolvedValueOnce([]);

    const { unmount } = render(<CallbackDrafts jobId={jobId} />);

    await waitFor(() => {
      expect(callbackDrafts).toHaveBeenCalledTimes(1);
    });

    // Update mock response
    vi.mocked(callbackDrafts).mockResolvedValueOnce([
      {
        key: 'key-3',
        id: 'case-3',
        status: 'pending',
        body: { findings: 'Ants', summary: 'Gel bait' },
      },
    ]);

    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('callback_sync'));

    await waitFor(() => {
      expect(callbackDrafts).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Ants')).toBeInTheDocument();

    // Unmount and verify event listener is removed
    unmount();
    window.dispatchEvent(new CustomEvent('callback_sync'));
    expect(callbackDrafts).toHaveBeenCalledTimes(2);
  });

  it('successfully retries a draft when case state is scheduled or in_service', async () => {
    const draft = {
      key: 'key-retry',
      id: 'case-99',
      status: 'needs_review',
      error: 'Conflict error',
      body: { findings: 'Rodents in garage', summary: 'Traps set' },
    };
    vi.mocked(callbackDrafts).mockResolvedValueOnce([draft]);
    vi.mocked(callbackApi).mockResolvedValueOnce({ state: 'in_service', version: 3 });
    vi.mocked(retryCallbackDraft).mockResolvedValueOnce(undefined);
    vi.mocked(callbackDrafts).mockResolvedValueOnce([]);

    render(<CallbackDrafts jobId={jobId} />);

    const retryBtn = await screen.findByRole('button', { name: /retry saved outcome/i });
    expect(retryBtn).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(callbackApi).toHaveBeenCalledWith('/case-99');
      expect(retryCallbackDraft).toHaveBeenCalledWith('key-retry', 3);
      expect(callbackDrafts).toHaveBeenCalledTimes(2);
    });
  });

  it('prevents retry and shows an alert when case state has moved on', async () => {
    const draft = {
      key: 'key-resolved',
      id: 'case-100',
      status: 'needs_review',
      body: { findings: 'Spiders', summary: 'Sprayed perimeter' },
    };
    vi.mocked(callbackDrafts).mockResolvedValueOnce([draft]);
    vi.mocked(callbackApi).mockResolvedValueOnce({ state: 'completed', version: 4 });

    render(<CallbackDrafts jobId={jobId} />);

    const retryBtn = await screen.findByRole('button', { name: /retry saved outcome/i });
    fireEvent.click(retryBtn);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'This case has moved on. Review the case with your dispatcher before changing the saved outcome.'
    );
    expect(retryCallbackDraft).not.toHaveBeenCalled();
  });

  it('displays error alert when callbackApi throws an exception during retry', async () => {
    const draft = {
      key: 'key-err',
      id: 'case-err',
      status: 'needs_review',
      body: { findings: 'Mice', summary: 'Bait boxes' },
    };
    vi.mocked(callbackDrafts).mockResolvedValueOnce([draft]);
    vi.mocked(callbackApi).mockRejectedValueOnce(new Error('Network request failed'));

    render(<CallbackDrafts jobId={jobId} />);

    const retryBtn = await screen.findByRole('button', { name: /retry saved outcome/i });
    fireEvent.click(retryBtn);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Network request failed');
    expect(retryCallbackDraft).not.toHaveBeenCalled();
  });

  it('disables retry button when navigator.onLine is false', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });

    const draft = {
      key: 'key-offline',
      id: 'case-offline',
      status: 'needs_review',
      body: { findings: 'Bees', summary: 'Relocated' },
    };
    vi.mocked(callbackDrafts).mockResolvedValueOnce([draft]);

    render(<CallbackDrafts jobId={jobId} />);

    const retryBtn = await screen.findByRole('button', { name: /retry saved outcome/i });
    expect(retryBtn).toHaveAttribute('aria-disabled', 'true');
  });
});
