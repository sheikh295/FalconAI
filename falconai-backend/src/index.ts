import "module-alias/register";
import express, { Application } from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import logRequest from "@app/middlewares/logRequest";
import logger from "@app/services/logging/logger";
import basicAuth from "express-basic-auth";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger/swagger-docs";
import { corsOptions } from "./config/cors";
import { limiter } from "./config/rate-limit";
import httpRouter from "./transport/http";

const app: Application = express();
const port = 3000;

// Trust proxy (required for Railway, ngrok, etc.)
app.set("trust proxy", true);

// Apply CORS BEFORE rate limiter (important for preflight requests)
app.use(cors(corsOptions));

// Handle preflight OPTIONS requests explicitly
app.options("{*path}", cors(corsOptions));

app.use((req, res, next) => {
  // Skip global JSON parsing for webhook routes — they use captureRawBody instead
  if (req.path.includes("webhook")) return next();
  express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

app.use(logRequest);

app.listen(port, async () => {
  logger.info(`Connected to DB & app listening on port ${port}`);
});

//----------------Swagger Documentation----------------\\

function swaggerCredential(value: string | undefined, fallback: string) {
  const raw = (value ?? fallback).trim();
  // Strip wrapping quotes from .env values like SWAGGER_PASSWORD="secret"
  return raw.replace(/^["']|["']$/g, "");
}

const swaggerAuth = basicAuth({
  users: {
    [swaggerCredential(process.env.SWAGGER_USERNAME, "admin")]: swaggerCredential(
      process.env.SWAGGER_PASSWORD,
      "falconai-backend-295",
    ),
  },
  challenge: true,
  realm: "FalconAI API Documentation",
  unauthorizedResponse: () =>
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Swagger login required</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; color: #14352f; line-height: 1.5; }
    code { background: #f3f1ea; padding: 0.1rem 0.35rem; }
  </style>
</head>
<body>
  <h1>Authentication required</h1>
  <p>FalconAI API docs are protected with HTTP Basic Auth.</p>
  <p>Your browser should show a username/password dialog. If it does not:</p>
  <ul>
    <li>Open this URL in a normal browser tab (not an embedded preview)</li>
    <li>Try a private/incognito window, or clear site data for this origin</li>
    <li>Use the <code>SWAGGER_USERNAME</code> / <code>SWAGGER_PASSWORD</code> values from the backend <code>.env</code></li>
  </ul>
</body>
</html>`,
});

app.use(
  "/api-docs",
  swaggerAuth,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customSiteTitle: "FalconAI API Documentation",
    customCss: `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #2c3e50; }
  `,
  }),
);

app.use(httpRouter);
