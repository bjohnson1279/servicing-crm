import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callbackApi, CallbackHttpError, watchCallbacks } from '../callbacks/callbackApi';
import { catalogApi, CatalogError } from '../catalog/catalogApi';
import { deviceApi, DeviceError } from '../devices/deviceApi';
import { inspectionApi, InspectionError } from '../inspections/inspectionApi';
import { playbookApi, PlaybookError } from '../playbooks/playbookApi';

const jwt = (id = 'user-1', tenantId = 'tenant-1') =>
  `h.${btoa(JSON.stringify({ id, tenantId })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.s`;

describe('Tech Portal feature API clients', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  describe('callbackApi & watchCallbacks', () => {
    it('throws 401 when unauthenticated', async () => {
      await expect(callbackApi('/settings')).rejects.toMatchObject({ status: 401 });
    });

    it('caches GET responses in sessionStorage and serves cache while offline', async () => {
      sessionStorage.setItem('crm_access_token', jwt());
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [{ id: 'cb-1' }] }),
      } as Response);

      const online = await callbackApi<{ items: { id: string }[] }>('/?state=open');
      expect(online.items[0].id).toBe('cb-1');

      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      const offline = await callbackApi<{ items: { id: string }[] }>('/?state=open');
      expect(offline.items[0].id).toBe('cb-1');
    });

    it('sends POST payloads and maps non-OK responses to CallbackHttpError', async () => {
      sessionStorage.setItem('crm_access_token', jwt());
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'Version conflict' }),
      } as Response);

      await expect(callbackApi('/cb-1/outcome', { version: 1 })).rejects.toBeInstanceOf(CallbackHttpError);
      await expect(callbackApi('/cb-1/outcome', { version: 1 })).rejects.toMatchObject({
        status: 409,
        message: 'Version conflict',
      });
    });

    it('streams SSE events via watchCallbacks and triggers changed() on callbacks event', async () => {
      const changed = vi.fn();
      const ctrl = new AbortController();
      // Returns early when unauthenticated
      await watchCallbacks(ctrl.signal, changed);
      expect(changed).not.toHaveBeenCalled();

      sessionStorage.setItem('crm_access_token', jwt());
      const chunks = [
        new TextEncoder().encode('event: callbacks\ndata: {}\n\n'),
      ];
      let idx = 0;
      const releaseLock = vi.fn();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: async () => (idx < chunks.length ? { done: false, value: chunks[idx++] } : { done: true, value: undefined }),
            releaseLock,
          }),
        },
      } as unknown as Response);

      await watchCallbacks(ctrl.signal, changed);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(releaseLock).toHaveBeenCalledTimes(1);
    });
  });

  const standardClients = [
    { name: 'catalogApi', fn: catalogApi, Err: CatalogError, prefix: '/catalog' },
    { name: 'deviceApi', fn: deviceApi, Err: DeviceError, prefix: '/devices' },
    { name: 'inspectionApi', fn: inspectionApi, Err: InspectionError, prefix: '/inspections' },
    { name: 'playbookApi', fn: playbookApi, Err: PlaybookError, prefix: '/playbooks' },
  ] as const;

  for (const { name, fn, Err, prefix } of standardClients) {
    describe(name, () => {
      it('rejects with 401 when no token is present', async () => {
        await expect(fn('/settings')).rejects.toBeInstanceOf(Err);
        await expect(fn('/settings')).rejects.toMatchObject({ status: 401 });
      });

      it('returns parsed JSON on GET and POST', async () => {
        sessionStorage.setItem('crm_access_token', 'tok-1');
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as Response);

        expect(await fn('/settings')).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(prefix + '/settings'),
          expect.objectContaining({ method: 'GET' })
        );

        expect(await fn('/save', { a: 1 })).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenLastCalledWith(
          expect.stringContaining(prefix + '/save'),
          expect.objectContaining({ method: 'POST', body: JSON.stringify({ a: 1 }) })
        );
      });

      it('maps network errors to status 0', async () => {
        sessionStorage.setItem('crm_access_token', 'tok-1');
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(fn('/settings')).rejects.toMatchObject({ status: 0 });
      });

      it('rejects with 401 if session token changed mid-flight', async () => {
        sessionStorage.setItem('crm_access_token', 'tok-1');
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
          sessionStorage.setItem('crm_access_token', 'tok-2');
          return { ok: true, status: 200, json: async () => ({}) } as Response;
        });
        await expect(fn('/settings')).rejects.toMatchObject({ status: 401 });
      });

      it('maps non-OK HTTP responses to typed error with status and message', async () => {
        sessionStorage.setItem('crm_access_token', 'tok-1');
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({ error: 'Forbidden' }),
        } as Response);
        await expect(fn('/settings')).rejects.toMatchObject({ status: 403, message: 'Forbidden' });
      });

      if (name !== 'inspectionApi') {
        it('maps invalid JSON body to status 0', async () => {
          sessionStorage.setItem('crm_access_token', 'tok-1');
          vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError('bad json');
            },
          } as unknown as Response);
          await expect(fn('/settings')).rejects.toMatchObject({ status: 0 });
        });
      }
    });
  }
});
