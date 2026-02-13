import sharp from 'sharp';

export async function loadImage(url: string, targetSize = 400): Promise<{ width: number; height: number; data: Uint8Array }> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const image = sharp(Buffer.from(buffer)).resize(targetSize, targetSize, { fit: 'cover' });
  const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}
