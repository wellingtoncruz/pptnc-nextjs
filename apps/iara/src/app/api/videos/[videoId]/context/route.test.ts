import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/firebase/config', () => ({ PODCAST_ID: 'trendsnews' }))
vi.mock('@/lib/firebase/videos-admin', () => ({ getVideoAdmin: vi.fn(), updateVideoAdmin: vi.fn() }))
vi.mock('@/lib/firebase/podcasts-admin', () => ({ getPodcastAdmin: vi.fn() }))
vi.mock('@/lib/logger', () => ({ log: vi.fn() }))

import { auth } from '@/lib/auth'
import { getPodcastAdmin } from '@/lib/firebase/podcasts-admin'
import { getVideoAdmin, updateVideoAdmin } from '@/lib/firebase/videos-admin'

import { PUT } from './route'

const guest = (i: number) => ({ name: `G${i}`, role: 'R', company: 'C', linkedin: `https://linkedin.com/in/g${i}` })
const guests = (n: number) => Array.from({ length: n }, (_, i) => guest(i))
const req = (body: unknown) =>
  new NextRequest('http://localhost/api/videos/v1/context', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const ctx = { params: Promise.resolve({ videoId: 'v1' }) }

// out/2026 — máximo de convidados do podcast, co-host incluído (guests já traz o co-host em [0]).
describe('PUT /api/videos/[videoId]/context — máximo de convidados', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
    vi.mocked(updateVideoAdmin).mockResolvedValue(undefined as never)
  })

  it('aceita até o limite do podcast', async () => {
    vi.mocked(getPodcastAdmin).mockResolvedValue({ maxGuests: 6 } as never)
    vi.mocked(getVideoAdmin).mockResolvedValue({ id: 'v1', guests: [] } as never)
    expect((await PUT(req({ theme: 'T', guests: guests(6) }), ctx)).status).toBe(200)
  })

  it('recusa crescer além do limite (400 TOO_MANY_GUESTS) e não grava', async () => {
    vi.mocked(getPodcastAdmin).mockResolvedValue({ maxGuests: 6 } as never)
    vi.mocked(getVideoAdmin).mockResolvedValue({ id: 'v1', guests: [] } as never)
    const res = await PUT(req({ theme: 'T', guests: guests(7) }), ctx)
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('TOO_MANY_GUESTS')
    expect(updateVideoAdmin).not.toHaveBeenCalled()
  })

  it('sem o campo no podcast vale o padrão 4 (PPTNC)', async () => {
    vi.mocked(getPodcastAdmin).mockResolvedValue({} as never)
    vi.mocked(getVideoAdmin).mockResolvedValue({ id: 'v1', guests: [] } as never)
    expect((await PUT(req({ theme: 'T', guests: guests(5) }), ctx)).status).toBe(400)
  })

  it('limite reduzido depois: episódio com mais convidados continua salvando', async () => {
    vi.mocked(getPodcastAdmin).mockResolvedValue({ maxGuests: 4 } as never)
    vi.mocked(getVideoAdmin).mockResolvedValue({ id: 'v1', guests: guests(6) } as never)
    expect((await PUT(req({ theme: 'T', guests: guests(6) }), ctx)).status).toBe(200)
    expect((await PUT(req({ theme: 'T', guests: guests(7) }), ctx)).status).toBe(400)
  })
})
