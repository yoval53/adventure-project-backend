use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use redis::{Client as RedisClient, Commands};
use serde::{Deserialize, Serialize};
use std::{env, net::SocketAddr, sync::Arc};
use tokio::net::TcpListener;
use tracing::{error, info};

#[derive(Clone)]
struct AppState {
    redis_client: RedisClient,
    jwt_secret: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    email: String,
    exp: usize,
}

#[derive(Serialize)]
struct MockData {
    message: String,
    user_email: String,
    data: Vec<MockItem>,
}

#[derive(Serialize)]
struct MockItem {
    id: i32,
    name: String,
    description: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    info!("🚀 Starting data-service...");

    let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret".to_string());
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://redis:6379".to_string());

    info!("Connecting to Redis at {}...", redis_url);
    let redis_client = RedisClient::open(redis_url).unwrap_or_else(|e| {
        error!("❌ Failed to create Redis client: {}", e);
        panic!("Cannot create Redis client: {}", e);
    });
    info!("✓ Redis client created.");

    let state = Arc::new(AppState {
        redis_client,
        jwt_secret,
    });

    let app = Router::new().nest(
        "/api",
        Router::new()
            .route("/health", get(|| async { "OK from data-service" }))
            .route("/data", get(get_data)),
    )
    .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8081));
    info!("🚀 Data Service listening on {}", addr);
    let listener = TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn get_data(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<MockData>, StatusCode> {
    // Extract token from Authorization header
    let auth_header = headers
        .get("Authorization")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .to_str()
        .map_err(|_| StatusCode::UNAUTHORIZED)?
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    // Validate JWT signature
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|e| {
        error!("JWT validation failed: {}", e);
        StatusCode::UNAUTHORIZED
    })?;

    // Check if token exists in Redis (valid and not expired)
    let mut conn = state.redis_client.get_connection().map_err(|e| {
        error!("Failed to get Redis connection: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let exists: bool = conn.exists(token).map_err(|e| {
        error!("Failed to check token in Redis: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    if !exists {
        error!("Token not found in Redis or expired");
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Return mock data
    let mock_data = MockData {
        message: "Here is your mock data!".to_string(),
        user_email: token_data.claims.email,
        data: vec![
            MockItem {
                id: 1,
                name: "Item 1".to_string(),
                description: "This is the first mock item".to_string(),
            },
            MockItem {
                id: 2,
                name: "Item 2".to_string(),
                description: "This is the second mock item".to_string(),
            },
            MockItem {
                id: 3,
                name: "Item 3".to_string(),
                description: "This is the third mock item".to_string(),
            },
        ],
    };

    Ok(Json(mock_data))
}