import type { z } from 'zod'

import type { SocialNetworkSchema, SocialPostSchema, SocialPostUpdateSchema } from '@/lib/schemas/social'

export type SocialNetwork = z.infer<typeof SocialNetworkSchema>
export type SocialPost = z.infer<typeof SocialPostSchema>
export type SocialPostUpdate = z.infer<typeof SocialPostUpdateSchema>
