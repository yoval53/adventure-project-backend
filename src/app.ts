import express from "express";
import healthRoutes from "./routes/health";
import authRoutes from "./routes/auth";
import { requestLogger } from "./middleware/logger";

export const app = express();

app.set("trust proxy", true);
app.use(express.json());
app.use(requestLogger);

app.get('/', (_req, res) => {
  res.send('Hello Express!');
});

app.get('/api/users/:id', (_req, res) => {
  res.json({ id: _req.params.id });
});

app.get('/api/posts/:postId/comments/:commentId', (_req, res) => {
  res.json({ postId: _req.params.postId, commentId: _req.params.commentId });
});

app.use(healthRoutes);
app.use(authRoutes);

export default app;
