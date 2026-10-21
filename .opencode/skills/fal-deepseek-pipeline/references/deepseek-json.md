# DeepSeek structured output

- Base URL: `https://api.deepseek.com`
- Model: `deepseek-flash` (legacy `deepseek-chat`/`deepseek-reasoner` are retired).
- Endpoint: `POST /chat/completions` (OpenAI-compatible).
- JSON mode: `response_format: { "type": "json_object" }`.
- The prompt must explicitly ask for JSON and include an example schema.
- JSON mode guarantees valid JSON, not the expected shape. Validate every field.
- On invalid shape or truncated JSON: one repair attempt with the schema and the validation error.
- Set `max_tokens` and a 45 s timeout.
- `deepseek-flash` supports vision with `image_url` content blocks; verify this gate before relying on it.
- Never log the premise, plan, prompts, narration or key.
- Story plan contract: `title`, `logline`, exactly `sceneCount` beats with consecutive `order`, `visualPrompt` and `narration`.
