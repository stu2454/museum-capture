/**
 * Photo intake.
 *
 * Phone cameras produce 4-12 MB files; a morning's cataloguing would fill a
 * tablet. Downscale on the way in, before anything touches storage.
 *
 * Two device-specific things this handles:
 *
 * 1. EXIF orientation. Phones record "which way up" as metadata rather than
 *    rotating the pixels. Draw such a file to a canvas naively and the artefact
 *    ends up on its side in the record. `imageOrientation: "from-image"` applies
 *    the rotation; the <img> fallback below gets it right for free.
 *
 * 2. HEIC. iPhones shoot HEIC by default. Safari decodes it natively and the
 *    canvas re-encodes to JPEG, which is the outcome we want anyway - a JPEG is
 *    portable and eHive will take it. On a browser that can't decode HEIC we
 *    keep the original file rather than losing the photo.
 */

const MAX_EDGE = 2000;
const QUALITY = 0.85;

export async function prepareImage(file: File): Promise<Blob> {
  const source = await decode(file);
  if (!source) return file; // couldn't decode - keep the original rather than lose it

  const longest = Math.max(source.width, source.height);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(source.image, 0, 0, width, height);
  source.release();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  return blob ?? file;
}

interface Decoded {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: File): Promise<Decoded | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    // Older Safari, or a format createImageBitmap won't take. An <img> element
    // applies EXIF orientation itself, so this path stays correct.
    return decodeViaImgElement(file);
  }
}

function decodeViaImgElement(file: File): Promise<Decoded | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () =>
      resolve({
        image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

export function downloadFile(name: string, contents: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
