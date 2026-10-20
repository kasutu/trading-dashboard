# Build context: the repo root.
FROM rust:1-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release -p api

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates make && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/api /usr/local/bin/api
# Admin commands: `api help`, or `make help` from /app (see crates/api/Makefile)
WORKDIR /app
COPY crates/api/Makefile /app/Makefile
EXPOSE 8080
CMD ["api"]
