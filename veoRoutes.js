// veoRoutes.js  (ESM — 이 프로젝트는 package.json 에 "type":"module" 이라 import 문법 사용)
import express from "express";

const VEO_PROJECT  = process.env.GOOGLE_CLOUD_PROJECT || "";
const VEO_LOCATION = process.env.VEO_LOCATION || "us-central1";
const VEO_MODEL    = process.env.VEO_MODEL || "veo-3.1-generate-lite-001";

const BASE =
  `https://${VEO_LOCATION}-aiplatform.googleapis.com/v1` +
  `/projects/${VEO_PROJECT}/locations/${VEO_LOCATION}/publishers/google/models/${VEO_MODEL}`;

const STYLE_PREFIX_YUJUN =
  "일본 애니메이션 화풍(셀 애니, 선명한 윤곽선, 부드러운 채색). " +
  "등장인물은 한국어로 말한다. " +
  '주인공 "유준": 20세 성인 남성. ' +
  "키 130cm, 몸무게 40kg, 조금 통통한 체형. 커피를 즐겨 마신다. " +
  "검은색 짧은 스파이키 헤어, 굵은 눈썹, 밝고 활기찬 미소, 주황색 별무늬 셔츠. " +
  "레퍼런스 이미지와 100% 동일하게 유지하며, 남자 캐릭터를 절대 바꾸지 않는다. " +
  '나머지 등장 캐릭터는 "이탈리안 브레인롯(Italian Brainrot)" 밈 스타일의 의인화 캐릭터로 그린다. ' +
  "모든 캐릭터 디자인은 회차 내내 일관되게 유지. ";

const STYLE_PREFIX_MATH =
  "일본 애니메이션 화풍(셀 애니, 선명한 윤곽선, 부드러운 채색). " +
  "등장인물은 한국어로 말하며 수학 개념을 쉽고 재미있게 설명한다. " +
  '선생님 캐릭터 "독쌤": 20대 남성, 회색 재킷, 검은 셔츠, 단정한 갈색 중단발 헤어, 친근하고 따뜻한 미소. ' +
  "레퍼런스 이미지와 100% 동일하게 유지하며, 캐릭터를 절대 바꾸지 않는다. " +
  "배경은 밝은 교실 또는 칠판이 있는 강의실. 칠판, 수식, 도형 등 수학 요소가 화면에 자연스럽게 등장. " +
  "밝고 교육적인 분위기. ";

const STYLE_PREFIX_SCIENCE =
  "일본 애니메이션 화풍(셀 애니, 선명한 윤곽선, 부드러운 채색). " +
  "등장인물은 한국어로 말하며 과학 개념이나 실험을 쉽고 재미있게 설명한다. " +
  '선생님 캐릭터 "독쌤": 20대 남성, 회색 재킷, 검은 셔츠, 단정한 갈색 중단발 헤어, 친근하고 따뜻한 미소. ' +
  "레퍼런스 이미지와 100% 동일하게 유지하며, 캐릭터를 절대 바꾸지 않는다. " +
  "배경은 밝은 실험실 또는 자연 탐구 현장. 실험 도구, 원소 기호, 자연 현상 등 과학 요소가 자연스럽게 등장. " +
  "밝고 탐구적인 분위기. ";

function getStylePrefix(mode) {
  if (mode === "math") return STYLE_PREFIX_MATH;
  if (mode === "science") return STYLE_PREFIX_SCIENCE;
  return STYLE_PREFIX_YUJUN;
}

const NEGATIVE_PROMPT =
  "실사, 사진, 3D 렌더, 저화질, 흐릿함, 깨진 손, 글자/자막 왜곡, 워터마크, 영어 텍스트";

const FIXED_PARAMS = { generateAudio: true, sampleCount: 1 };

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

function extractVideo(root) {
  let base64 = null, uri = null, mime = null;
  const seen = new Set();
  (function walk(o) {
    if (!o || typeof o !== "object" || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) { o.forEach(walk); return; }
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") {
        if (!base64 && /bytesBase64Encoded|encodedVideo|videoBytes/i.test(k) && v.length > 100) base64 = v;
        else if (!uri && /(gcsUri|uri|videoUri)/i.test(k) && (/^gs:\/\//i.test(v) || /\.mp4/i.test(v))) uri = v;
        else if (!mime && /mimeType/i.test(k) && /video/i.test(v)) mime = v;
      } else { walk(v); }
    }
  })(root);
  return { base64, uri, mime };
}

export const veoRouter = express.Router();

veoRouter.post("/api/video", async (req, res) => {
  try {
    if (!VEO_PROJECT) return res.status(500).json({ error: "GOOGLE_CLOUD_PROJECT 가 설정되어 있지 않습니다." });
    const { prompt="", images, imageBase64, mimeType="image/png", aspectRatio="16:9", durationSeconds=8, mode="yujun" } = req.body || {};
    const instance = { prompt: getStylePrefix(mode) + prompt };
    if (Array.isArray(images) && images.length > 0) {
      instance.referenceImages = images.slice(0,3).map(it=>({ image: toImg(it,mimeType), referenceType:"asset" }));
    } else if (imageBase64) {
      instance.image = toImg(imageBase64, mimeType);
    } else {
      return res.status(400).json({ error: "사진(images 또는 imageBase64)이 필요합니다." });
    }
    const body = { instances:[instance], parameters:{...FIXED_PARAMS, aspectRatio, durationSeconds, negativePrompt:NEGATIVE_PROMPT, personGeneration:"allow_adult"} };
    const token = await getToken();
    const r = await fetch(`${BASE}:predictLongRunning`, { method:"POST", headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"}, body:JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    return res.json({ operationName: data.name });
  } catch(e) { return res.status(500).json({ error: String(e?.message||e) }); }
});

veoRouter.post("/api/video/status", async (req, res) => {
  try {
    const { operationName } = req.body || {};
    if (!operationName) return res.status(400).json({ error: "operationName 이 필요합니다." });
    const token = await getToken();
    const r = await fetch(`${BASE}:fetchPredictOperation`, { method:"POST", headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"}, body:JSON.stringify({operationName}) });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    if (!data.done) return res.json({ done:false });
    if (data.error) return res.status(500).json({ done:true, error:data.error });
    const resp = data.response || {};
    const found = extractVideo(resp);
    if (!found.base64 && !found.uri) {
      return res.json({ done:true, mimeType:found.mime||"video/mp4", gcsUri:null, videoBase64:null, filtered:resp.raiMediaFilteredCount||null, debugKeys:Object.keys(resp) });
    }
    return res.json({ done:true, mimeType:found.mime||"video/mp4", gcsUri:found.uri||null, videoBase64:found.base64||null });
  } catch(e) { return res.status(500).json({ error: String(e?.message||e) }); }
});
