import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
// The public campus-community bucket has a 25 MiB object cap. Reserve 1 MiB
// of headroom and reject longer output instead of publishing it privately.
const MAX_OUTPUT_BYTES = 24 * 1024 * 1024;
const MAX_TRANSCODE_MS = 210_000;
const MAX_CONCURRENT_TRANSCODES = 1;
const USER_TRANSCODE_LIMIT = 4;
const USER_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const ALLOWED_VIDEO_EXTENSIONS = new Set([
  'mp4', 'm4v', 'mov', 'qt', 'webm', 'ogv', 'ogg', 'avi', 'mkv', '3gp', '3g2',
  '3gpp', '3gpp2', 'mpeg', 'mpg', 'mpe', 'mpv', 'm2v', 'mts', 'm2ts', 'ts',
  'vob', 'wmv', 'asf', 'flv', 'f4v', 'dv', 'mxf', 'divx', 'xvid', 'rm', 'rmvb', 'amv',
]);

type RateWindow = { startedAt: number; count: number };
const rateWindows = new Map<string, RateWindow>();
let activeTranscodes = 0;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function extensionOf(name: string) {
  return path.extname(name).slice(1).toLowerCase();
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
  const requestHost = forwardedHost || request.headers.get('host');
  if (!origin || !requestHost) return false;
  try {
    const originUrl = new URL(origin);
    const requestProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || request.nextUrl.protocol.replace(':', '');
    return originUrl.host.toLowerCase() === requestHost.toLowerCase()
      && originUrl.protocol === `${requestProtocol}:`;
  } catch {
    return false;
  }
}

function takeRateLimit(userId: string) {
  const now = Date.now();
  rateWindows.forEach((window, key) => {
    if (now - window.startedAt >= USER_LIMIT_WINDOW_MS) rateWindows.delete(key);
  });
  if (rateWindows.size > 5_000) rateWindows.clear();
  const current = rateWindows.get(userId);
  if (!current || now - current.startedAt >= USER_LIMIT_WINDOW_MS) {
    rateWindows.set(userId, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= USER_TRANSCODE_LIMIT) return false;
  current.count += 1;
  return true;
}

async function hasFastBrowserCompatibleStreams(sourcePath: string) {
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let output = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    let probe: ReturnType<typeof spawn>;
    try {
      probe = spawn('ffprobe', [
        '-v', 'error', '-protocol_whitelist', 'file,pipe,data',
        '-show_entries', 'stream=codec_type,codec_name,pix_fmt,width,height',
        '-of', 'json', sourcePath,
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      finish(false);
      return;
    }
    probe.stdout?.on('data', (chunk: Buffer) => {
      if (output.length < 16_000) output += chunk.toString('utf8').slice(0, 16_000 - output.length);
    });
    probe.once('error', () => finish(false));
    probe.once('close', (code) => {
      if (code !== 0) { finish(false); return; }
      try {
        const streams = JSON.parse(output).streams as Array<{
          codec_type?: string; codec_name?: string; pix_fmt?: string; width?: number; height?: number;
        }>;
        const video = streams.find((stream) => stream.codec_type === 'video');
        const audio = streams.filter((stream) => stream.codec_type === 'audio');
        finish(Boolean(video?.codec_name === 'h264' && video.pix_fmt === 'yuv420p'
          && Number(video.width) <= 1280 && Number(video.height) <= 1280
          && audio.every((stream) => stream.codec_name === 'aac')));
      } catch {
        finish(false);
      }
    });
    timer = setTimeout(() => { probe.kill('SIGKILL'); finish(false); }, 10_000);
  });
}

async function convertToBrowserMp4(input: Buffer, inputExtension: string) {
  const directory = await mkdtemp(path.join(tmpdir(), 'unieco-video-'));
  const sourcePath = path.join(directory, `upload.${inputExtension || 'video'}`);
  const outputPath = path.join(directory, 'prepared.mp4');
  try {
    await writeFile(sourcePath, input, { flag: 'wx', mode: 0o600 });
    // Phone-recorded QuickTime files commonly contain H.264/AAC already.
    // Remux those instead of re-encoding; this keeps the browser-friendly MP4
    // output while avoiding a costly transcode for the most common uploads.
    const remuxableContainer = ['mp4', 'm4v', 'mov', 'qt'].includes(inputExtension);
    const copyCompatibleStreams = remuxableContainer && await hasFastBrowserCompatibleStreams(sourcePath);
    await new Promise<void>((resolve, reject) => {
      const commonArgs = [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-protocol_whitelist', 'file,pipe,data', '-max_alloc', '100000000', '-i', sourcePath,
        '-map', '0:v:0', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1',
      ];
      const mediaArgs = copyCompatibleStreams
        ? ['-c:v', 'copy', '-c:a', 'copy']
        : [
          '-filter_threads', '1', '-vf', "scale=w='min(960,iw)':h='min(960,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
          '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-crf', '27', '-maxrate', '1500k', '-bufsize', '3000k', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '64k', '-ac', '2',
        ];
      const process = spawn('ffmpeg', [
        ...commonArgs, ...mediaArgs, '-fs', String(MAX_OUTPUT_BYTES), '-movflags', '+faststart', '-f', 'mp4', outputPath,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      process.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 8_000) stderr += chunk.toString('utf8').slice(0, 8_000 - stderr.length);
      });
      process.once('error', (error) => finish(error));
      process.once('close', (code) => finish(code === 0 ? undefined : new Error(stderr || 'The video could not be converted.')));
      timeout = setTimeout(() => {
        process.kill('SIGKILL');
        finish(new Error('Video conversion took too long. Try a shorter video.'));
      }, MAX_TRANSCODE_MS);
    });
    const outputStats = await stat(outputPath);
    if (!outputStats.size || outputStats.size >= MAX_OUTPUT_BYTES) {
      throw new Error('The prepared video is too large to post. Try a shorter or smaller video.');
    }
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function loadAuthorizedPostVideo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  allowPrivateAttachment: boolean,
) {
  const { data: attachmentData } = allowPrivateAttachment
    ? await supabase.rpc('get_campus_community_post_file_info', { p_post_id: postId })
    : { data: null };
  const attachment = (attachmentData || [])[0] as { file_path?: string; file_name?: string; file_size?: number } | undefined;
  let bucket = 'campus-community-files';
  let filePath = attachment?.file_path;
  let isPublicPost = false;
  let extension = extensionOf(attachment?.file_name || '');
  if (!attachment?.file_path || !attachment.file_name || !ALLOWED_VIDEO_EXTENSIONS.has(extension)
    || !Number.isFinite(attachment.file_size) || Number(attachment.file_size) < 1 || Number(attachment.file_size) > MAX_VIDEO_BYTES) {
    const { data: postData } = await supabase.rpc('get_campus_community_post', { p_post_id: postId });
    const post = (postData || [])[0] as { author_id?: string; media_path?: string; media_type?: string } | undefined;
    const publicPath = post?.media_path || '';
    const validPath = post?.author_id && new RegExp(`^${post.author_id}/[0-9a-f-]{36}\\.([a-z0-9]+)$`, 'i').exec(publicPath);
    extension = validPath?.[1]?.toLowerCase() || '';
    if (post?.media_type !== 'video' || !validPath || !ALLOWED_VIDEO_EXTENSIONS.has(extension)) return null;
    bucket = 'campus-community';
    filePath = publicPath;
    isPublicPost = true;
  }
  const storage = supabase.storage.from(bucket);
  let videoUrl: string;
  if (isPublicPost) {
    videoUrl = storage.getPublicUrl(filePath!).data.publicUrl;
  } else {
    const { data: signed, error: signError } = await storage.createSignedUrl(filePath!, 90);
    if (signError || !signed?.signedUrl) return null;
    videoUrl = signed.signedUrl;
  }
  const download = await fetch(videoUrl, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
  if (!download.ok) return null;
  const declaredSize = Number(download.headers.get('content-length') || 0);
  if (declaredSize > MAX_VIDEO_BYTES) throw new Error('The video is larger than the playback limit.');
  const input = Buffer.from(await download.arrayBuffer());
  if (!input.byteLength || input.byteLength > MAX_VIDEO_BYTES) throw new Error('The video is larger than the playback limit.');
  return { input, extension, isPublicPost };
}

export async function GET(request: NextRequest) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return jsonError('This video request is not allowed.', 403);
  const postId = request.nextUrl.searchParams.get('postId') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(postId)) {
    return jsonError('The video post could not be identified.', 400);
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  // Public campus posts are viewable without an account. When a guest's direct
  // Storage stream is interrupted, allow only the published-post RPC fallback;
  // private attachment lookup remains strictly authenticated below.
  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'shared';
  const anonymousRateKey = `anonymous:${createHash('sha256').update(forwardedIp).digest('hex')}`;
  if (!user && authError && authError.name !== 'AuthSessionMissingError') {
    return jsonError('Your viewing session could not be verified. Refresh and try again.', 401);
  }
  if (!takeRateLimit(user?.id || anonymousRateKey)) return jsonError('Video playback is busy. Please try again shortly.', 429);
  if (activeTranscodes >= MAX_CONCURRENT_TRANSCODES) return jsonError('Video playback is busy. Please try again shortly.', 429);
  activeTranscodes += 1;
  let slotReleased = false;
  const releaseSlot = () => {
    if (slotReleased) return;
    slotReleased = true;
    activeTranscodes = Math.max(0, activeTranscodes - 1);
  };
  try {
    const source = await loadAuthorizedPostVideo(supabase, postId, Boolean(user));
    if (!source) { releaseSlot(); return jsonError('This video is not available for playback.', 404); }
    // Return a conventional fast-start MP4. iOS Safari can stall indefinitely
    // when a fragmented MP4 response is buffered into a Blob for legacy posts.
    const mp4 = await convertToBrowserMp4(source.input, source.extension);
    releaseSlot();
    return new Response(new Uint8Array(mp4), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'inline; filename="unieco-video.mp4"',
        'Content-Length': String(mp4.byteLength),
        // Cache successful public legacy conversions only in this viewer's
        // browser. Never allow private attachments or shared-CDN caching.
        'Cache-Control': source.isPublicPost ? 'private, max-age=86400' : 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    releaseSlot();
    const message = error instanceof Error ? error.message : '';
    if (message.includes('too large')) return jsonError('This video is larger than the playback limit.', 413);
    if (message.includes('too long')) return jsonError('This video took too long to prepare. Please try again.', 422);
    return jsonError('This video could not be opened. Please try again.', 422);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return jsonError('This video request is not allowed.', 403);
  const requestLength = Number(request.headers.get('content-length') || 0);
  if (requestLength > MAX_VIDEO_BYTES + 2 * 1024 * 1024) return jsonError('Choose a video up to 50 MB.', 413);

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return jsonError('Sign in to prepare a campus video.', 401);

  if (activeTranscodes >= MAX_CONCURRENT_TRANSCODES) {
    return jsonError('Video preparation is busy. Please try again shortly.', 429);
  }

  const contentType = request.headers.get('content-type') || '';
  let input: Buffer;
  let extension: string;

  if (contentType.includes('application/json')) {
    let postId: unknown;
    try {
      const body = await request.json();
      postId = body?.postId;
    } catch {
      return jsonError('The video request is invalid.', 400);
    }
    if (typeof postId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(postId)) {
      return jsonError('The video post could not be identified.', 400);
    }
    const { data: attachmentData } = await supabase.rpc('get_campus_community_post_file_info', { p_post_id: postId });
    const attachment = (attachmentData || [])[0] as { file_path?: string; file_name?: string; file_size?: number } | undefined;
    let bucket = 'campus-community-files';
    let filePath = attachment?.file_path;
    extension = extensionOf(attachment?.file_name || '');
    if (!attachment?.file_path || !attachment.file_name || !ALLOWED_VIDEO_EXTENSIONS.has(extension)
      || !Number.isFinite(attachment.file_size) || Number(attachment.file_size) < 1 || Number(attachment.file_size) > MAX_VIDEO_BYTES) {
      // Older MP4/WebM posts were stored in the public media bucket. Read them
      // only through the existing post-visibility RPC before preparing them.
      const { data: postData } = await supabase.rpc('get_campus_community_post', { p_post_id: postId });
      const post = (postData || [])[0] as { author_id?: string; media_path?: string; media_type?: string } | undefined;
      const publicPath = post?.media_path || '';
      const validPath = post?.author_id && new RegExp(`^${post.author_id}/[0-9a-f-]{36}\\.([a-z0-9]+)$`, 'i').exec(publicPath);
      extension = validPath?.[1]?.toLowerCase() || '';
      if (post?.media_type !== 'video' || !validPath || !ALLOWED_VIDEO_EXTENSIONS.has(extension)) {
        return jsonError('This video is not available for playback preparation.', 404);
      }
      bucket = 'campus-community';
      filePath = publicPath;
    }
    const { data: signed, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath!, 90);
    if (signError || !signed?.signedUrl) return jsonError('The private video could not be opened.', 404);
    const download = await fetch(signed.signedUrl, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
    if (!download.ok) return jsonError('The private video could not be downloaded for playback.', 502);
    const declaredSize = Number(download.headers.get('content-length') || 0);
    if (declaredSize > MAX_VIDEO_BYTES) return jsonError('This video is larger than the playback limit.', 413);
    input = Buffer.from(await download.arrayBuffer());
  } else if (contentType.includes('application/octet-stream')) {
    const { data: allowed, error: permissionError } = await supabase.rpc('can_upload_campus_community_media');
    if (permissionError || allowed !== true) return jsonError('Your account is not eligible to post campus videos.', 403);
    const encodedName = request.headers.get('x-unieco-video-name') || '';
    let fileName = '';
    try {
      fileName = decodeURIComponent(encodedName);
    } catch {
      return jsonError('The selected video filename is invalid.', 400);
    }
    extension = extensionOf(fileName);
    if (!fileName || !ALLOWED_VIDEO_EXTENSIONS.has(extension)) {
      return jsonError('Choose a recognized video file.', 415);
    }
    try {
      input = Buffer.from(await request.arrayBuffer());
    } catch {
      return jsonError('The video upload could not be read. Please select it again and retry.', 400);
    }
  } else if (contentType.includes('multipart/form-data')) {
    const { data: allowed, error: permissionError } = await supabase.rpc('can_upload_campus_community_media');
    if (permissionError || allowed !== true) return jsonError('Your account is not eligible to post campus videos.', 403);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError('The video upload could not be read.', 400);
    }
    const file = form.get('video');
    if (!(file instanceof File) || file.size < 1 || file.size > MAX_VIDEO_BYTES) {
      return jsonError('Choose a video up to 50 MB.', 413);
    }
    extension = extensionOf(file.name);
    if (!file.type.startsWith('video/') && !ALLOWED_VIDEO_EXTENSIONS.has(extension)) {
      return jsonError('Choose a recognized video file.', 415);
    }
    input = Buffer.from(await file.arrayBuffer());
  } else {
    return jsonError('Send a video file to prepare it for playback.', 415);
  }

  if (input.byteLength < 1 || input.byteLength > MAX_VIDEO_BYTES) return jsonError('Choose a video up to 50 MB.', 413);
  if (!takeRateLimit(user.id)) return jsonError('You have prepared several videos recently. Please try again later.', 429);

  activeTranscodes += 1;
  try {
    const mp4 = await convertToBrowserMp4(input, ALLOWED_VIDEO_EXTENSIONS.has(extension) ? extension : 'video');
    return new Response(new Uint8Array(mp4), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'inline; filename="unieco-video.mp4"',
        'Content-Length': String(mp4.byteLength),
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('ENOENT')) return jsonError('Video playback preparation is temporarily unavailable.', 503);
    if (message.includes('too large')) return jsonError(message, 413);
    if (message.includes('too long')) return jsonError(message, 422);
    return jsonError('This video file could not be prepared. Please try another video file.', 422);
  } finally {
    activeTranscodes = Math.max(0, activeTranscodes - 1);
  }
}
