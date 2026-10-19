use api::config::Config;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "info,tower_http=info".into()),
        )
        .init();

    let config = Config::from_env().unwrap_or_else(|e| fail(&e));
    let pool = api::db::connect(&config.database_url)
        .await
        .unwrap_or_else(|e| fail(&format!("Cannot open the database: {e}")));
    // `[::]` accepts IPv6 (Railway private networking) and, on Linux, IPv4 too.
    let listener = tokio::net::TcpListener::bind(("::", config.port))
        .await
        .unwrap_or_else(|e| fail(&format!("Cannot listen on port {}: {e}", config.port)));

    tracing::info!("listening on [::]:{}", config.port);
    axum::serve(listener, api::app(pool))
        .await
        .unwrap_or_else(|e| fail(&format!("Server stopped: {e}")));
}

fn fail(msg: &str) -> ! {
    eprintln!("{msg}");
    std::process::exit(1);
}
