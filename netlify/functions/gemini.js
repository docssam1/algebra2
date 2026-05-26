const MODEL = "gemini-2.5-flash";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(500, { error: "Server key is missing (GEMINI_API_KEY)." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (_) {
    return json(400, { error: "Invalid JSON body." });
  }

  const isVerify = payload.mode === "verify";
  const prompt = isVerify ? "ping" : payload.prompt;
  const sysInstruction = isVerify
    ? "Return a very short response."
    : payload.sysInstruction;

  if (!prompt || !sysInstruction) {
    return json(400, { error: "prompt and sysInstruction are required." });
  }

  const geminiPayload = {
    contents: [{ parts: [{ text: String(prompt) }] }],
    systemInstruction: { parts: [{ text: String(sysInstruction) }] },
    generationConfig: {
      maxOutputTokens: Math.max(
        128,
        Math.min(3200, Number(payload.maxOutputTokens || (isVerify ? 32 : 1800)))
      ),
    },
  };

  if (payload.schema) {
    geminiPayload.generationConfig = {
      ...geminiPayload.generationConfig,
      responseMimeType: "application/json",
      responseSchema: payload.schema,
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json(response.status, {
        error:
          result?.error?.message ||
          `Gemini call failed with status ${response.status}.`,
      });
    }

    const text = result?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
    if (!text) {
      return json(502, { error: "Gemini response was empty." });
    }

    return json(200, { text });
  } catch (_) {
    return json(502, { error: "Upstream network error." });
  }
}

module.exports = { handler };
