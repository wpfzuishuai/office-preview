import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

interface IDownloadFileParams {
  /** 文件 URL */
  url: string;
  /** 目标文件路径 */
  destPath: string;
}

/** 下载文件到本地 */
export const downloadFile = async ({ url, destPath }: IDownloadFileParams): Promise<void> => {
  const res = await fetch(url, { headers: { 'User-Agent': 'office-preview/1.0' } });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
};
