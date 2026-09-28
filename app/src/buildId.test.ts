import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_BUILD_ID, fetchLiveBuildId, reloadIfStaleBuild } from './buildId'

describe('buildId drift check', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('exports a non-empty build id', () => {
    expect(APP_BUILD_ID.length).toBeGreaterThan(0)
  })

  it('fetchLiveBuildId reads id from build.json', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'live-build-1' }),
      })),
    )
    await expect(fetchLiveBuildId()).resolves.toBe('live-build-1')
  })

  it('reloadIfStaleBuild is a no-op when live matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: APP_BUILD_ID }),
      })),
    )
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    await expect(reloadIfStaleBuild()).resolves.toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloadIfStaleBuild clears caches and reloads on drift', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'brand-new-build' }),
      })),
    )
    const unregister = vi.fn(async () => true)
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: async () => [{ unregister }],
      },
    })
    const del = vi.fn(async () => true)
    vi.stubGlobal('caches', {
      keys: async () => ['workbox-precache-v2'],
      delete: del,
    })
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })

    await expect(reloadIfStaleBuild()).resolves.toBe(true)
    expect(unregister).toHaveBeenCalled()
    expect(del).toHaveBeenCalledWith('workbox-precache-v2')
    expect(reload).toHaveBeenCalled()
  })
})
