import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const configuredOrigins = [
  process.env.PUBLIC_APP_ORIGIN,
  process.env.PUBLIC_APP_URL,
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ALLOWED_ORIGINS || "").split(","),
  process.env.NODE_ENV !== "production" && process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : undefined,
]
  .filter((origin): origin is string => Boolean(origin))
  .map((origin) => origin.trim().replace(/\/$/, ""));

// Security headers — applied before all other middleware
app.use(helmet({
  // Allow framing for the same origin (needed for preview iframe)
  frameguard: { action: "sameorigin" },
}));

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalizedOrigin = origin.replace(/\/$/, "");
    const isLocalDevelopment = process.env.NODE_ENV !== "production"
      && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin);
    if (configuredOrigins.includes(normalizedOrigin) || isLocalDevelopment) {
      return callback(null, true);
    }
    return callback(null, false);
  },
}));
// Migration source files are sent as base64 JSON. Keep the larger body limit
// scoped to this authenticated upload route rather than expanding every API
// endpoint's exposure to large request bodies.
app.use("/api/acc-migration/projects/:id/files", express.json({ limit: "14mb" }));
// 50mb was excessive and a DoS risk; images/files should use object storage.
// Keep 2mb for large JSON payloads (bulk imports etc.) but reject oversized requests.
app.use(express.json({
  limit: "2mb",
  verify(req, _res, buffer) {
    if (req.originalUrl?.startsWith("/api/inbox/webhooks/instagram")) {
      (req as any).rawBody = Buffer.from(buffer);
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.get("/api", (_req, res) => {
  res.json({ ok: true, service: "maison-hd-api" });
});

app.use("/api", router);

export default app;
