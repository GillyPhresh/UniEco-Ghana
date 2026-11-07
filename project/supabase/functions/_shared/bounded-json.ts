/** Read a small JSON object without allowing unbounded request allocation. */
export async function readBoundedJson(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new RangeError('Request body too large');
  if (!req.body) throw new SyntaxError('Request body is empty');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RangeError('Request body too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('Expected a JSON object');
  return parsed as Record<string, unknown>;
}

export function boundedBodyErrorResponse(error: unknown, headers: Record<string, string>): Response | null {
  if (!(error instanceof RangeError) && !(error instanceof SyntaxError)) return null;
  const tooLarge = error instanceof RangeError;
  return new Response(JSON.stringify({ error: tooLarge ? 'Request body is too large' : 'Invalid JSON request body' }), {
    status: tooLarge ? 413 : 400,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
