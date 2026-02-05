use axum::{routing::any, Router};
use dotenvy::dotenv;
use std::{env, net::SocketAddr};
use tokio::net::TcpListener;

mod proxy;
use proxy::proxy_request;

#[derive(Clone)]
struct AppState {
    auth_base_url: String,
    data_base_url: String,
    test_base_url: String,
}

#[tokio::main]
async fn main() {
    dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Docker Compose service name instead of localhost
    let auth_base_url =
        env::var("AUTH_SERVICE_URL").unwrap_or_else(|_| "http://auth-service:8080".into());
    let data_base_url =
        env::var("DATA_SERVICE_URL").unwrap_or_else(|_| "http://data-service:8081".into());
    let test_base_url =
        env::var("TEST_SERVICE_URL").unwrap_or_else(|_| "http://test-service:8082".into());

    let state = AppState {
        auth_base_url,
        data_base_url,
        test_base_url,
    };

    let app = Router::new()
        .route("/api/auth/*path", any(proxy_request))
        .route("/api/data/*path", any(proxy_request))
        .route("/api/test/*path", any(proxy_request))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 9000)); // match Docker EXPOSE
    tracing::info!("api-service running on {}", addr);
    let listener = TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
