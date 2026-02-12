# adventure-project-backend

TypeScript + Node.js + Express API server that can run locally and deploy to Vercel.

## Endpoints

- `GET /` - API index with available endpoints.
- `GET /healthz` - basic API health check.
- `GET /db/healthz` - MongoDB health check using `MONGODB_URI`.
- `POST /auth/register` - register a user and return a JWT (password requirements configurable, defaults to 8+ chars with upper/lower/number/symbol).
- `POST /auth/login` - login and return a JWT.
- `GET /auth/me` - return the authenticated user (Bearer token required).

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set environment variable:

   ```bash
   export MONGODB_URI="mongodb+srv://..."
   export JWT_SECRET="your-secret"
   export JWT_EXPIRES_IN="1h" # optional
   export MONGODB_DB="adventure" # optional
   export AUTH_RATE_LIMIT_WINDOW_MS="60000" # optional
   export AUTH_RATE_LIMIT_MAX="20" # optional
   export PASSWORD_MIN_LENGTH="8" # optional
   ```

   Optional TLS settings when connecting through private/self-signed infrastructure:

   ```bash
   export MONGODB_TLS_CA_FILE="/path/to/ca.pem"
   export MONGODB_TLS_ALLOW_INVALID_CERTIFICATES="false"
   export MONGODB_TLS_ALLOW_INVALID_HOSTNAMES="false"
   ```

   > `MONGODB_TLS_ALLOW_INVALID_CERTIFICATES` / `MONGODB_TLS_ALLOW_INVALID_HOSTNAMES`
   > should only be enabled temporarily for debugging certificate issues.

3. Start server:

   ```bash
   npm run dev
   ```

## Deploy to Vercel

1. Import this repository in Vercel.
2. Set `MONGODB_URI` in Vercel project environment variables.
3. Deploy.
