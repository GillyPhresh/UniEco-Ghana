/** Server-to-server guard for privileged outbound communication functions. */
export function requireInternalRequest(req: Request): Response | null {
  const expected = Deno.env.get('UNIECO_INTERNAL_FUNCTION_SECRET');
  const supplied = req.headers.get('x-unieco-internal-secret') || '';

  if (!expected) {
    return new Response(JSON.stringify({ error: 'Outbound communication is not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (expected.length !== supplied.length) return unauthorized();
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return difference === 0 ? null : unauthorized();
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
