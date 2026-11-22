/**
 * Badi photo / signature (kitni bhi MB) ko browser me hi chhota karta hai: resize + JPEG compress.
 * Server par sirf chhoti file jaati hai, isliye "file too large" error nahi aata.
 */
export class ImageError extends Error {}

type Opts = { maxSide?: number; maxKB?: number };

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* niche <img> fallback */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageError("This image could not be opened. Please choose a JPG or PNG photo.");
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function shrinkImage(file: File, { maxSide = 1000, maxKB = 350 }: Opts = {}): Promise<File> {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name)) {
    throw new ImageError("Please choose an image file (JPG, PNG or WebP).");
  }
  // Pehle se chhoti JPG/PNG/WebP ho to waise hi bhej do
  if (file.size <= maxKB * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;

  const img = await decode(file);
  try {
    let scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageError("Your browser could not process this image.");
    for (let round = 0; round < 6; round += 1) {
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      ctx.fillStyle = "#ffffff"; // transparent signature/PNG -> safed background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
      for (const q of [0.86, 0.75, 0.62, 0.5]) {
        const blob = await toBlob(canvas, q);
        if (blob && blob.size <= maxKB * 1024) {
          return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() });
        }
      }
      scale *= 0.75;
    }
    throw new ImageError("This image could not be made small enough. Please choose another photo.");
  } finally {
    img.close();
  }
}

/** Presets */
export const shrinkPhoto = (file: File) => shrinkImage(file, { maxSide: 900, maxKB: 300 });
export const shrinkSignature = (file: File) => shrinkImage(file, { maxSide: 800, maxKB: 150 });

export const imageErrorMessage = (e: unknown) => (e instanceof ImageError ? e.message : "This image could not be processed. Please choose another photo.");
