// Edge Function: genera embeddings con el modelo gte-small de Supabase (384 dims).
// Pura computación texto -> vector; las escrituras a la BD las hace el API (Node),
// que es quien tiene acceso al schema 'app'.
//
// Desplegada con verify_jwt=true: el API la llama con el token anon (un JWT).
//   supabase functions deploy embed

const model = new Supabase.ai.Session('gte-small');

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'usa POST' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'falta "text" (string)' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const embedding = await model.run(text, { mean_pool: true, normalize: true });
    return new Response(JSON.stringify({ embedding }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
