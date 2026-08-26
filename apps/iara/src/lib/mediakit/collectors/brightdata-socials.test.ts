import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadMediakit = vi.fn()
vi.mock('@/lib/firebase/mediakit-admin', () => ({
  readMediakit: () => mockReadMediakit(),
}))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { brightdataSocialsAdapter, BrightdataSocialsError } from './brightdata-socials'

function stubBrightdata(handlers: {
  instagram?: () => Response
  linkedin?: () => Response
  tiktok?: () => Response
  snapshot?: () => Response
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/scrape')) {
        const body = String(init?.body ?? '')
        if (body.includes('tiktok.com')) return handlers.tiktok?.() ?? new Response('{}')
        if (body.includes('instagram.com')) return handlers.instagram?.() ?? new Response('{}')
        return handlers.linkedin?.() ?? new Response('{}')
      }
      if (url.includes('/progress/')) {
        return new Response(JSON.stringify({ status: 'ready' }))
      }
      if (url.includes('/snapshot/')) {
        return handlers.snapshot?.() ?? new Response('[]')
      }
      throw new Error(`unexpected url: ${url}`)
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  process.env.BRIGHTDATA_API_KEY = 'bd-key'
  delete process.env.MEDIAKIT_TIKTOK_URL
  delete process.env.MEDIAKIT_SOCIALS_MAX_AGE_DAYS
  mockReadMediakit.mockResolvedValue({ audience: null })
})

describe('brightdataSocialsAdapter', () => {
  it('collects sync (linkedin) and snapshot (instagram) records; tiktok skipped without URL', async () => {
    stubBrightdata({
      linkedin: () => new Response(JSON.stringify({ name: 'PPT', followers: 3262 })),
      instagram: () => new Response(JSON.stringify({ snapshot_id: 'sd_1' })),
      snapshot: () => new Response(JSON.stringify([{ account: 'pptnaocompila', followers: 1251 }])),
    })

    const writes = await brightdataSocialsAdapter.collect()
    expect(writes).toEqual([
      { section: 'audience', partial: { followers: { instagram: 1251, linkedin: 3262 } } },
    ])
  })

  it('one network failing (dead_page) never blocks the others', async () => {
    process.env.MEDIAKIT_TIKTOK_URL = 'https://www.tiktok.com/@x'
    stubBrightdata({
      tiktok: () =>
        new Response(JSON.stringify({ error: "Couldn't find this account", error_code: 'dead_page' })),
      linkedin: () => new Response(JSON.stringify({ followers: 3262 })),
      instagram: () => new Response(JSON.stringify({ followers: 1251 })),
    })

    const writes = await brightdataSocialsAdapter.collect()
    const followers = (writes[0].partial as { followers: Record<string, number> }).followers
    expect(followers).toEqual({ instagram: 1251, linkedin: 3262 })
  })

  it('null followers (lesson_brightdata_null_fields) fails that network only', async () => {
    stubBrightdata({
      instagram: () => new Response(JSON.stringify({ followers: null })),
      linkedin: () => new Response(JSON.stringify({ followers: 3262 })),
    })

    const writes = await brightdataSocialsAdapter.collect()
    const followers = (writes[0].partial as { followers: Record<string, number> }).followers
    expect(followers).toEqual({ linkedin: 3262 })
  })

  it('throws only when EVERY configured network fails', async () => {
    stubBrightdata({
      instagram: () => new Response('{}', { status: 500 }),
      linkedin: () => new Response('{}', { status: 500 }),
    })
    await expect(brightdataSocialsAdapter.collect()).rejects.toThrow(BrightdataSocialsError)
  })

  it('freshness guard: recent successful run skips the scrape entirely (cost)', async () => {
    mockReadMediakit.mockResolvedValue({
      audience: {
        sources: {
          'brightdata-socials': { updatedAt: { toDate: () => new Date(Date.now() - 86_400_000) } },
        },
      },
    })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const writes = await brightdataSocialsAdapter.collect()
    expect(writes).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('missing API key fails with a clear config error', async () => {
    delete process.env.BRIGHTDATA_API_KEY
    await expect(brightdataSocialsAdapter.collect()).rejects.toThrow(/BRIGHTDATA_API_KEY/)
  })
})
