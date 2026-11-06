// Función de prueba: valida sesión + límite gratis y llama a Anthropic.
// Variables en Netlify: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, (opcional) AI_MODEL, FREE_WEEKLY_LIMIT
const { guard, json } = require('../lib/guard');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const g = await guard(event);
  if (g.response) return g.response;

  let prompt;
  try { ({ prompt } = JSON.parse(event.body || '{}')); } catch { return json(400, { error: 'bad_json' }); }
  if (!prompt || typeof prompt !== 'string' || prompt.length > 2000) return json(400, { error: 'bad_prompt' });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'claude-haiku-5-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json(502, { error: 'ai_error' });
  return json(200, { text: (data.content || []).map((b) => b.text || '').join('') });
};
