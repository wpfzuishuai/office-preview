/** 支持的 Office 文件 Content-Type 集合 */
const VALID_CONTENT_TYPES: ReadonlySet<string> = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "text/csv",
]);

/** 通过 HEAD 请求获取 Content-Type */
export const fetchContentType = async (targetUrl: string): Promise<string | null> => {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(targetUrl, {
      method: 'HEAD',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'office-preview/1.0' },
    });
    return res.headers.get('content-type');
  } catch {
    return null;
  }
};

export interface IIsFormatSupportedParams {
  /** Content-Type 头（可能包含 charset） */
  contentType: string | undefined;
}

/** 根据 Content-Type 判断是否支持 */
export const isFormatSupported = ({
  contentType,
}: IIsFormatSupportedParams): boolean => {
  if (!contentType) {
    return false;
  }
  const mimeType = contentType.split(";")[0]!.trim().toLowerCase();
  return VALID_CONTENT_TYPES.has(mimeType);
};
