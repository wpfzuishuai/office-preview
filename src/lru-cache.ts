import { stat, link, unlink, mkdir, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { v4 as randomUUID } from 'uuid';

interface ICacheEntry {
  /** 缓存文件名 */
  fileName: string;
  /** 文件大小 */
  size: number;
  /** 最后访问时间戳 */
  lastAccess: number;
}

/** 基于文件大小的磁盘 LRU 缓存，超出上限时淘汰最久未访问的条目 */
export const createLruCache = (maxSize: number, cacheDir: string) => {
  const map = new Map<string, ICacheEntry>();
  let totalSize = 0;

  /** 确保缓存目录存在 */
  const ensureDir = async () => {
    try { await mkdir(cacheDir, { recursive: true }); } catch { /* already exists */ }
  };

  /** 获取缓存文件路径，未命中返回 undefined */
  const get = (url: string): string | undefined => {
    const entry = map.get(url);
    if (!entry) {
      return undefined;
    }
    entry.lastAccess = Date.now();
    return join(cacheDir, entry.fileName);
  };

  /** 逐出指定 URL 的缓存条目 */
  const evict = (url: string): void => {
    const entry = map.get(url);
    if (!entry) {
      return;
    }
    totalSize -= entry.size;
    map.delete(url);
    unlink(join(cacheDir, entry.fileName)).catch(() => {});
  };

  /** 从源路径存入缓存，文件过大时跳过 */
  const set = async (url: string, sourcePath: string): Promise<void> => {
    const info = await stat(sourcePath);
    const fileSize = info.size;
    if (fileSize > maxSize) {
      return;
    }

    await ensureDir();

    // 移除重复的旧条目
    evict(url);

    // 淘汰最久未使用的条目，直到有足够空间
    while (totalSize + fileSize > maxSize && map.size > 0) {
      let oldestUrl = '';
      let oldestTime = Infinity;
      for (const [u, v] of map) {
        if (v.lastAccess < oldestTime) {
          oldestTime = v.lastAccess;
          oldestUrl = u;
        }
      }
      if (oldestUrl) {
        evict(oldestUrl);
      }
    }

    const fileName = randomUUID();
    // 硬链接（零拷贝）将文件移入缓存目录
    await link(sourcePath, join(cacheDir, fileName));
    await unlink(sourcePath).catch(() => {});

    map.set(url, { fileName, size: fileSize, lastAccess: Date.now() });
    totalSize += fileSize;
  };

  /** 清空缓存目录中的残留文件（启动时调用） */
  const cleanup = async (): Promise<void> => {
    await rm(cacheDir, { recursive: true, force: true });
  };

  return { get, set, evict, cleanup };
};

/** 从缓存读取文件内容 */
export const readCacheFile = async (filePath: string): Promise<Buffer> => readFile(filePath);
