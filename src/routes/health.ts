import { Router, type Request, type Response } from "express";
import { checkMongoHealth, isTlsError } from "../db";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  console.log("[GET /] Serving API index");
  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Adventure API</title></head>
<body>
  <h1>Adventure API</h1>
  <p>Available endpoints:</p>
  <ul>
    <li><a href="/healthz">/healthz</a></li>
    <li><a href="/db/healthz">/db/healthz</a></li>
    <li>/auth/register</li>
    <li>/auth/login</li>
    <li>/auth/me</li>
  </ul>
</body>
</html>`);
});

router.get("/favicon.ico", (_req: Request, res: Response) => {
  res.status(204).end();
});

router.get("/healthz", (_req: Request, res: Response) => {
  console.log("[GET /healthz] Health check requested");
  res.status(200).json({ ok: true, service: "api", uptime: process.uptime() });
});

router.get("/db/healthz", async (_req: Request, res: Response) => {
  console.log("[GET /db/healthz] DB health check requested");
  try {
    await checkMongoHealth();
    console.log("[GET /db/healthz] DB health check passed");
    res.status(200).json({ ok: true, db: "mongodb" });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const code = (err as NodeJS.ErrnoException).code ?? undefined;
    const tlsError = isTlsError(err.message);

    console.error("[GET /db/healthz] DB health check failed:", {
      name: err.name,
      message: err.message,
      code,
      isTlsError: tlsError,
      stack: err.stack,
    });

    const body: Record<string, unknown> = {
      ok: false,
      db: "mongodb",
      error: err.message,
    };

    if (code) {
      body.code = code;
    }

    if (tlsError) {
      body.hint =
        "TLS/SSL error — check MONGODB_TLS_ALLOW_INVALID_CERTIFICATES, MONGODB_TLS_ALLOW_INVALID_HOSTNAMES, and MONGODB_TLS_CA_FILE env vars";
    }

    res.status(503).json(body);
  }
});

export default router;
