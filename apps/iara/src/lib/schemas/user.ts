import { z } from 'zod'

import { TimestampSchema } from './podcast'

/**
 * User roles for authorization.
 *
 * - admin: Full access, can manage podcast settings
 * - editor: Can edit videos and metadata
 * - viewer: Read-only access
 */
export const UserRoleSchema = z.enum(['admin', 'editor', 'viewer'])

/**
 * UserSchema - Full user document schema for reading from Firestore.
 *
 * Path: podcasts/{podcastId}/users/{userId}
 *
 * @see architecture-iara.md#Data Architecture
 */
export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().nullable(),
  picture: z.string().url().nullable(),
  role: UserRoleSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

/**
 * UserCreateSchema - Schema for creating a new user (without auto-generated fields).
 */
export const UserCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().nullable(),
  picture: z.string().url().nullable().optional(),
  role: UserRoleSchema.default('viewer'),
})

/**
 * UserUpdateSchema - Partial schema for updating user fields.
 * Excludes id, createdAt, updatedAt (managed by system).
 */
export const UserUpdateSchema = z.object({
  name: z.string().nullable().optional(),
  picture: z.string().url().nullable().optional(),
  role: UserRoleSchema.optional(),
})

/**
 * SaveUserInput - Input for saveOrUpdateUser function.
 * Combines user data from Google OAuth profile.
 */
export const SaveUserInputSchema = z.object({
  email: z.string().email(),
  name: z.string().nullable(),
  picture: z.string().url().nullable().optional(),
})
