//! Settings read from the environment.

pub struct Config {
    pub database_url: String,
    pub port: u16,
}

impl Config {
    /// Reads `DATABASE_URL` (required) and `PORT` (default 8080).
    pub fn from_env() -> Result<Self, String> {
        let database_url =
            std::env::var("DATABASE_URL").map_err(|_| "Set DATABASE_URL to the Postgres URL.")?;
        let port = match std::env::var("PORT") {
            Ok(p) => p
                .parse()
                .map_err(|_| format!("PORT must be a number, got \"{p}\"."))?,
            Err(_) => 8080,
        };
        Ok(Self { database_url, port })
    }
}
