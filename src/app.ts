import express from "express";
import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth";
import { requestLogger } from "./middleware/logger";

export const app = express();

app.set("trust proxy", true);
app.use(express.json());
app.use(requestLogger);

app.use(healthRoutes);
app.use(authRoutes);
