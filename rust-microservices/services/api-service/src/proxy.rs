use axum::{
    body::{self, Body},
    extract::{OriginalUri, State},
    http::{Request, Response, StatusCode, Uri},
    response::IntoResponse,
};
use reqwest::Client;

use crate::AppState;

pub async fn proxy_request(
    State(state): State<AppState>,
    OriginalUri(uri): OriginalUri,
    req: Request<Body>,
) -> impl IntoResponse {
    let path = uri.path();
    tracing::debug!(?path, "Proxying request");

    let (base_url, service_path) = if path.starts_with("/api/auth/") {
        (&state.auth_base_url, path.strip_prefix("/api/auth").unwrap())
    } else if path.starts_with("/api/data/") {
        (&state.data_base_url, path.strip_prefix("/api/data").unwrap())
    } else if path.starts_with("/api/test/") {
        (&state.test_base_url, path.strip_prefix("/api/test").unwrap())
    } else {
        tracing::warn!(?path, "No proxy route matched");
        return Err(StatusCode::NOT_FOUND);
    };

    // Reconstruct the path for the downstream service, e.g., /api/register
    let rewritten_path = format!("/api{}", service_path);
    let target_url = format!("{}{}", base_url, rewritten_path);
    tracing::debug!(%target_url, "Forwarding to");

    let client = Client::new();

    let method = req.method().clone();
    let headers = req.headers().clone();

    let body_bytes = match body::to_bytes(req.into_body(), usize::MAX).await {
        Ok(bytes) => bytes,
        Err(_) => return Err(StatusCode::BAD_REQUEST),
    };

    let request_builder = client
        .request(method, &target_url)
        .headers(headers)
        .body(body_bytes);

    let response = match request_builder.send().await {
        Ok(res) => res,
        Err(e) => {
            tracing::error!("Failed to send request to {}: {}", target_url, e);
            return Err(StatusCode::BAD_GATEWAY);
        }
    };

    let status = response.status();
    let headers = response.headers().clone();
    let bytes = match response.bytes().await {
        Ok(bytes) => bytes,
        Err(e) => {
            tracing::error!("Failed to read response body from {}: {}", target_url, e);
            return Err(StatusCode::BAD_GATEWAY);
        }
    };

    let mut builder = Response::builder().status(status);

    // Copy headers from the response to the new response
    for (key, value) in headers.iter() {
        builder = builder.header(key, value);
    }

    match builder.body(Body::from(bytes)) {
        Ok(res) => Ok(res),
        Err(e) => {
            tracing::error!("Failed to build response: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}
