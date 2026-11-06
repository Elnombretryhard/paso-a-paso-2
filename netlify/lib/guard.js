// Verifica sesión + aplica límite del plan gratis ANTES de llamar a la API de Anthropic.
// npm i @supabase/supabase-js
// Variables en Netlify: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (secreta, nunca en el front), FREE_WEEKLY_LIMIT (opcional)
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const FREE_WEEKLY_LIMIT = Number(process.env.FREE_WEEKLY_LIMIT || 5);

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function weekStart() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // lunes
  return d.toISOString().slice(0, 10);
}

async function guard(event) {
  const raw = event.headers.authorization || event.headers.Authorization || '';
  const token = raw.replace(/^Bearer\s+/i, '');
  if (!token) return { response: json(401, { error: 'no_auth' }) };

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { response: json(401, { error: 'invalid_token' }) };
  const user = data.user;

  const { data: profile } = await sb.from('profiles').select('plan').eq('id', user.id).maybeSingle();
  const plan = profile?.plan || 'free';

  if (plan === 'free') {
    const { data: ok, error: e } = await sb.rpc('consume_ai_call', {
      p_user: user.id,
      p_limit: FREE_WEEKLY_LIMIT,
      p_period: weekStart(),
    });
    if (e) return { response: json(500, { error: 'usage_check_failed' }) };
    if (!ok) return { response: json(429, { error: 'limit_reached', plan, limit: FREE_WEEKLY_LIMIT }) };
  }
  return { user, plan };
}

module.exports = { guard, json };

/* USO en tu función existente (al inicio del handler):
   const { guard } = require('../lib/guard');
   exports.handler = async (event) => {
     const g = await guard(event);
     if (g.response) return g.response;
     // ...tu lógica actual que llama a Anthropic...
   };
   Tip de costo: usa un modelo barato y max_tokens bajo en esa llamada. */
