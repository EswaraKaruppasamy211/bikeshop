import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { assistantRouter } from "./routes/assistant.js";
import { categoriesRouter } from "./routes/categories.js";
import { enquiriesRouter } from "./routes/enquiries.js";
import { productsRouter } from "./routes/products.js";
import { systemRouter } from "./routes/system.js";
import { settingsRouter } from "./routes/settings.js";
import { uploadsRouter } from "./routes/uploads.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "32kb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 120 }));

app.use("/api", systemRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/products", productsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/enquiries", enquiriesRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/uploads", uploadsRouter);

app.use((_request, response) => {
  response.status(404).json({ error: "The requested API resource was not found." });
});

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (status === 413) {
    response.status(413).json({ error: "Request body exceeds the permitted size." });
    return;
  }
  if (status === 400) {
    response.status(400).json({ error: "Request body is invalid." });
    return;
  }
  console.error("Unhandled API error", {
    name: error instanceof Error ? error.name : "UnknownError",
    code: error && typeof error === "object" && "code" in error ? error.code : "unknown"
  });
  response.status(500).json({ error: "The request could not be completed." });
};
app.use(errorHandler);

export { app };
