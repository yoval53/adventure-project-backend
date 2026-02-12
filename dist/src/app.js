"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const db_1 = require("./db");
exports.app = (0, express_1.default)();
exports.app.get("/", (_req, res) => {
    res.status(200).json({
        ok: true,
        service: "api",
        endpoints: ["/healthz", "/db/healthz"],
    });
});
exports.app.get("/favicon.ico", (_req, res) => {
    res.status(204).end();
});
exports.app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true, service: "api", uptime: process.uptime() });
});
exports.app.get("/db/healthz", async (_req, res) => {
    try {
        await (0, db_1.checkMongoHealth)();
        res.status(200).json({ ok: true, db: "mongodb" });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(503).json({ ok: false, db: "mongodb", error: message });
    }
});
