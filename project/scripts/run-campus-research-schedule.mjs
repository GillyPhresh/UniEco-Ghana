import { randomUUID } from 'node:crypto';

const WINDOW = 6 * 60 * 60 * 1000;
const MAX_SWEEP_MS = 22 * 60 * 1000;
const RETRY_DELAY_MS = [1_200, 3_000, 6_000];
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readBatch({ url, token, offset, runId, windowUtc, stopAt, fetchBatch, delay }) {
  let reason = 'no response';
  for (let attempt = 0; attempt <= RETRY_DELAY_MS.length; attempt++) {
    const remaining = stopAt - Date.now();
    if (remaining <= 0) throw new Error('Research run deadline reached at offset ' + offset + '.');
    let response;
    try {
      response = await fetchBatch(url, {
        method: 'POST',
        // Do not reuse a stale connection to the local Next.js server after
        // a slow publisher batch.
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Connection: 'close' },
        body: JSON.stringify({ offset, runId, windowUtc }),
        redirect: 'error', signal: AbortSignal.timeout(Math.min(45_000, remaining)),
      });
    } catch (error) {
      reason = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'request timed out' : 'connection interrupted';
    }
    if (response) {
      if (response.ok) {
        try { return await response.json(); }
        catch { reason = 'incomplete response'; }
      } else {
        reason = 'HTTP ' + response.status;
        if (response.status !== 408 && response.status !== 429 && response.status < 500) break;
        await response.body?.cancel().catch(() => undefined);
      }
    }
    if (attempt < RETRY_DELAY_MS.length) await delay(RETRY_DELAY_MS[attempt]);
  }
  throw new Error('Research batch at offset ' + offset + ' did not finish (' + reason + ').');
}

export async function sweepCampusResearch({ port, token, runId = randomUUID(), fetchBatch = fetch, delay = pause }) {
  const url = 'http://127.0.0.1:' + port + '/api/internal/campus-feed/research';
  const now = Date.now();
  const windowUtc = new Date(Math.floor(now / WINDOW) * WINDOW).toISOString();
  const stopAt = now + MAX_SWEEP_MS;
  const totals = { processed: 0, found: 0, added: 0, gap: 0, failures: 0 };
  let offset = 0;
  for (let step = 0; step < 1250; step++) {
    const data = await readBatch({ url, token, offset, runId, windowUtc, stopAt, fetchBatch, delay });
    if (data?.skipped === true && offset === 0) {
      const retryAfterMs = Number.isSafeInteger(data.retryAfterMs) && data.retryAfterMs >= 1_000 && data.retryAfterMs <= 26 * 60_000
        ? data.retryAfterMs : null;
      return { skipped: true, retryAfterMs };
    }
    if (!Array.isArray(data?.report) || data.report.length > 8) throw new Error('Invalid response at research offset ' + offset + '.');
    for (const row of data.report) {
      totals.processed++;
      totals.found += row.found;
      totals.added += row.added;
      if (['missing_source', 'shared_source', 'paused'].includes(row.state)) totals.gap++;
      if (row.error || row.state === 'unreachable') totals.failures++;
    }
    if (data.nextOffset === null) return totals;
    if (!Number.isSafeInteger(data.nextOffset) || data.nextOffset !== offset + data.report.length
      || data.nextOffset <= offset || data.nextOffset > 10_000) {
      throw new Error('Invalid campus research cursor.');
    }
    offset = data.nextOffset;
  }
  throw new Error('Campus research sweep exceeded its safety limit.');
}

export function scheduleCampusResearch(port, token) {
  let timer;
  let stopped = false;
  const tick = async () => {
    let recoveryCheck = null;
    try {
      const result = await sweepCampusResearch({ port, token });
      if (!result.skipped) console.info('Campus research sweep:', JSON.stringify(result));
      else recoveryCheck = result.retryAfterMs;
    } catch (error) {
      // Only log bounded status/offset information, never the request or token.
      console.warn('Campus research could not complete this window:', error instanceof Error ? error.message : 'unknown failure');
      recoveryCheck = 26 * 60_000;
    } finally {
      if (!stopped) {
        const nextWindow = WINDOW - Date.now() % WINDOW + 30_000;
        timer = setTimeout(tick, Math.min(nextWindow, recoveryCheck || nextWindow));
        timer.unref();
      }
    }
  };
  timer = setTimeout(tick, 40_000);
  timer.unref();
  return () => { stopped = true; clearTimeout(timer); };
}
