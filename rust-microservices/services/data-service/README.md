# Data Service API

## Authenticated Endpoint

### GET /api/data

Returns mock data for authenticated users.

**Authentication:** Requires a valid JWT token in the Authorization header.

**Request:**
```bash
curl -X GET http://localhost:9000/api/data \
  -H "Authorization: Bearer <your_jwt_token>"
```

**Response (200 OK):**
```json
{
  "message": "Here is your mock data!",
  "user_email": "test@example.com",
  "data": [
    {
      "id": 1,
      "name": "Item 1",
      "description": "This is the first mock item"
    },
    {
      "id": 2,
      "name": "Item 2",
      "description": "This is the second mock item"
    },
    {
      "id": 3,
      "name": "Item 3",
      "description": "This is the third mock item"
    }
  ]
}
```

**Error Responses:**
- `401 Unauthorized`: Missing, invalid, or expired token

## Token Management

- Tokens are valid for **48 hours** (172800 seconds)
- Token validity is stored in Redis with automatic expiration
- Tokens are validated on each request by:
  1. Verifying JWT signature
  2. Checking token expiration
  3. Confirming token exists in Redis

## Getting Started

1. **Register a user:**
```bash
curl -X POST http://localhost:9000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

2. **Login to get a token:**
```bash
curl -X POST http://localhost:9000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

Response:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

3. **Use the token to access protected data:**
```bash
curl -X GET http://localhost:9000/api/data \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
```
