/** 支持的 Office 文件 Content-Type 集合 */
const VALID_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

/** 不支持的文件扩展名集合 */
const INVALID_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe', 'dmg', 'pkg', 'apk', 'msi',
  'zip', 'rar', '7z', 'tar', 'gz',
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp',
  'mp3', 'mp4', 'avi', 'mov', 'mkv',
  'pdf',
]);

export interface IIsFormatSupportedParams {
  /** Content-Type 头（可能包含 charset） */
  contentType: string | undefined;
  /** 从 URL 提取的文件扩展名 */
  ext: string;
}

/** 综合 Content-Type 和扩展名判断是否支持 */
export const isFormatSupported = ({ contentType, ext }: IIsFormatSupportedParams): boolean => {
  if (contentType) {
    const mimeType = contentType.split(';')[0]!.trim().toLowerCase();
    if (VALID_CONTENT_TYPES.has(mimeType)) {
      return true;
    }
  }
  // Content-Type 缺失或不匹配时，检查扩展名是否为明确的非 Office 格式
  // 去除前导点以标准化扩展名格式
  const normalizedExt = ext.replace(/^\./, '').toLowerCase();
  if (INVALID_EXTENSIONS.has(normalizedExt)) {
    return false;
  }
  // 不确定时宽松处理，交给 LibreOffice 尝试转换
  return true;
};
