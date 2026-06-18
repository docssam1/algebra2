// veoRoutes.js  (ESM — 이 프로젝트는 package.json 에 "type":"module" 이라 import 문법 사용)
import express from "express";

const VEO_PROJECT  = process.env.GOOGLE_CLOUD_PROJECT || "";
const VEO_LOCATION = process.env.VEO_LOCATION || "us-central1";
const VEO_MODEL    = process.env.VEO_MODEL || "veo-3.1-lite-generate-001";

const BASE =
  `https://${VEO_LOCATION}-aiplatform.googleapis.com/v1` +
  `/projects/${VEO_PROJECT}/locations/${VEO_LOCATION}/publishers/google/models/${VEO_MODEL}`;

// ★ 애니메이션 강제 지시 (실사 방지)
const ANIME_LOCK =
  "반드시 2D 일본 애니메이션 화풍으로만 생성한다. 실사 영상이나 실제 사람처럼 보이면 절대 안 된다. " +
  "입력 사진이 실사일지라도 반드시 손그림 애니메이션 스타일로 변환해서 그린다. " +
  "셀 애니메이션, 선명한 윤곽선, 평면적인 채색. ";

// ★ 자막 제거 강제 지시
const NO_SUBTITLE =
  "화면에 자막, 캐션, 글자, 텍스트를 절대 표시하지 않는다. 음성만 나오고 글자는 전혀 없다. ";

// ★ 공통 음성 톤
const VOICE_TONE =
  "독쌤 캐릭터의 목소리는 차분하고 진중한 성인 남성 톤. " +
  "아이 같거나 과장된 말투가 아니라, 믿음직하고 따뜻하면서도 안정감 있는 저음의 목소리로 말한다. ";

const STYLE_PREFIX_YUJUN =
  ANIME_LOCK + NO_SUBTITLE +
  "등장인물은 한국어로 말한다. " +
  '주인공 "유준": 20세 성인 남성. ' +
  "키 130cm, 몸무게 40kg, 조금 통통한 체형. 커피를 즐겨 마신다. " +
  "검은색 짧은 스파이키 헤어, 굵은 눈썹, 밝고 활기찬 미소, 주황색 별무늬 셔츠. " +
  "레퍼런스 이미지와 동일한 인물로 유지하되 반드시 애니메이션으로 그린다. " +
  '나머지 등장 캐릭터는 "이탈리안 브레인롯(Italian Brainrot)" 밈 스타일의 의인화 캐릭터로 그린다. ' +
  "모든 캐릭터 디자인은 회차 내내 일관되게 유지. ";

const STYLE_PREFIX_MATH =
  ANIME_LOCK + NO_SUBTITLE +
  "등장인물은 한국어로 말한다. " + VOICE_TONE +
  '선생님 캐릭터 "독쌤": 20대 남성, 회색 재킷, 검은 셔츠, 단정한 갈색 중단발 헤어, 친근하고 따뜻한 미소의 애니메이션 캐릭터. ' +
  "레퍼런스 인물의 이목구비와 분위기를 참고하되, 반드시 2D 애니메이션 캐릭터로 변환해서 그린다. " +
  "배경은 밝은 교실 또는 칠판이 있는 강의실. 칠판은 글자 없이 깨끗하거나 도형/숫자만 간단히 표시. " +
  "밝고 교육적인 분위기. ";

const STYLE_PREFIX_SCIENCE =
  ANIME_LOCK + NO_SUBTITLE +
  "등장인물은 한국어로 말한다. " + VOICE_TONE +
  '선생님 캐릭터 "독쌤": 20대 남성, 회색 재킷, 검은 셔츠, 단정한 갈색 중단발 헤어, 친근하고 따뜻한 미소의 애니메이션 캐릭터. ' +
  "레퍼런스 인물의 이목구비와 분위기를 참고하되, 반드시 2D 애니메이션 캐릭터로 변환해서 그린다. " +
  "배경은 밝은 실험실 또는 자연 탐구 현장. 실험 도구나 자연 현상을 그리되 글자는 넣지 않는다. " +
  "밝고 탐구적인 분위기. ";

function getStylePrefix(mode) {
  if (mode === "math") return STYLE_PREFIX_MATH;
  if (mode === "science") return STYLE_PREFIX_SCIENCE;
  return STYLE_PREFIX_YUJUN;
}

const NEGATIVE_PROMPT =
  "실사, 실사 영상, 실제 사람, 사진, 사진처럼 리얼한 얼굴, 3D 렌더, 실사적 피부, " +
  "저화질, 흐릿함, 깨진 손, 워터마크, " +
  "자막, 캐션, 글자, 텍스트, 칠판 글씨, 한글 텍스트, 영어 텍스트, 문자, 깨진 글자, 이상한 글자, " +
  "어린아이 목소리, 고음, 징징대는 목소리";

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
