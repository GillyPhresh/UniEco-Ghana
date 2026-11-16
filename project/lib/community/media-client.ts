export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const VIDEO_PREPARATION_TIMEOUT_MS = 240_000;
export const VIDEO_FILE_EXTENSION = /\.(mp4|m4v|mov|qt|webm|ogv|ogg|avi|mkv|3gp|3g2|3gpp|3gpp2|mpeg|mpg|mpe|mpv|m2v|mts|m2ts|ts|vob|wmv|asf|flv|f4v|dv|mxf|divx|xvid|rm|rmvb|amv)$/i;

export async function withRequestTimeout<T>(timeoutMs: number, request: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    const timeoutError = new Error('The request timed out.');
    timeoutError.name = 'TimeoutError';
    controller.abort(timeoutError);
  }, timeoutMs);
  try {
    return await request(controller.signal);
  } finally {
    window.clearTimeout(timer);
  }
}

export function safeFileName(name: string) {
  return name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 180) || 'campus-attachment';
}

export function readableSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
