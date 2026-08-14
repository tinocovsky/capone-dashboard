import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import pino from "pino";
import { env } from "./env.js";
import { reports } from "./routes/reports.js";

// Pino com destino stderr — sem transport "pino-pretty" (precisa dep extra).
// Para logs coloridos em dev: `pnpm add -D pino-pretty` e descomentar o bloco abaixo.
const log = pino(
  env.NODE_ENV === "development"
    ? { transport: { target: "pino/file", options: { destination: 1 } } } // 1 = stdout
    : undefined,
);
const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
    credentials: true,
  }),
);
app.use(express.json({ limit: "512kb" }));
app.use(cookieParser());
app.use(pinoHttp({ logger: log }));
// rate-limit (60 req/min/IP) — protege contra abuso no Railway (long-lived).
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);

app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.use("/api/reports", reports);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error({ err }, "unhandled error");
  res.status(500).json({ error: "internal", message: err.message });
});

export default app;
export { app };
