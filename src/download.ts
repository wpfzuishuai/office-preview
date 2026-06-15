import { createWriteStream } from 'fs';
import { get } from 'https';
import { get as httpGet } from 'http';

/** 下载失败错误 */
export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

/** 最大重定向次数 */
const MAX_REDIRECTS = 10;

interface IDownloadFileParams {
  /** 文件 URL */
  url: string;
  /** 目标文件路径 */
  destPath: string;
}

interface IDownloadFileInternalParams extends IDownloadFileParams {
  /** 当前重定向次数 */
  redirectCount: number;
}

/** 流式下载文件到本地（内部实现，含重定向计数） */
const downloadFileInternal = ({ url, destPath, redirectCount }: IDownloadFileInternalParams): Promise<void> => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? get : httpGet;

    const req = protocol(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // 消费响应体后处理重定向
        res.resume();
        const redirectUrl = res.headers.location;
        if (!redirectUrl) {
          reject(new DownloadError('Redirect without location header'));
          return;
        }
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new DownloadError('Too many redirects'));
          return;
        }
        const resolved = new URL(redirectUrl, url).href;
        downloadFileInternal({ url: resolved, destPath, redirectCount: redirectCount + 1 })
          .then(resolve)
          .catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new DownloadError(`Download failed: HTTP ${res.statusCode}`));
        return;
      }

      const fileStream = createWriteStream(destPath);
      res.pipe(fileStream);
      res.on('error', (err) => {
        fileStream.destroy();
        reject(new DownloadError(`Response error: ${err.message}`));
      });
      fileStream.on('finish', () => resolve());
      fileStream.on('error', (err) => reject(new DownloadError(`Write error: ${err.message}`)));
    });

    req.on('error', (err) => reject(new DownloadError(`Request error: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new DownloadError('Download timeout'));
    });
  });
};

/** 流式下载文件到本地 */
export const downloadFile = ({ url, destPath }: IDownloadFileParams): Promise<void> => {
  return downloadFileInternal({ url, destPath, redirectCount: 0 });
};
