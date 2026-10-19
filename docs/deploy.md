# Deploy on Railway

Jurno runs as three Railway services and one Railway Postgres database. Only the web service has a public domain. Web sends `/api/auth/*` to auth and other `/api/*` to api over private networking.

Each service has a `railway.json` file. It sets the Dockerfile and the health check path.

| Service | Root directory | Config file path | Health check |
| --- | --- | --- | --- |
| `web` | `apps/web` | `/apps/web/railway.json` | `/` |
| `auth` | `apps/auth` | `/apps/auth/railway.json` | `/health` |
| `api` | (empty, the repo root) | `/crates/api/railway.json` | `/api/health` |

The api build needs the whole Cargo workspace, so its root directory is the repo root.

## Steps

### Project and database

1. In Railway, click **New Project** and choose **Empty Project**.
2. Click **Create** and choose **Database**, then **PostgreSQL**. Keep the name `Postgres`.

### Auth service

3. Click **Create**, choose **GitHub Repo** and pick the Jurno repo.
4. Open the new service. In **Settings**, rename it to `auth`.
5. In **Settings > Source**, set **Root Directory** to `apps/auth`.
6. In **Settings > Config-as-code**, set the path to `/apps/auth/railway.json`.
7. In **Variables**, add `DATABASE_URL` with the value `${{Postgres.DATABASE_URL}}`.
8. Add `BETTER_AUTH_SECRET`. Use the output of `openssl rand -base64 32`.
9. Add `BETTER_AUTH_URL` with the value `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`. This resolves once the web service has a domain (step 25).
10. Add `PORT` with the value `3001`.

### API service

11. Click **Create**, choose **GitHub Repo** and pick the Jurno repo again.
12. Rename the service to `api`.
13. Leave **Root Directory** empty.
14. In **Settings > Config-as-code**, set the path to `/crates/api/railway.json`.
15. In **Variables**, add `DATABASE_URL` with the value `${{Postgres.DATABASE_URL}}`.
16. Add `PORT` with the value `8080`.

### Web service

17. Click **Create**, choose **GitHub Repo** and pick the Jurno repo again.
18. Rename the service to `web`.
19. In **Settings > Source**, set **Root Directory** to `apps/web`.
20. In **Settings > Config-as-code**, set the path to `/apps/web/railway.json`.
21. In **Variables**, add `AUTH_UPSTREAM` with the value `${{auth.RAILWAY_PRIVATE_DOMAIN}}:${{auth.PORT}}`.
22. Add `API_UPSTREAM` with the value `${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}`.
23. Do not set `PORT` on web. Railway sets it and Caddy listens on it.

### Domain and deploy

24. Click **Deploy** to apply the staged changes.
25. Open the web service. In **Settings > Networking**, click **Generate Domain**.
26. If you use your own domain instead, set `BETTER_AUTH_URL` on auth to that origin, for example `https://jurno.app`.
27. Redeploy auth so it picks up the final `BETTER_AUTH_URL`.
28. Open the web domain. Sign up with a username and a password to check the setup.

## Notes

- Auth creates its tables on start. Api runs its own migrations. Either can start first.
- Railway private networking can use IPv6. Each service must listen on all interfaces (`::`), not only on `127.0.0.1`.
- With HTTPS, the session cookie is `__Secure-better-auth.session_token`.
- Do not generate public domains for auth or api. The browser reaches them only through web.

## Local development

1. Copy `.env.example` to `.env` and set `BETTER_AUTH_SECRET`.
2. Run `docker compose up`. This starts Postgres on port 5432, auth on 3001 and api on 8080. Set `POSTGRES_PORT` if 5432 is in use.
3. In `apps/web`, run `npm run dev`. Vite serves the app on port 5173 and proxies `/api`.
