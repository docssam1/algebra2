const MODEL = 'gemini-2.5-flash';

function jsonResponse(statusCode, body) {
  return ContentService
    .createTextOutput(JSON.stringify({
      statusCode: statusCode,
      ...body,
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return jsonResponse(500, { error: 'Server key is missing (GEMINI_API_KEY).' });
  }

  let payload;
  try {
    payload = JSON.parse(event.postData.contents || '{}');
  } catch (error) {
    return jsonResponse(400, { error: 'Invalid JSON body.' });
  }

  const isVerify = payload.mode === 'verify';
  const prompt = isVerify ? 'ping' : payload.prompt;
  const sysInstruction = isVerify ? 'Return a very short response.' : payload.sysInstruction;

  if (!prompt || !sysInstruction) {
    return jsonResponse(400, { error: 'prompt and sysInstruction are required.' });
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
    geminiPayload.generationConfig.responseMimeType = 'application/json';
    geminiPayload.generationConfig.responseSchema = payload.schema;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  try {
    const response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify(geminiPayload),
    });

    const statusCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText() || '{}');
    if (statusCode < 200 || statusCode >= 300) {
      return jsonResponse(statusCode, {
        error: result?.error?.message || `Gemini call failed with status ${statusCode}.`,
      });
    }

    const text = (result?.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || '')
      .join('')
      .trim();

    if (!text) {
      return jsonResponse(502, { error: 'Gemini response was empty.' });
    }

    return jsonResponse(200, { text: text });
  } catch (error) {
    return jsonResponse(502, { error: 'Upstream network error.' });
  }
}
