/**
 * SnapKeep Core Helper Functions
 */

/**
 * Generate a unique ID (UUID v4)
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'sk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

/**
 * Generate a formatted screenshot filename
 * @param {string} pattern - Format pattern with tokens like {YYYY}, {MM}, {DD}, {HH}, {mm}, {ss}
 * @param {string} format - 'png' | 'jpeg'
 * @param {Date} [date]
 * @returns {string}
 */
export function generateScreenshotName(pattern = 'Screenshot_{YYYY}-{MM}-{DD}_{HH}-{mm}-{ss}', format = 'png', date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const tokens = {
    '{YYYY}': date.getFullYear(),
    '{MM}': pad(date.getMonth() + 1),
    '{DD}': pad(date.getDate()),
    '{HH}': pad(date.getHours()),
    '{mm}': pad(date.getMinutes()),
    '{ss}': pad(date.getSeconds())
  };

  let name = pattern;
  for (const [key, val] of Object.entries(tokens)) {
    name = name.replaceAll(key, val);
  }

  const ext = format === 'jpeg' ? '.jpg' : '.png';
  if (!name.endsWith('.png') && !name.endsWith('.jpg') && !name.endsWith('.jpeg')) {
    name += ext;
  }
  return name;
}

/**
 * Convert Blob to Data URL
 * @param {Blob} blob 
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert Data URL to Blob
 * @param {string} dataUrl 
 * @returns {Blob}
 */
export function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Crop an image data URL given bounding coordinates with subpixel precision
 * @param {string} dataUrl 
 * @param {{x: number, y: number, width: number, height: number}} cropRect 
 * @param {number} devicePixelRatio 
 * @param {string} format - 'image/png' | 'image/jpeg'
 * @param {number} [viewportWidth]
 * @param {number} [viewportHeight]
 * @returns {Promise<{ blob: Blob, dataUrl: string, width: number, height: number }>}
 */
export function cropImage(dataUrl, cropRect, devicePixelRatio = 1, format = 'image/png', viewportWidth = 0, viewportHeight = 0) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Accurately compute scale factors based on actual captured image dimensions vs viewport
        const scaleX = (viewportWidth && viewportWidth > 0) ? (img.width / viewportWidth) : (devicePixelRatio || 1);
        const scaleY = (viewportHeight && viewportHeight > 0) ? (img.height / viewportHeight) : (devicePixelRatio || 1);

        const sx = Math.max(0, Math.round(cropRect.x * scaleX));
        const sy = Math.max(0, Math.round(cropRect.y * scaleY));
        const sWidth = Math.min(img.width - sx, Math.round(cropRect.width * scaleX));
        const sHeight = Math.min(img.height - sy, Math.round(cropRect.height * scaleY));

        if (sWidth <= 0 || sHeight <= 0) {
          return reject(new Error('Selected crop area is too small.'));
        }

        const canvas = document.createElement('canvas');
        canvas.width = sWidth;
        canvas.height = sHeight;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

        // Always export at maximum quality
        const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const croppedDataUrl = canvas.toDataURL(mime, 1.0);
        canvas.toBlob((blob) => {
          if (!blob) {
            return reject(new Error('Failed to create cropped image blob.'));
          }
          resolve({
            blob,
            dataUrl: croppedDataUrl,
            width: sWidth,
            height: sHeight
          });
        }, mime, 1.0);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for cropping.'));
    img.src = dataUrl;
  });
}

/**
 * Generate a high-resolution thumbnail data URL preserving crisp text and lines
 * @param {Blob|string} imageSource - Blob or data URL
 * @param {number} maxWidth 
 * @param {number} maxHeight 
 * @returns {Promise<string>}
 */
export async function createThumbnail(imageSource, maxWidth = 800, maxHeight = 500) {
  let src = imageSource;
  if (imageSource instanceof Blob) {
    src = await blobToDataUrl(imageSource);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Lossless PNG thumbnail so text remains crisp and readable
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(typeof src === 'string' ? src : '');
    img.src = src;
  });
}

/**
 * Stitch multiple vertical captured slices into a single canvas image
 * @param {Array<{ dataUrl: string, y: number, height: number }>} slices 
 * @param {number} totalWidth 
 * @param {number} totalHeight 
 * @param {string} format 
 * @returns {Promise<{ blob: Blob, dataUrl: string, width: number, height: number }>}
 */
export async function stitchVerticalImages(slices, totalWidth, totalHeight, format = 'image/png') {
  // Safety cap on max canvas dimension in browsers (typically 32,767 or 16,384)
  const MAX_CANVAS_HEIGHT = 24000;
  const safeHeight = Math.min(totalHeight, MAX_CANVAS_HEIGHT);

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = safeHeight;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  for (const slice of slices) {
    if (slice.y >= safeHeight) break;
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = slice.dataUrl;
    });

    const drawHeight = Math.min(slice.height, safeHeight - slice.y);
    ctx.drawImage(img, 0, 0, totalWidth, drawHeight, 0, slice.y, totalWidth, drawHeight);
  }

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve, reject) => {
    const finalDataUrl = canvas.toDataURL(mime, 1.0);
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Failed to stitch full-page screenshot.'));
      resolve({
        blob,
        dataUrl: finalDataUrl,
        width: totalWidth,
        height: safeHeight
      });
    }, mime, 1.0);
  });
}

/**
 * Async delay
 * @param {number} ms 
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
