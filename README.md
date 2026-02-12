# adventure-project-backend

TypeScript + Node.js + Express API server that can run locally and deploy to Vercel.

## Endpoints

- `GET /` - API index with available endpoints.
- `GET /healthz` - basic API health check.
- `GET /db/healthz` - MongoDB health check using `MONGODB_URI`.
- `POST /auth/register` - register a user and return a JWT (password must include upper/lower/number/symbol).
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
   export MONGODB_DB="adventure" # optional
   ```

3. Start server:

   ```bash
   npm run dev
   ```

## Deploy to Vercel

1. Import this repository in Vercel.
2. Set `MONGODB_URI` in Vercel project environment variables.
3. Deploy.
