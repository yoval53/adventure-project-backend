use axum::{
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::{env, net::SocketAddr};
use tokio::net::TcpListener;
use tracing::{debug, error, info};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Note: We nest under /api because the API Gateway adds /api back to the path
    let app = Router::new().nest("/api", Router::new()
        .route("/health", get(|| async { "OK from test-service" }))
        .route("/is-logged-in", get(check_login))
    );

    let addr = SocketAddr::from(([0, 0, 0, 0], 8082));
    info!("🚀 test-service listening on {}", addr);
    let listener = TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    email: String,
    exp: usize,
}

#[derive(Serialize)]
struct LoginStatus {
    is_logged_in: bool,
    user: Option<String>,
}

async fn check_login(headers: HeaderMap) -> Json<LoginStatus> {
    debug!("Processing login check request");
    let auth_header = headers.get("Authorization");
    
    let token = match auth_header {
        Some(value) => {
            let s = value.to_str().unwrap_or("");
            if s.starts_with("Bearer ") {
                &s[7..]
            } else {
                ""
            }
        }
        None => "",
    };

    if token.is_empty() {
        return Json(LoginStatus { is_logged_in: false, user: None });
    }

    let secret = env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret".to_string());
    
    match decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    ) {
        Ok(token_data) => Json(LoginStatus {
            is_logged_in: true,
            user: Some(token_data.claims.email),
        }),
        Err(e) => {
            error!("Token validation failed: {}", e);
            Json(LoginStatus { is_logged_in: false, user: None })
        },
    }
}