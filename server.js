import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-5-mini";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://docssam1.github.io,http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("CORS_NOT_ALLOWED"));
  }
}));
app.use(express.json({ limit: "1mb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    engine: "openai",
    model,
    time: new Date().toISOString()
  });
});

app.post("/api/openai", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        category: "server",
        message: "서버에 OPENAI_API_KEY가 설정되어 있지 않습니다.",
        detail: "Missing OPENAI_API_KEY"
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
      instructions: String(instructions || "You are a precise Algebra 2 tutor. Return clear, reliable answers."),
      input: String(prompt),
      max_output_tokens: Number(maxOutputTokens || 1200)
    };

    if (schema) {
      request.text = {
        format: {
          type: "json_schema",
          name: "algebra2_response",
          schema,
          strict: true
        }
      };
    }

    const response = await client.responses.create(request);
    const text = response.output_text || extractOutputText(response);

    res.json({
      ok: true,
      text
    });
  } catch (error) {
    const status = Number(error?.status || error?.response?.status || 500);
    const raw = String(error?.message || "OpenAI request failed");
    const category = classifyOpenAiError(status, raw);

    res.status(status >= 400 && status < 600 ? status : 500).json({
      ok: false,
      category,
      message: getKoreanErrorMessage(category),
      detail: raw.slice(0, 500)
    });
  }
});

function extractOutputText(response) {
  try {
    return (response?.output || [])
      .flatMap((item) => item?.content || [])
      .map((content) => content?.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  } catch {
    return "";
  }
}

function classifyOpenAiError(status, raw) {
  const text = String(raw || "").toLowerCase();
  if (status === 401 || status === 403) return "auth";
  if (status === 429 && /billing|insufficient_quota|quota|credit/i.test(raw)) return "billing";
  if (status === 429) return "rate_limit";
  if (/billing|insufficient_quota|quota|credit|payment/i.test(raw)) return "billing";
  if (status === 400) return "bad_request";
  if (status >= 500) return "server";
  if (/cors|network|fetch/i.test(text)) return "network";
  return "unknown";
}

function getKoreanErrorMessage(category) {
  const map = {
    auth: "OpenAI API Key 인증 오류입니다.",
    rate_limit: "OpenAI 요청량 제한에 걸렸습니다.",
    billing: "OpenAI 결제, 크레딧 또는 쿼터 문제가 있습니다.",
    bad_request: "요청 형식이 올바르지 않습니다.",
    server: "GPT 중계 서버 또는 OpenAI 서버 오류입니다.",
    network: "네트워크 또는 CORS 연결 오류입니다.",
    unknown: "알 수 없는 GPT 연결 오류입니다."
  };
  return map[category] || map.unknown;
}

app.listen(port, () => {
  console.log(`GPT proxy server running on port ${port}`);
});
