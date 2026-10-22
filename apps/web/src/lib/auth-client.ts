import { createAuthClient } from "better-auth/react"
import { usernameClient } from "better-auth/client/plugins"

/** Better Auth runs behind the same origin at /api/auth (see docs/architecture.md). */
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  plugins: [usernameClient()],
})

/** Better Auth needs an email at sign up, but Jurno has none, so we send a hidden placeholder.
 *  The auth service sets the same placeholder itself; its README (apps/auth) is the source of truth. */
export const placeholderEmail = (username: string) => `${username.toLowerCase()}@users.jurno.invalid`
