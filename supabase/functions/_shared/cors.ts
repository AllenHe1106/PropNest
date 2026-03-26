const FALLBACK_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function getCorsHeaders(req: Request): Record<string, string> {
  const allowedRaw = Deno.env.get('ALLOWED_ORIGINS');

  // Fallback: if env var is not set, allow all origins (local dev)
  if (!allowedRaw) {
    return FALLBACK_HEADERS;
  }

  const allowedOrigins = allowedRaw.split(',').map((o) => o.trim());
  const requestOrigin = req.headers.get('Origin');

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return {
      'Access-Control-Allow-Origin': requestOrigin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
  }

  // Origin not allowed — omit the Access-Control-Allow-Origin header entirely
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

export function corsResponse(req: Request) {
  return new Response('ok', { headers: getCorsHeaders(req) });
}

export function jsonResponse(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

export function errorResponse(req: Request, error: string, status: number) {
  return jsonResponse(req, { error }, status);
}
