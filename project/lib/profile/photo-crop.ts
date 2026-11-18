export type Point = { x: number; y: number };
export type PhotoSize = { width: number; height: number };
export type PhotoCrop = Point & { zoom: number };

export const DEFAULT_CROP: PhotoCrop = { x: 0.5, y: 0.5, zoom: 1 };
export const MAX_PHOTO_ZOOM = 4;
export const PROFILE_PHOTO_SIZE = 768;
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_SOURCE_PIXELS = 64_000_000;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** All preview and export positions refer to the same oriented image pixels. */
export function cropFrame(photo: PhotoSize, crop: PhotoCrop) {
  const side = Math.min(photo.width, photo.height) / clamp(crop.zoom, 1, MAX_PHOTO_ZOOM);
  return {
    side,
    left: clamp(crop.x * photo.width - side / 2, 0, photo.width - side),
    top: clamp(crop.y * photo.height - side / 2, 0, photo.height - side),
  };
}

/** Keep the pixel under a finger (or the middle of two fingers) anchored. */
export function movePhotoCrop(photo: PhotoSize, crop: PhotoCrop, from: Point, to: Point, scale = 1): PhotoCrop {
  const previous = cropFrame(photo, crop);
  const zoom = clamp(crop.zoom * scale, 1, MAX_PHOTO_ZOOM);
  const side = Math.min(photo.width, photo.height) / zoom;
  const left = clamp(previous.left + from.x * previous.side - to.x * side, 0, photo.width - side);
  const top = clamp(previous.top + from.y * previous.side - to.y * side, 0, photo.height - side);
  return { x: (left + side / 2) / photo.width, y: (top + side / 2) / photo.height, zoom };
}

export function renderProfilePhoto(image: HTMLImageElement, crop: PhotoCrop): Promise<Blob> {
  const frame = cropFrame({ width: image.naturalWidth, height: image.naturalHeight }, crop);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PROFILE_PHOTO_SIZE;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return Promise.reject(new Error('This browser could not prepare the photo.'));
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, frame.left, frame.top, frame.side, frame.side, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob?.type === 'image/jpeg') resolve(blob);
    else reject(new Error('This browser could not prepare the photo.'));
  }, 'image/jpeg', 0.9));
}
