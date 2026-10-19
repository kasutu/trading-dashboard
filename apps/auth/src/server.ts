import { createServer } from "node:http"
import { betterAuth, type BetterAuthOptions } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"
import { getMigrations } from "better-auth/db/migration"
import { toNodeHandler } from "better-auth/node"
import { username } from "better-auth/plugins"
import { Pool } from "pg"

const baseURL = process.env.BETTER_AUTH_URL

const options = {
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  trustedOrigins: baseURL ? [baseURL] : [],
  emailAndPassword: { enabled: true, minPasswordLength: 8, requireEmailVerification: false },
  // Defaults: 3 to 30 characters, letters, digits, underscore and dot.
  plugins: [username()],
  hooks: {
    // Jurno has no email. Better Auth still needs one at sign up, so the server
    // fills in a hidden placeholder made from the username. The name defaults to the username.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email" || typeof ctx.body?.username !== "string") return
      const name: string = ctx.body.username
      return {
        context: {
          ...ctx,
          body: { ...ctx.body, email: `${name.toLowerCase()}@users.jurno.invalid`, name: ctx.body.name || name },
        },
      }
    }),
  },
} satisfies BetterAuthOptions

// Create or update the user, session, account and verification tables before serving.
const { runMigrations } = await getMigrations(options)
await runMigrations()

const auth = betterAuth(options)

const authHandler = toNodeHandler(auth)
const port = Number(process.env.PORT ?? 3001)

createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}')
    return
  }
  if (req.url?.startsWith("/api/auth/")) return void authHandler(req, res)
  res.writeHead(404).end()
}).listen(port, () => console.log(`auth listening on ${port}`))
