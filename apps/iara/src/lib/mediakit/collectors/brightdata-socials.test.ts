import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadMediakit = vi.fn()
vi.mock('@/lib/firebase/mediakit-admin', () => ({
  readMediakit: () => mockReadMediakit(),
}))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { brightdataSocialsAdapter, BrightdataSocialsError } from './brightdata-socials'

/** Stub of the /trigger → /progress → /snapshot flow; each network's record
 * (or trigger failure) is configured per key. */
function stubBrightdata(records: {
  instagram?: Response | Record<string, unknown>
  linkedin?: Response | Record<string, unknown>
  tiktok?: Response | Record<string, unknown>
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/trigger')) {
        const body = String(init?.body ?? '')
        const network = body.includes('tiktok.com')
          ? 'tiktok'
          : body.includes('instagram.com')
            ? 'instagram'
            : 'linkedin'
        const record = records[network as keyof typeof records]
        if (record instanceof Response) return record // trigger-level failure
        return new Response(JSON.stringify({ snapshot_id: `sd_${network}` }))
      }
      if (url.includes('/progress/')) {
        return new Response(JSON.stringify({ status: 'ready' }))
      }
      if (url.includes('/snapshot/')) {
        const network = url.match(/sd_(\w+)\?/)?.[1] as keyof typeof records
        return new Response(JSON.stringify([records[network] ?? {}]))
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
  it('collects records via trigger→poll→snapshot; tiktok skipped without URL', async () => {
    stubBrightdata({
      linkedin: { name: 'PPT', followers: 3262 },
      instagram: { account: 'pptnaocompila', followers: 1251 },
    })

    const writes = await brightdataSocialsAdapter.collect()
    expect(writes).toEqual([
      { section: 'audience', partial: { followers: { instagram: 1251, linkedin: 3262 } } },
    ])
  })

  it('one network failing (dead_page) never blocks the others', async () => {
    process.env.MEDIAKIT_TIKTOK_URL = 'https://www.tiktok.com/@x'
    stubBrightdata({
      tiktok: { error: "Couldn't find this account", error_code: 'dead_page' },
      linkedin: { followers: 3262 },
      instagram: { followers: 1251 },
    })

    const writes = await brightdataSocialsAdapter.collect()
    const followers = (writes[0].partial as { followers: Record<string, number> }).followers
    expect(followers).toEqual({ instagram: 1251, linkedin: 3262 })
  })

  it('null followers (lesson_brightdata_null_fields) fails that network only', async () => {
    stubBrightdata({
      instagram: { followers: null },
      linkedin: { followers: 3262 },
    })

    const writes = await brightdataSocialsAdapter.collect()
    const followers = (writes[0].partial as { followers: Record<string, number> }).followers
    expect(followers).toEqual({ linkedin: 3262 })
  })

  it('throws only when EVERY configured network fails', async () => {
    stubBrightdata({
      instagram: new Response('{}', { status: 500 }),
      linkedin: new Response('{}', { status: 500 }),
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
