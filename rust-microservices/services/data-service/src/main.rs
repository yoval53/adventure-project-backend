use axum::{routing::get, Router};
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tracing::info;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let app = Router::new().nest(
        "/api",
        Router::new().route("/health", get(|| async { "OK from data-service" })),
    );

    let addr = SocketAddr::from(([0, 0, 0, 0], 8081));
    info!("🚀 Data Service listening on {}", addr);
    let listener = TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}