# Backend reference-catalogue assistant

`POST /api/assistant` accepts a validated message and optional conversation
history. Provider settings are server-only: `AI_API_URL`, `AI_API_KEY`, and
`AI_MODEL`. The implementation calls an OpenAI-compatible Chat Completions
endpoint using JSON-object response format, an abort timeout, and a bearer
authorization header. Remote URLs must be HTTPS; HTTP is restricted to
loopback development URLs.

The catalogue is loaded from `REFERENCE_CATALOGUE_PATH`, or from
`data/reference-catalogue.json` relative to the process working directory (and
the parent directory fallback). It is validated with Zod, including unique
IDs and valid part-to-model references. Empty, missing, or invalid catalogues
do not produce fabricated records.

Provider output is treated as untrusted. Only returned IDs that exist in the
catalogue can be used, and the explanatory reply is assembled server-side from
the matched source records. Provider-authored free-form text is never returned.
An unknown lookup produces empty result arrays and an explicit no-match reply.
All replies distinguish this reference data from live inventory and request
exact make, model, year, and variant for fitment questions. The system never
claims verified compatibility, stock, price, or availability.

## Status codes

- `200`: `{ "reply": "...", "parts": [...], "models": [...] }`
- `400`: Invalid request shape or message.
- `502`: Provider timeout, non-success status, malformed response, or
  non-catalogue result ID.
- `503`: Missing/invalid/empty catalogue or missing provider configuration.

All errors are safe JSON messages. Credentials and provider error bodies are
not returned or logged.

The source PDFs were not available in the project or searched workspace when
this feature was updated, so the committed catalogue remains empty. See
`../../ASSISTANT_SETUP.md` and the root README for configuration and source
data instructions.
