# Vertex AI Gemini Proxy (Cloud Run)

## Endpoints

- `GET /api/health`
- `POST /api/openai` (frontend compatibility route; internally calls Vertex AI Gemini)

## Environment Variables

- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION` (e.g. `asia-northeast3` or `us-central1`)
- `GEMINI_MODEL` (e.g. `gemini-2.0-flash-lite`)
- `PORT` (optional)
- `ALLOWED_ORIGINS` (optional)

## Authentication

Use a Cloud Run service account with Vertex AI permissions (for example `Vertex AI User`).
No browser API key is required.
