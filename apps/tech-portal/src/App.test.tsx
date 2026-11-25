import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';
import { syncCallbackOutcomes } from './callbackOfflineQueue';

vi.mock('./offlineQueue', () => ({}));
vi.mock('./callbackOfflineQueue', () => ({
  syncCallbackOutcomes: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./components/DailyRoute', () => ({
  DailyRoute: () => <div>DailyRoute Mock</div>,
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners: Record<string, ((e: Event) => void)[]> = {};
  close = vi.fn();
  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: Event) => void) {
    (this.listeners[type] ||= []).push(fn);
  }
  emit(type: string) {
    for (const fn of this.listeners[type] || []) fn(new Event(type));
  }
}

describe('Tech Portal App', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts Tech Portal, syncs offline callbacks, handles SSE and callback_sync toasts, and cleans up', async () => {
    const { unmount } = render(<App />);
    expect(screen.getByRole('heading', { name: 'Tech Portal' })).toBeInTheDocument();
    expect(await screen.findByText('DailyRoute Mock')).toBeInTheDocument();
    expect(vi.mocked(syncCallbackOutcomes)).toHaveBeenCalledTimes(1);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/api/events');

    act(() => {
      MockEventSource.instances[0].emit('job_assigned');
    });
    expect(screen.getByRole('status')).toHaveTextContent('New job assigned!');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('callback_sync', { detail: 'Callback synced.' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Callback synced.');

    unmount();
    expect(MockEventSource.instances[0].close).toHaveBeenCalledTimes(1);
  });
});
