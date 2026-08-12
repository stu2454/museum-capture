/**
 * Photo intake.
 *
 * A modern iPhone shoots 12–48 megapixels. Decoding one of those at full size
 * and then drawing it to a canvas costs hundreds of megabytes and several
 * seconds of blocked main thread — the app appears frozen, which is what
 * "Adding…" greyed out for a long time actually was.
 *
 * The fix is to never hold the image at full size. `createImageBitmap` accepts
 * resize options, so the browser decodes straight to the size we want using its
 * own optimised path. Where those options aren't supported we fall back to an
 * <img> element, which Safari decodes natively and which applies EXIF rotation
 * for free.
 *
 * Two device-specific things this also handles:
 *
 * 1. EXIF orientation. Phones record "which way up" as metadata rather than
 *    rotating the pixels, so a naive canvas draw lands the artefact on its side.
 * 2. HEIC. iPhones shoot HEIC by default. Safari decodes it and the canvas
 *    re-encodes to JPEG — portable, and what eHive will accept.
 */

const MAX_EDGE = 2000;
const QUALITY = 0.85;

export async function prepareImage(file: File): Promise<Blob> {
  const source = await decode(file);
  if (!source) return file; // couldn't decode — keep the original rather than lose the photo

  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) {
    source.release();
    return file;
  }
  context.drawImage(source.image, 0, 0, source.width, source.height);
  source.release();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );

  // Free the canvas immediately. iOS is aggressive about reclaiming tabs that
  // hold a lot of image memory, and a reclaimed tab loses unsaved work.
  canvas.width = 0;
  canvas.height = 0;

  return blob ?? file;
}

interface Decoded {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function fit(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height };
  const scale = MAX_EDGE / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decode(file: File): Promise<Decoded | null> {
  // Ask the browser to decode directly to the target size. This is the whole
  // performance fix: a 48MP photo never exists in memory at full resolution.
  try {
    const probe = await createImageBitmap(file, { imageOrientation: "from-image" });
    const target = fit(probe.width, probe.height);

    if (target.width === probe.width) {
      return { image: probe, width: probe.width, height: probe.height, release: () => probe.close() };
    }

    const resized = await createImageBitmap(file, {
      imageOrientation: "from-image",
      resizeWidth: target.width,
      resizeHeight: target.height,
      resizeQuality: "high",
    });
    probe.close();
    return {
      image: resized,
      width: resized.width,
      height: resized.height,
      release: () => resized.close(),
    };
  } catch {
    return decodeViaImgElement(file);
  }
}

function decodeViaImgElement(file: File): Promise<Decoded | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const target = fit(image.naturalWidth, image.naturalHeight);
      resolve({
        image,
        width: target.width,
        height: target.height,
        release: () => URL.revokeObjectURL(url),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

/** Let the browser paint between heavy files, so progress is actually visible. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function downloadFile(name: string, contents: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
