import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import { veoRouter } from "./veoRoutes.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const project = process.env.GOOGLE_CLOUD_PROJECT || "";
const location = process.env.GOOGLE_CLOUD_LOCATION || "asia-northeast3";
const model = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
const fallbackModels = ["gemini-2.0-flash", "gemini-1.5-flash"];

// OpenAI 설정
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GPT_MODEL = process.env.GPT_MODEL || "gpt-4o";
const CODEX_MODEL = process.env.CODEX_MODEL || "o4-mini";

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ||
  "https://docssam1.github.io,http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOriginPatterns = [
  /^https:\/\/[a-z0-9-]+\.github\.io$/i,
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i
];

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        allowedOriginPatterns.some((pattern) => pattern.test(origin))
      ) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS_NOT_ALLOWED"));
    }
  })
);
app.use(express.json({ limit: "20mb" }));

// Veo 3.1 영상 생성 라우트 (/api/video, /api/video/status)
app.use(veoRouter);

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
    openai: {
      available: !!OPENAI_API_KEY,
      gptModel: GPT_MODEL,
      codexModel: CODEX_MODEL
    },
    time: new Date().toISOString()
  });
});

// HF AI 튜터 엔드포인트 (Gemini)
app.post("/api/tutor", async (req, res) => {
  const startedAt = Date.now();
  const traceId = crypto.randomUUID();
  try {
    if (!project) {
      return res.status(500).json({ text: "서버 프로젝트 설정이 없습니다." });
    }

    const { system, messages } = req.body || {};
    if (!messages || !messages.length) {
      return res.status(400).json({ text: "messages가 없습니다." });
    }

    const userMessages = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const request = {
      model,
      contents: userMessages,
      config: {
        systemInstruction: system || "You are a precise Algebra 2 math tutor for high school students preparing for US boarding school placement tests.",
        maxOutputTokens: 1024,
        temperature: 0.7
      }
    };

    const { text, resolvedModel } = await generateWithFallback(request);
    emitStructuredLog({
      traceId,
      endpoint: "/api/tutor",
      statusCode: 200,
      latencyMs: Date.now() - startedAt,
      modelActive: resolvedModel,
      category: "success"
    });

    return res.json({ text });
  } catch (error) {
    const status = Number(error?.status || error?.code || 500);
    const raw = String(error?.message || "Vertex AI Gemini request failed");
    const category = classifyGeminiError(status, raw);
    emitStructuredLog({
      traceId,
      endpoint: "/api/tutor",
      statusCode: status,
      latencyMs: Date.now() - startedAt,
      modelActive: model,
      category,
      errorMessage: raw
    });
    return res.status(500).json({ text: "잠시 후 다시 시도해주세요." });
  }
});

// Gemini 엔드포인트 (기존 /api/openai 유지 — 프론트 호환)
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

// OpenAI GPT-4o 엔드포인트
app.post("/api/gpt", async (req, res) => {
  const startedAt = Date.now();
  const traceId = crypto.randomUUID();
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        category: "server",
        message: "OpenAI API Key가 설정되어 있지 않습니다.",
        detail: "Missing OPENAI_API_KEY"
      });
    }

    const { prompt, instructions, maxOutputTokens } = req.body || {};

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        ok: false,
        category: "bad_request",
        message: "prompt가 비어 있습니다."
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: GPT_MODEL,
        messages: [
          {
            role: "system",
            content: String(instructions || "You are a precise Algebra 2 tutor. Return clear, reliable answers.")
          },
          {
            role: "user",
            content: String(prompt)
          }
        ],
        max_tokens: Number(maxOutputTokens || 1200)
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const raw = String(data?.error?.message || "OpenAI request failed");
      emitStructuredLog({
        traceId,
        endpoint: "/api/gpt",
        statusCode: response.status,
        latencyMs: Date.now() - startedAt,
        modelActive: GPT_MODEL,
        category: "error",
        errorMessage: raw
      });
      return res.status(response.status).json({
        ok: false,
        category: "openai_error",
        message: "OpenAI 요청 오류입니다.",
        detail: raw.slice(0, 500)
      });
    }

    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    emitStructuredLog({
      traceId,
      endpoint: "/api/gpt",
      statusCode: 200,
      latencyMs: Date.now() - startedAt,
      modelActive: GPT_MODEL,
      category: "success"
    });

    return res.json({ ok: true, text, model: GPT_MODEL });
  } catch (error) {
    const raw = String(error?.message || "OpenAI GPT request failed");
    emitStructuredLog({
      traceId,
      endpoint: "/api/gpt",
      statusCode: 500,
      latencyMs: Date.now() - startedAt,
      modelActive: GPT_MODEL,
      category: "error",
      errorMessage: raw
    });
    return res.status(500).json({
      ok: false,
      category: "server",
      message: "GPT 서버 오류입니다.",
      detail: raw.slice(0, 500)
    });
  }
});

// OpenAI Codex (o4-mini) 엔드포인트
app.post("/api/codex", async (req, res) => {
  const startedAt = Date.now();
  const traceId = crypto.randomUUID();
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        category: "server",
        message: "OpenAI API Key가 설정되어 있지 않습니다.",
        detail: "Missing OPENAI_API_KEY"
      });
    }

    const { prompt, instructions, maxOutputTokens } = req.body || {};

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        ok: false,
        category: "bad_request",
        message: "prompt가 비어 있습니다."
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: CODEX_MODEL,
        messages: [
          {
            role: "system",
            content: String(instructions || "You are a precise Algebra 2 math reasoning engine. Solve problems step by step with clear logical structure.")
          },
          {
            role: "user",
            content: String(prompt)
          }
        ],
        max_completion_tokens: Number(maxOutputTokens || 1200)
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const raw = String(data?.error?.message || "OpenAI Codex request failed");
      emitStructuredLog({
        traceId,
        endpoint: "/api/codex",
        statusCode: response.status,
        latencyMs: Date.now() - startedAt,
        modelActive: CODEX_MODEL,
        category: "error",
        errorMessage: raw
      });
      return res.status(response.status).json({
        ok: false,
        category: "openai_error",
        message: "Codex 요청 오류입니다.",
        detail: raw.slice(0, 500)
      });
    }

    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    emitStructuredLog({
      traceId,
      endpoint: "/api/codex",
      statusCode: 200,
      latencyMs: Date.now() - startedAt,
      modelActive: CODEX_MODEL,
      category: "success"
    });

    return res.json({ ok: true, text, model: CODEX_MODEL });
  } catch (error) {
    const raw = String(error?.message || "OpenAI Codex request failed");
    emitStructuredLog({
      traceId,
      endpoint: "/api/codex",
      statusCode: 500,
      latencyMs: Date.now() - startedAt,
      modelActive: CODEX_MODEL,
      category: "error",
      errorMessage: raw
    });
    return res.status(500).json({
      ok: false,
      category: "server",
      message: "Codex 서버 오류입니다.",
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


app.post("/identify-chat", async (req, res) => {
  const startedAt = Date.now();
  const traceId = crypto.randomUUID();
  try {
    if (!project) {
      return res.status(500).json({
        ok: false,
        error: "서버에 GOOGLE_CLOUD_PROJECT가 설정되어 있지 않습니다."
      });
    }

    const { query, systemPrompt, messages } = req.body || {};
    const prompt =
      String(query || "").trim() ||
      (Array.isArray(messages)
        ? messages.map((message) => message?.content || message?.text || "").join("\n").trim()
        : "");

    if (!prompt) {
      return res.status(400).json({
        ok: false,
        error: "query 또는 messages가 필요합니다."
      });
    }

    const request = {
      model,
      contents: prompt,
      config: {
        systemInstruction: String(
          systemPrompt ||
            "You are a helpful, precise AI tutor. Answer clearly and safely."
        ),
        maxOutputTokens: 600,
        temperature: 0.7
      }
    };

    const { text, resolvedModel } = await generateWithFallback(request);
    emitStructuredLog({
      traceId,
      endpoint: "/identify-chat",
      statusCode: 200,
      latencyMs: Date.now() - startedAt,
      modelActive: resolvedModel,
      category: "success"
    });

    return res.json({
      ok: true,
      text,
      model: resolvedModel,
      candidates: [
        {
          content: {
            parts: [{ text }]
          }
        }
      ]
    });
  } catch (error) {
    const status = Number(error?.status || error?.code || 500);
    const raw = String(error?.message || "Vertex AI Gemini request failed");
    const category = classifyGeminiError(status, raw);
    emitStructuredLog({
      traceId,
      endpoint: "/identify-chat",
      statusCode: status >= 400 && status < 600 ? status : 500,
      latencyMs: Date.now() - startedAt,
      modelActive: model,
      category,
      errorMessage: raw
    });

    return res.status(500).json({
      ok: false,
      error: getKoreanErrorMessage(category),
      detail: raw.slice(0, 500)
    });
  }
});
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
