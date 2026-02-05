use axum::{routing::post, Router};
use dotenvy::dotenv;
use std::{env, net::SocketAddr};
use tokio::net::TcpListener;
use tracing::{info, error};
use tracing_subscriber::EnvFilter;

mod handlers;
mod jwt;
mod password;
mod store;

use handlers::{login, register};
use store::UserStore;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    info!("🚀 Starting auth-service...");
    dotenv().ok();

    let jwt_secret = match env::var("JWT_SECRET") {
        Ok(secret) => {
            info!("✓ JWT_SECRET loaded.");
            secret
        }
        Err(e) => {
            error!("❌ JWT_SECRET environment variable not found: {}", e);
            panic!("JWT_SECRET must be set");
        }
    };

    info!("Creating UserStore...");
    let store = UserStore::new(jwt_secret);
    info!("✓ UserStore created.");

    let app = Router::new()
        .nest(
            "/api",
            Router::new()
                .route("/register", post(register))
                .route("/login", post(login)),
        )
        .with_state(store);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("Binding to {}...", addr);
    let listener = TcpListener::bind(&addr).await.unwrap_or_else(|e| {
        error!("❌ Failed to bind to {}: {}", addr, e);
        panic!("Cannot bind to port 8080: {}", e);
    });

    info!("🎉 Auth service listening on {}", addr);
    if let Err(e) = axum::serve(listener, app).await {
        error!("Server error: {}", e);
    }
}