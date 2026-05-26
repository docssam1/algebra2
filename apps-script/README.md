# Apps Script Gemini Proxy

This folder contains an optional Google Apps Script proxy for Gemini calls.

## Setup

1. Open Google Apps Script and create a new project.
2. Paste `gemini-proxy.gs` into `Code.gs`.
3. In Project Settings, add Script Property:
   - Key: `GEMINI_API_KEY`
   - Value: your Gemini API key
4. Deploy as Web app:
   - Execute as: Me
   - Who has access: Anyone
5. Copy the Web app URL and paste it into the dashboard field:
   - `Apps Script URL (선택)`

The dashboard first tries the Apps Script URL. If the browser blocks it or it fails,
the existing Netlify Function is used as a fallback.
