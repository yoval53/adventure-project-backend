use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;
use redis::Client as RedisClient;

#[derive(Clone, Debug)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
}

#[derive(Clone)]
pub struct UserStore {
    pub users: Arc<Mutex<HashMap<String, User>>>,
    pub jwt_secret: String,
    pub redis_client: RedisClient,
}

impl UserStore {
    pub fn new(jwt_secret: String, redis_client: RedisClient) -> Self {
        Self {
            users: Arc::new(Mutex::new(HashMap::new())),
            jwt_secret,
            redis_client,
        }
    }
}