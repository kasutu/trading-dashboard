# Jurno auth

The auth service runs Better Auth with Postgres. Users sign up and sign in with a username and a password. There is no email in the product.

## Environment variables

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. |
| `BETTER_AUTH_SECRET` | 32 or more random bytes. Generate one with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | The public origin of the web app, for example `http://localhost:5173`. It is also the only trusted origin. |
| `PORT` | Port to listen on. Default `3001`. |

## Run

```sh
npm install
npm start
```

On start, the service creates or updates the `user`, `session`, `account` and `verification` tables. Then it listens on `PORT`.

- `GET /health` returns `{ "ok": true }`.
- `/api/auth/*` is Better Auth.

## Rules

- Username: 3 to 30 characters. Letters, digits, underscore and dot. Better Auth stores it in lower case in `user.username`. It keeps the typed form in `user.displayUsername`.
- Password: 8 characters or more.
- No email verification.

## Email

Better Auth needs an email at sign up. The client does not send one. The server fills in `<username>@users.jurno.invalid` and sets `name` to the username. Do not show the email anywhere.

## Web client

Install `better-auth` in `apps/web` and create the client once:

```ts
import { createAuthClient } from "better-auth/react"
import { usernameClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({ plugins: [usernameClient()] })
```

The client uses the page origin and the default `/api/auth` path. Do not set `baseURL`.

| Action | Call |
| --- | --- |
| Sign up | `authClient.signUp.email({ username, password, email: "", name: "" })` |
| Sign in | `authClient.signIn.username({ username, password })` |
| Sign out | `authClient.signOut()` |
| Session (hook) | `const { data, isPending } = authClient.useSession()` |
| Session (once) | `await authClient.getSession()` |

The sign up type asks for `email` and `name`. Pass empty strings. The server replaces them. Every call returns `{ data, error }`. Show `error.message` to the user. Error codes include `USERNAME_IS_ALREADY_TAKEN`, `INVALID_USERNAME`, `PASSWORD_TOO_SHORT` and `INVALID_USERNAME_OR_PASSWORD`.

A successful sign up also signs the user in. The session user has `username` and `displayUsername`.
