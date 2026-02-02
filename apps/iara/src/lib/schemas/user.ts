import { z } from 'zod'

import { TimestampSchema } from './podcast'

/**
 * User roles for authorization.
 *
 * - admin: Full access, can manage podcast settings and users
 * - user: Standard access, can view and edit videos
 *
 * Note: Admin is set manually in Firestore. New users get 'user' role by default.
 */
export const UserRoleSchema = z.enum(['admin', 'user'])

/**
 * UserSchema - Full user document schema for reading from Firestore.
 *
 * Path: podcasts/{podcastId}/users/{oderId}
 * where oderId is the OAuth provider user ID (Google User ID)
 *
 * Note: Some fields are optional with defaults to support legacy users
 * that may have been created before all fields were required.
 *
 * @see architecture-iara.md#Data Architecture
 * @see docs/stories/8-1-modelo-roles-permissoes.md
 */
export const UserSchema = z.object({
  id: z.string().min(1), // Same as oderId (OAuth user ID)
  email: z.string().email(),
  name: z.string().nullable().optional().default(null), // Optional for legacy users
  picture: z.string().nullable().optional(), // Optional, any string (not validated as URL for legacy)
  role: UserRoleSchema.default('user'), // Default for legacy users without role
  lastAccessAt: TimestampSchema.optional(), // Optional for legacy users
  createdAt: TimestampSchema.optional(), // Optional for legacy users
  updatedAt: TimestampSchema.optional(), // Optional for legacy users
  deleted: z.boolean().default(false), // Soft delete flag
})

/**
 * UserCreateSchema - Schema for creating a new user (without auto-generated fields).
 */
export const UserCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().nullable(),
  picture: z.string().url().nullable().optional(),
  role: UserRoleSchema.default('user'),
})

/**
 * UserUpdateSchema - Partial schema for updating user fields.
 * Excludes id, createdAt, updatedAt (managed by system).
 */
export const UserUpdateSchema = z.object({
  name: z.string().nullable().optional(),
  picture: z.string().url().nullable().optional(),
  role: UserRoleSchema.optional(),
  lastAccessAt: TimestampSchema.optional(),
  deleted: z.boolean().optional(),
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
