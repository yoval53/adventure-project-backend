import { Router, type Request, type Response } from "express";
import { checkMongoHealth } from "../db";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  console.log("[GET /] Serving API index");
  res.status(200).json({
    ok: true,
    service: "api",
    endpoints: ["/healthz", "/db/healthz", "/auth/register", "/auth/login", "/auth/me"],
  });
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
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[GET /db/healthz] DB health check failed:", message);
    res.status(503).json({ ok: false, db: "mongodb", error: message });
  }
});

export default router;
