import { randomUUID } from 'node:crypto';

const WINDOW = 6 * 60 * 60 * 1000;

export async function sweepCampusResearch({ port, token, runId = randomUUID(), fetchBatch = fetch }) {
  const url = 'http://127.0.0.1:' + port + '/api/internal/campus-feed/research';
  const totals = { processed: 0, found: 0, added: 0, gap: 0, failures: 0 };
  let offset = 0;
  for (let step = 0; step < 1250; step++) {
    const response = await fetchBatch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset, runId }),
      redirect: 'error', signal: AbortSignal.timeout(38_000),
    });
    if (!response.ok) throw new Error('Research worker returned HTTP ' + response.status);
    const data = await response.json();
    if (data.skipped === true && offset === 0) return { skipped: true };
    if (!Array.isArray(data.report) || data.report.length > 8) throw new Error('Invalid campus research batch.');
    for (const row of data.report) {
      totals.processed++;
      totals.found += row.found;
      totals.added += row.added;
      if (['missing_source', 'shared_source', 'paused'].includes(row.state)) totals.gap++;
      if (row.error || row.state === 'unreachable') totals.failures++;
    }
    if (data.nextOffset === null) return totals;
    if (!Number.isSafeInteger(data.nextOffset) || data.nextOffset <= offset || data.nextOffset > 10_000) {
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
    const runId = randomUUID();
    try {
      const result = await sweepCampusResearch({ port, token, runId });
      if (!result.skipped) console.info('Campus research sweep:', JSON.stringify(result));
    } catch {
      // Fail independently of the web server, and retry the same lease once
      // if Next.js was still warming up or a database/network blip occurred.
      await new Promise((resolve) => setTimeout(resolve, 20_000));
      if (stopped) return;
      try {
        const result = await sweepCampusResearch({ port, token, runId });
        if (!result.skipped) console.info('Campus research sweep:', JSON.stringify(result));
      } catch { console.warn('Campus research could not complete this window. No updates were published.'); }
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, WINDOW - Date.now() % WINDOW + 30_000);
        timer.unref();
      }
    }
  };
  timer = setTimeout(tick, 40_000);
  timer.unref();
  return () => { stopped = true; clearTimeout(timer); };
}
