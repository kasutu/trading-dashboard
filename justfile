# Jurno tasks. Run `just` to list them.

set shell := ["bash", "-euo", "pipefail", "-c"]

# List the recipes
default:
    @just --list

# First run: create .env with a random secret and install the npm packages
setup:
    [ -f .env ] || { cp .env.example .env && sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$(openssl rand -base64 32)|" .env && echo "Created .env"; }
    cd apps/auth && npm install
    cd apps/web && npm install

# Start Postgres in Docker (port 5433)
db:
    docker compose up -d postgres

# Run the auth service with reload on save (port 3001)
auth:
    cd apps/auth && npm run dev

# Run the Rust API (port 8080). Run again after Rust changes.
api:
    cargo run -p api

# Run the web app with reload on save (http://localhost:5173)
web:
    cd apps/web && npm run dev

# Run Postgres, auth, API and web together. Ctrl+C stops them all.
dev: db
    #!/usr/bin/env bash
    set -euo pipefail
    [ -f .env ] || { echo "No .env file. Run: just setup"; exit 1; }
    # On Ctrl+C, or when any of the three exits, stop the others too.
    trap 'trap - INT TERM EXIT; kill 0' INT TERM EXIT
    (cd apps/auth && npm run dev) &
    cargo run -p api &
    (cd apps/web && npm run dev) &
    wait -n

# Run the web app with fake data and no backend
mock:
    cd apps/web && VITE_MOCK=1 npm run dev

# Run every service in containers (production builds)
up:
    docker compose up -d --build

# Stop the containers. Keeps the database.
down:
    docker compose down

# Stop the containers and delete the database
reset:
    docker compose down -v

# Open a psql shell on the dev database
psql:
    docker compose exec postgres psql -U jurno -d jurno

# Put a user on a plan, for testing: just plan alice espresso
plan username tier:
    [[ "{{tier}}" =~ ^(free|espresso|latte)$ ]] || { echo "Use free, espresso or latte."; exit 1; }
    docker compose exec -T postgres psql -U jurno -d jurno -c "insert into profiles (user_id, plan) select id, '{{tier}}' from \"user\" where username = lower('{{username}}') on conflict (user_id) do update set plan = excluded.plan returning plan"

# Run the Rust tests (own Postgres on port 55432) and build and lint the web app
test:
    #!/usr/bin/env bash
    set -euo pipefail
    docker run -d --rm --name jurno-test-pg -p 55432:5432 -e POSTGRES_PASSWORD=pg postgres:17 >/dev/null
    trap 'docker stop jurno-test-pg >/dev/null' EXIT
    until docker exec jurno-test-pg pg_isready -q; do sleep 1; done
    cargo test --workspace
    cd apps/web && npm run build && npm run lint

# Format and lint the Rust code (clippy and rustfmt run in Docker)
check:
    docker run --rm -v "$PWD":/w -w /w -e CARGO_TARGET_DIR=/w/target/docker rust:1 sh -c "rustup component add clippy rustfmt >/dev/null 2>&1 && cargo fmt --all && cargo clippy --workspace --all-targets -- -D warnings; chown -R $(id -u):$(id -g) /w/crates /w/target/docker"
