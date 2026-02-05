use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, instrument};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub exp: usize,
}

#[instrument(skip(secret), fields(user_id = %user_id, email = %email))]
pub fn create_jwt(
    user_id: Uuid,
    email: String,
    secret: &str,
) -> String {
    debug!("Creating new JWT for user.");
    let exp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("System time is before UNIX EPOCH, cannot create JWT.")
        .as_secs()
        + 3600; // 1 hour

    let claims = Claims {
        sub: user_id.to_string(),
        email,
        exp: exp as usize,
    };

    debug!(expiration = exp, "Encoding JWT claims.");
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .expect("JWT encoding failed, this is a critical error.")
}
