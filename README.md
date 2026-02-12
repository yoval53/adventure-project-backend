# adventure-project-backend

TypeScript + Node.js + Express API server that can run locally and deploy to Vercel.

## Endpoints

- `GET /` - API index with available endpoints.
- `GET /healthz` - basic API health check.
- `GET /db/healthz` - MongoDB health check using `MONGODB_URI`.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set environment variable:

   ```bash
   export MONGODB_URI="mongodb+srv://..."
   ```

3. Start server:

   ```bash
   npm run dev
   ```

## Deploy to Vercel

1. Import this repository in Vercel.
2. Set `MONGODB_URI` in Vercel project environment variables.
3. Deploy.
