# Deploy on Railway

Jurno runs as three Railway services and one Railway Postgres database. Only the web service has a public domain. Web sends `/api/auth/*` to auth and other `/api/*` to api over private networking.

Live: project `jurno` in the Splitscale workspace, at https://jurno.up.railway.app. It deploys from `main`.

Each service has these settings in Railway (Settings): root directory, Dockerfile path, watch paths and health check path. The `railway.json` files in the repo record the same values. Railway has deprecated `railway.json` (config as code), so do not rely on it. Set the values in the service settings, as below. A push rebuilds only the services whose files changed.

| Service | Root directory | Dockerfile path | Watch paths | Health check |
| --- | --- | --- | --- | --- |
| `web` | `/apps/web` | `Dockerfile` | `/apps/web/**` | `/` |
| `auth` | `/apps/auth` | `Dockerfile` | `/apps/auth/**` | `/health` |
| `api` | (empty) | `crates/api/Dockerfile` | `/crates/**`, `/Cargo.toml`, `/Cargo.lock` | `/api/health` |

## Before you start

You set these values by hand. Railway fills in the rest with references.

| Value | Where | How to get it |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | auth | `openssl rand -base64 32`. Keep it secret. Changing it signs everyone out. |
| `BETTER_AUTH_URL` | auth | The public web address, for example `https://jurno.up.railway.app` |

Deploy from the `main` branch.


The api build needs the whole Cargo workspace, so its root directory is the repo root.

## Steps

### Project and database

1. In Railway, click **New Project** and choose **Empty Project**.
2. Click **Create** and choose **Database**, then **PostgreSQL**. Keep the name `Postgres`.

### Auth service

3. Click **Create**, choose **GitHub Repo** and pick the Jurno repo.
4. Open the new service. In **Settings**, rename it to `auth`.
5. In **Settings > Source**, set **Root Directory** to `apps/auth`.
6. In **Settings**, set the Dockerfile path, watch paths and health check from the table above.
7. In **Variables**, add `DATABASE_URL` with the value `${{Postgres.DATABASE_URL}}`.
8. Add `BETTER_AUTH_SECRET`. Use the output of `openssl rand -base64 32`.
9. Add `BETTER_AUTH_URL` with the value `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`. This resolves once the web service has a domain (step 25).
10. Add `PORT` with the value `3001`.

### API service

11. Click **Create**, choose **GitHub Repo** and pick the Jurno repo again.
12. Rename the service to `api`.
13. Leave **Root Directory** empty.
14. In **Settings**, set the Dockerfile path, watch paths and health check from the table above.
15. In **Variables**, add `DATABASE_URL` with the value `${{Postgres.DATABASE_URL}}`.
16. Add `PORT` with the value `8080`.

### Web service

17. Click **Create**, choose **GitHub Repo** and pick the Jurno repo again.
18. Rename the service to `web`.
19. In **Settings > Source**, set **Root Directory** to `apps/web`.
20. In **Settings**, set the Dockerfile path, watch paths and health check from the table above.
21. In **Variables**, add `AUTH_UPSTREAM` with the value `${{auth.RAILWAY_PRIVATE_DOMAIN}}:${{auth.PORT}}`.
22. Add `API_UPSTREAM` with the value `${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}`.
23. Do not set `PORT` on web. Railway sets it and Caddy listens on it.

### Domain and deploy

24. Click **Deploy** to apply the staged changes.
25. Open the web service. In **Settings > Networking**, click **Generate Domain**.
26. If you use your own domain instead, set `BETTER_AUTH_URL` on auth to that origin, for example `https://jurno.app`.
27. Redeploy auth so it picks up the final `BETTER_AUTH_URL`.
28. Open the web domain. Sign up with a username and a password to check the setup.

### Make yourself the owner

29. Install the Railway CLI and link the project (see [Admin commands](#admin-commands)).
30. Run `railway ssh --service api -- make owner NAME=<your username>`.
31. Reload the page. Every tab is open and there is no account limit.

## Notes

- Auth creates its tables on start. Api runs its own migrations. Either can start first.
- Railway private networking can use IPv6. Each service must listen on all interfaces (`::`), not only on `127.0.0.1`.
- With HTTPS, the session cookie is `__Secure-better-auth.session_token`.
- Do not generate public domains for auth or api. The browser reaches them only through web.
- After you change the web domain, redeploy auth: `railway redeploy --service auth`. Auth reads `BETTER_AUTH_URL` only at start. Until then, sign-up and sign-in fail with "Invalid origin".

## Local development

See the README: `just setup` once, then `just dev`. Local Postgres uses port 5433.

## Admin commands

The `api` service has commands to manage users and plans. Run them inside the running container.

1. Install the Railway CLI and sign in: `npm i -g @railway/cli`, then `railway login`.
2. In the repo folder, link the project: `railway link`.
3. Open a shell in the api container: `railway ssh --service api`. The shell starts in `/app`.
4. Run a command:

| Command | What it does |
| --- | --- |
| `make users` | List users with their plan, trading accounts and trades |
| `make owner NAME=kasutu` | Give a user the owner plan: everything, no account limit |
| `make plan NAME=alice PLAN=espresso` | Put a user on a plan: `free`, `espresso`, `latte` or `owner` |
| `make delete NAME=alice` | Delete a user and all their data. This cannot be undone. |
| `make help` | Show every command |

To run one command without opening a shell: `railway ssh --service api -- make users`.

The same commands run as `api users`, `api owner <username>` and `api plan <username> <plan>`. Locally, use `just users`, `just owner <username>` and `just plan <username> <plan>`.

A user must sign up before you can change their plan. The change shows on their next page load.
