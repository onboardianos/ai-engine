import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
serve(() =>
  new Response(JSON.stringify({
    ok: true,
    openaiConfigured: Boolean(Deno.env.get("OPENAI_API_KEY")),
    time: new Date().toISOString(),
    version: "v1"
  }), { headers: { "content-type": "application/json" } })
);
