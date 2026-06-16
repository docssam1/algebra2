// veoRoutes.js  (ESM — 이 프로젝트는 package.json 에 "type":"module" 이라 import 문법 사용)
// Veo 3.1 영상 생성 라우트. 기존 server.js 스타일/인증 방식과 충돌 없도록 작성.
//
// 인증: Cloud Run/GCE 메타데이터 서버에서 액세스 토큰을 받아 사용 → 새 npm 패키지 불필요.
//       (기존 @google/genai 의 ADC 와 동일한 서비스 계정을 그대로 사용)
// Veo 리전: us-central1 (서버 기본 리전 asia-northeast3 와 별개로 둠 — Veo 지원 리전)
//
// server.js 에 아래 3줄만 추가하면 됩니다:
//   import { veoRouter } from "./veoRoutes.js";
//   // app.use(express.json({ limit: "1mb" }))  →  "20mb" 로 변경
//   app.use(veoRouter);

import express from "express";

const VEO_PROJECT  = process.env.GOOGLE_CLOUD_PROJECT || "";
const VEO_LOCATION = process.env.VEO_LOCATION || "us-central1";
const VEO_MODEL    = process.env.VEO_MODEL || "veo-3.1-fast-generate-001"; // 정식: veo-3.1-generate-001

const BASE =
  `https://${VEO_LOCATION}-aiplatform.googleapis.com/v1` +
  `/projects/${VEO_PROJECT}/locations/${VEO_LOCATION}/publishers/google/models/${VEO_MODEL}`;

// ★★ 절대 조건 (모든 장면에 항상 적용) ★★
const STYLE_PREFIX =
  "일본 애니메이션 화풍(셀 애니, 선명한 윤곽선, 부드러운 채색). " +
  "등장인물은 한국어로 말한다. " +
  '주인공 남자 "유준": 18세, 키 130cm, 몸무게 40kg. ' +
  "살짝 통통하지만 과하게 뚱뚱하지는 않은 귀여운 체형(너무 살찌게 그리지 말 것). " +
  "검은색 짧은 스파이키 헤어, 굵은 눈썹, 큰 눈, 발그레한 볼, 밝고 활기찬 미소. " +
  "주황색 별무늬 셔츠 착용(가슴에 별 문양). " +
  "레퍼런스 이미지와 100% 동일하게 유지하며, 남자 캐릭터를 절대 바꾸지 않는다. " +
  '나머지 등장 캐릭터는 "이탈리안 브레인롯(Italian Brainrot)" 밈 스타일의 의인화 캐릭터로 그린다. ' +
  "모든 캐릭터 디자인은 회차 내내 일관되게 유지. ";

const NEGATIVE_PROMPT =
  "실사, 사진, 3D 렌더, 저화질, 흐릿함, 깨진 손, 글자/자막 왜곡, 워터마크, 영어 텍스트";

const FIXED_PARAMS = { generateAudio: true, sampleCount: 1 };

// 메타데이터 서버에서 OAuth 액세스 토큰 획득 (Cloud Run/GCE 에서 동작)
async function getToken() {
  const r = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } }
  );
  if (!r.ok) throw new Error("메타데이터 토큰 획득 실패: " + r.status);
  const j = await r.json();
  return j.access_token;
}

function toImg(item, defaultMime) {
  const b = typeof item === "string" ? item : item.base64 || item.imageBase64;
  const mt = typeof item === "string" ? defaultMime : item.mimeType || defaultMime;
  return {
    bytesBase64Encoded: String(b).replace(/^data:[^;]+;base64,/, ""),
    mimeType: mt || "image/png"
  };
}

export const veoRouter = express.Router();

// 1) 생성 시작: 사진(재료, 최대 3장) + 대본 → operationName
veoRouter.post("/api/video", async (req, res) => {
  try {
    if (!VEO_PROJECT) {
      return res.status(500).json({ error: "GOOGLE_CLOUD_PROJECT 가 설정되어 있지 않습니다." });
    }
    const {
      prompt = "",
      images,                 // 재료 사진 배열(최대 3장)
      imageBase64,            // 단일 첫 프레임(선택)
      mimeType = "image/png",
      aspectRatio = "16:9",
      durationSeconds = 8
    } = req.body || {};

    const instance = { prompt: STYLE_PREFIX + prompt };

    if (Array.isArray(images) && images.length > 0) {
      instance.referenceImages = images.slice(0, 3).map((it) => ({
        image: toImg(it, mimeType),
        referenceType: "asset"
      }));
    } else if (imageBase64) {
      instance.image = toImg(imageBase64, mimeType);
    } else {
      return res.status(400).json({ error: "사진(images 또는 imageBase64)이 필요합니다." });
    }

    const body = {
      instances: [instance],
      parameters: { ...FIXED_PARAMS, aspectRatio, durationSeconds, negativePrompt: NEGATIVE_PROMPT }
    };

    const token = await getToken();
    const r = await fetch(`${BASE}:predictLongRunning`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    return res.json({ operationName: data.name });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// 2) 상태 폴링: operationName → done / 영상(base64 또는 gcsUri)
veoRouter.post("/api/video/status", async (req, res) => {
  try {
    const { operationName } = req.body || {};
    if (!operationName) return res.status(400).json({ error: "operationName 이 필요합니다." });

    const token = await getToken();
    const r = await fetch(`${BASE}:fetchPredictOperation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ operationName })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    if (!data.done) return res.json({ done: false });
    if (data.error) return res.status(500).json({ done: true, error: data.error });

    const sample =
      data.response?.videos?.[0] ||
      data.response?.generatedSamples?.[0]?.video ||
      {};

    return res.json({
      done: true,
      mimeType: sample.mimeType || "video/mp4",
      gcsUri: sample.gcsUri || null,
      videoBase64: sample.bytesBase64Encoded || null
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});
