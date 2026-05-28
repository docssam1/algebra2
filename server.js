import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const project = process.env.GOOGLE_CLOUD_PROJECT || "";
const location = process.env.GOOGLE_CLOUD_LOCATION || "asia-northeast3";
const model = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
const fallbackModels = ["gemini-2.0-flash", "gemini-1.5-flash"];

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "https://docssam1.github.io,http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS_NOT_ALLOWED"));
    }
  })
);
app.use(express.json({ limit: "1mb" }));

const client = new GoogleGenAI({
  vertexai: true,
  project,
  location
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    engine: "vertex_ai_gemini",
    project,
    location,
    model,
    fallbackModels,
    time: new Date().toISOString()
  });
});

// NOTE: route name is kept as /api/openai for frontend compatibility.
app.post("/api/openai", async (req, res) => {
  const startedAt = Date.now();
  const traceId = crypto.randomUUID();
  try {
    if (!project) {
      return res.status(500).json({
        ok: false,
        category: "server",
        message: "서버에 GOOGLE_CLOUD_PROJECT가 설정되어 있지 않습니다.",
        detail: "Missing GOOGLE_CLOUD_PROJECT"
      });
    }

    const { prompt, instructions, schema, maxOutputTokens } = req.body || {};

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        ok: false,
        category: "bad_request",
        message: "prompt가 비어 있습니다.",
        detail: "The request body must include a non-empty prompt."
      });
    }

    const request = {
      model,
      contents: String(prompt),
      config: {
        systemInstruction: String(
          instructions || "You are a precise Algebra 2 tutor. Return clear, reliable answers."
        ),
        maxOutputTokens: Number(maxOutputTokens || 1200)
      }
    };

    if (schema) {
      request.config.responseMimeType = "application/json";
      request.config.responseSchema = schema;
    }

    const { text, resolvedModel } = await generateWithFallback(request);
    emitStructuredLog({
      traceId,
      endpoint: "/api/openai",
      statusCode: 200,
      latencyMs: Date.now() - startedAt,
      modelActive: resolvedModel,
      category: "success"
    });

    return res.json({
      ok: true,
      text,
      model: resolvedModel
    });
  } catch (error) {
    const status = Number(error?.status || error?.code || 500);
    const raw = String(error?.message || "Vertex AI Gemini request failed");
    const category = classifyGeminiError(status, raw);
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    emitStructuredLog({
      traceId,
      endpoint: "/api/openai",
      statusCode: safeStatus,
      latencyMs: Date.now() - startedAt,
      modelActive: model,
      category,
      errorMessage: raw
    });

    return res.status(safeStatus).json({
      ok: false,
      category,
      message: getKoreanErrorMessage(category),
      detail: raw.slice(0, 500)
    });
  }
});

async function generateWithFallback(baseRequest) {
  const candidates = [baseRequest.model, ...fallbackModels.filter((m) => m !== baseRequest.model)];
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const request = { ...baseRequest, model: candidate };
      const response = await client.models.generateContent(request);
      const text = (response?.text || "").trim();
      if (!text) {
        throw new Error(`Empty response from model: ${candidate}`);
      }
      return { text, resolvedModel: candidate };
    } catch (error) {
      const raw = String(error?.message || "");
      const isModelIssue =
        Number(error?.status || error?.code || 0) === 404 ||
        /model.*not found|does not have access|publisher model/i.test(raw);
      if (!isModelIssue) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError || new Error("No available Gemini model succeeded.");
}

function classifyGeminiError(status, raw) {
  const text = String(raw || "").toLowerCase();
  if (status === 401 || status === 403 || /permission|unauth|denied/.test(text)) return "auth";
  if (status === 429 && /billing|quota|limit|resource_exhausted/.test(text)) return "billing";
  if (status === 429) return "rate_limit";
  if (/billing|quota|credit|payment|resource_exhausted/.test(text)) return "billing";
  if (status === 400) return "bad_request";
  if (status >= 500) return "server";
  if (/cors|network|fetch/.test(text)) return "network";
  return "unknown";
}

function getKoreanErrorMessage(category) {
  const map = {
    auth: "Google Cloud 서비스 계정 또는 권한 인증 오류입니다.",
    rate_limit: "Vertex AI 요청량 제한에 걸렸습니다.",
    billing: "Google Cloud 결제, 크레딧 또는 쿼터 문제가 있습니다.",
    bad_request: "요청 형식이 올바르지 않습니다.",
    server: "Gemini 프록시 서버 또는 Vertex AI 서버 오류입니다.",
    network: "네트워크 또는 CORS 연결 오류입니다.",
    unknown: "알 수 없는 Gemini 연결 오류입니다."
  };
  return map[category] || map.unknown;
}

app.listen(port, () => {
  console.log(`Vertex AI Gemini proxy server running on port ${port}`);
});

function emitStructuredLog({
  traceId,
  endpoint,
  statusCode,
  latencyMs,
  modelActive,
  category,
  errorMessage = ""
}) {
  console.log(
    JSON.stringify({
      context: "PLACEMENT_ENGINE",
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      network: {
        endpoint,
        status_code: Number(statusCode),
        latency_ms: Number(latencyMs)
      },
      payload: {
        model_active: modelActive,
        category,
        developer_detail: String(errorMessage || "").slice(0, 500)
      }
    })
  );
}
