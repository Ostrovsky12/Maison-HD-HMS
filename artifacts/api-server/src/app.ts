import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Security headers — applied before all other middleware
app.use(helmet({
  // Allow framing for the same origin (needed for preview iframe)
  frameguard: { action: "sameorigin" },
  // Content-Security-Policy — permissive for now to not break existing UI; tighten in future
  contentSecurityPolicy: false,
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
app.use(cors());
// 50mb was excessive and a DoS risk; images/files should use object storage.
// Keep 2mb for large JSON payloads (bulk imports etc.) but reject oversized requests.
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.get("/api", (_req, res) => {
  res.json({ ok: true, service: "maison-hd-api" });
});

app.use("/api", router);

export default app;
