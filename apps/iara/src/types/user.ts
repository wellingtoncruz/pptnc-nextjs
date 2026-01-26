import type { z } from 'zod'

import type {
  UserSchema,
  UserCreateSchema,
  UserUpdateSchema,
  UserRoleSchema,
  SaveUserInputSchema,
} from '@/lib/schemas'

/**
 * User document type inferred from Zod schema.
 *
 * @see lib/schemas/user.ts
 */
export type User = z.infer<typeof UserSchema>

/**
 * Input for creating a new user.
 */
export type UserCreate = z.infer<typeof UserCreateSchema>

/**
 * Input for updating user fields.
 */
export type UserUpdate = z.infer<typeof UserUpdateSchema>

/**
 * User role type.
 */
export type UserRole = z.infer<typeof UserRoleSchema>

/**
 * Input for saveOrUpdateUser function.
 */
export type SaveUserInput = z.infer<typeof SaveUserInputSchema>
