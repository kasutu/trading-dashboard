use api::config::Config;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    // Local development: read the repo's .env if there is one. Containers set real env vars.
    dotenvy::dotenv().ok();
    let args: Vec<String> = std::env::args().skip(1).collect();
    // Admin commands print their own output, so only log problems.
    let default_log = if args.is_empty() {
        "info,tower_http=info"
    } else {
        "error"
    };
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| default_log.into()))
        .init();

    if matches!(
        args.first().map(String::as_str),
        Some("help" | "-h" | "--help")
    ) {
        println!("{}", api::admin::USAGE);
        return;
    }

    let config = Config::from_env().unwrap_or_else(|e| fail(&e));
    let pool = api::db::connect(&config.database_url)
        .await
        .unwrap_or_else(|e| fail(&format!("Cannot open the database: {e}")));

    // Any argument means an admin command (api users, api plan ..., api owner ...).
    if !args.is_empty() {
        match api::admin::run(&pool, &args).await {
            Ok(out) => println!("{out}"),
            Err(msg) => fail(&msg),
        }
        return;
    }
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
