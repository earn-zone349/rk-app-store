/**
 * Resizes and re-compresses an image file entirely in the browser (via
 * <canvas>) before it's uploaded. This keeps storage usage and bandwidth
 * costs down — an uncompressed phone-camera screenshot can be 5-10x larger
 * than it needs to be for a web listing.
 */
export interface CompressOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number // 0-1, for JPEG/WebP
  mimeType?: 'image/jpeg' | 'image/webp'
}

export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  const { maxWidth = 1280, maxHeight = 1280, quality = 0.82, mimeType = 'image/webp' } = options

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
  const targetWidth = Math.round(bitmap.width * scale)
  const targetHeight = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context not available')
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, mimeType, quality),
  )
  if (!blob) throw new Error('Image compression failed')

  const newName = file.name.replace(/\.[^.]+$/, mimeType === 'image/webp' ? '.webp' : '.jpg')
  return new File([blob], newName, { type: mimeType })
}

/** App icons are always square; this additionally center-crops to 1:1. */
export async function compressIcon(file: File, size = 512): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const minSide = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - minSide) / 2
  const sy = (bitmap.height - minSide) / 2

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context not available')
  ctx.drawImage(bitmap, sx, sy, minSide, minSide, 0, 0, size, size)

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.85),
  )
  if (!blob) throw new Error('Icon compression failed')

  const newName = file.name.replace(/\.[^.]+$/, '.webp')
  return new File([blob], newName, { type: 'image/webp' })
}
