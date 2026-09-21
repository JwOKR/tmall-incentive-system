/**
 * 前端图片压缩工具。
 *
 * 用于在浏览器端把用户选择的图片等比缩放并转为 JPEG base64 dataURL，
 * 从而在不引入任何上传基础设施（multer / 对象存储）的前提下，
 * 把资质截图存入数据库 LongText 字段。
 */

/** 单张截图 base64 dataURL 长度上限（与后端 MAX_SCREENSHOT_LENGTH 相呼应） */
export const MAX_DATAURL_LENGTH = 1_500_000;

/** 支持 createImageBitmap 时优先使用，否则回退到 Image 元素 */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // 某些浏览器对特定格式可能失败，回退到 Image
    }
  }
  return await loadImageElement(file);
}

/** 通过 <img> + objectURL 加载图片 */
function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}

/**
 * 压缩图片：按最长边等比缩放（不放大小图），统一输出 JPEG dataURL。
 *
 * @param file 用户选择的文件（需为图片）
 * @param maxEdge 最长边像素上限，默认 1600
 * @param quality JPEG 质量 0-1，默认 0.82
 * @returns base64 dataURL 字符串
 */
export async function compressImage(file: File, maxEdge = 1600, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }

  const bitmap = await loadBitmap(file);
  const sourceWidth = (bitmap as ImageBitmap).width || (bitmap as HTMLImageElement).naturalWidth;
  const sourceHeight = (bitmap as ImageBitmap).height || (bitmap as HTMLImageElement).naturalHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('无法读取图片尺寸');
  }

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('当前浏览器不支持图片处理');
  }

  // 白底，避免透明 PNG 转 JPEG 后出现黑底
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetWidth, targetHeight);

  if (typeof (bitmap as ImageBitmap).close === 'function') {
    (bitmap as ImageBitmap).close();
  }

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * 处理用户提供的图片文件：校验类型 → 压缩 → 校验体积。
 *
 * 供「选择文件 / 拖拽 / 复制粘贴」三条入口共用，保证校验与压缩逻辑一致。
 *
 * @param file 用户提供的文件
 * @returns 压缩后的 JPEG base64 dataURL
 * @throws 中文 message：非图片 / 处理失败 / 体积超限
 */
export async function processImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }
  const dataUrl = await compressImage(file);
  if (dataUrl.length > MAX_DATAURL_LENGTH) {
    throw new Error('图片过大，请选择更小的图片');
  }
  return dataUrl;
}

/**
 * 格式化字节数为可读字符串。
 *
 * @param n 字节数
 * @returns 形如 '512 B' / '123.4 KB' / '1.20 MB'；非法输入返回 '-'
 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '-';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
