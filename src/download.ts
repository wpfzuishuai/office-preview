import { createWriteStream } from 'fs';
import { get } from 'https';
import { request } from 'http';

/** 下载失败错误 */
export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

interface IDownloadFileParams {
  /** 文件 URL */
  url: string;
  /** 目标文件路径 */
  destPath: string;
}

/** 流式下载文件到本地 */
export const downloadFile = ({ url, destPath }: IDownloadFileParams): Promise<void> => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? get : request;

    const req = protocol(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (!redirectUrl) {
          reject(new DownloadError('Redirect without location header'));
          return;
        }
        // 解析相对重定向
        const resolved = new URL(redirectUrl, url).href;
        downloadFile({ url: resolved, destPath }).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new DownloadError(`Download failed: HTTP ${res.statusCode}`));
        return;
      }

      const fileStream = createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => resolve());
      fileStream.on('error', (err) => reject(new DownloadError(`Write error: ${err.message}`)));
    });

    req.on('error', (err) => reject(new DownloadError(`Request error: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new DownloadError('Download timeout'));
    });
    req.end();
  });
};
