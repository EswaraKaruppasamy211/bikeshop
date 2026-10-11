# Reference-catalogue assistant

The public assistant page is available at `/assistant` and sends JSON requests
to the existing `POST /api/assistant` endpoint. No frontend provider key is
used.

## Current source-data status

`data/reference-catalogue.json` is intentionally empty (`models` and `parts`
are empty arrays). The source PDFs,
`old_bike_models_2001_2017.pdf` and `bike_spare_parts_rate_list.pdf`, were not
found in the project or available workspace during this work. Consequently,
no source entries have been extracted and no sample product/model records are
included. Provide the source PDFs before populating the catalogue.

The catalogue must follow `data/reference-catalogue.schema.json`. Preserve
source spelling and wording, add source document/page traceability, retain
engine-capacity and date-range limitations, and record only fitment statements
explicitly supported by the source. Reference entries are not current stock.

## Configure a compatible provider

The backend sends OpenAI-compatible Chat Completions requests with JSON-object
response formatting. In `backend/.env`, configure all of:

```dotenv
AI_API_URL=https://api.openai.com/v1/chat/completions
AI_API_KEY=your_provider_api_key
AI_MODEL=your_provider_model
REFERENCE_CATALOGUE_PATH=../data/reference-catalogue.json
```

The OpenAI URL is an example; any provider with the compatible request and
response format can be used. Provider terms and cost vary. Remote endpoints
must use HTTPS; HTTP is permitted only for localhost/loopback development.
Keep the key exclusively in the backend environment. Never paste it into chat
or put it in frontend `VITE_*` variables. `.env` must remain untracked.

When credentials are absent, the endpoint returns HTTP 503 with a safe
configuration message. When the catalogue is empty, it returns a separate
HTTP 503 message. Provider timeouts, HTTP failures, invalid JSON, malformed
completion payloads, or unknown catalogue IDs return a safe HTTP 502 response.

## API contract

Request:

```json
{
  "message": "Ask about a model or part",
  "history": [
    { "role": "user", "content": "A previous question" },
    { "role": "assistant", "content": "A previous answer" }
  ]
}
```

Successful response:

```json
{
  "reply": "Catalogue references only (not live inventory): ...",
  "parts": [],
  "models": []
}
```

`parts` and `models` contain source catalogue records selected by validated
IDs. The backend builds `reply` itself rather than returning free-form provider
text. It reports when there is no matching reference and never asserts
verified compatibility, stock, price, or availability. For fitment questions,
provide the exact make, model, year, and variant.

No provider credentials are configured or live provider request verified as
part of this implementation.
