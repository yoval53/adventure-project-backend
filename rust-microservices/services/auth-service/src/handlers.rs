use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use redis::Commands;
use tracing::error;

use crate::{
    jwt::create_jwt,
    password::{hash_password, verify_password},
    store::{User, UserStore},
};

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub access_token: String,
}

pub async fn register(
    State(store): State<UserStore>,
    Json(req): Json<RegisterRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut users = store.users.lock().unwrap();

    if users.contains_key(&req.email) {
        return Err(StatusCode::CONFLICT);
    }

    let user = User {
        id: Uuid::new_v4(),
        email: req.email.clone(),
        password_hash: hash_password(&req.password),
    };

    users.insert(req.email, user);

    Ok(StatusCode::CREATED)
}

pub async fn login(
    State(store): State<UserStore>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, StatusCode> {
    let users = store.users.lock().unwrap();

    let user = users
        .get(&req.email)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    if !verify_password(&req.password, &user.password_hash) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let token = create_jwt(
        user.id,
        user.email.clone(),
        &store.jwt_secret,
    );

    // Store token in Redis with 48-hour expiration (172800 seconds)
    let mut conn = store.redis_client.get_connection().map_err(|e| {
        error!("Failed to get Redis connection: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let _: () = conn.set_ex(&token, "valid", 172800).map_err(|e| {
        error!("Failed to store token in Redis: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(AuthResponse {
        access_token: token,
    }))
}
