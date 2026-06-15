import { readdir, rm } from 'fs/promises';
import { join } from 'path';
import { TEMP_DIR } from './constants';

/** 最大保留时间（毫秒） */
const MAX_AGE_MS = 30 * 60 * 1000;
/** 清理间隔（毫秒） */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** 启动定期清理定时器，返回停止函数 */
export const startCleanup = (): (() => void) => {
  const timer = setInterval(async () => {
    try {
      const entries = await readdir(TEMP_DIR, { withFileTypes: true });
      const now = Date.now();

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const dirPath = join(TEMP_DIR, entry.name);
        // 从目录名解析时间戳（格式：<timestamp>-<random>）
        const tsStr = entry.name.split('-')[0];
        const ts = parseInt(tsStr, 10);
        if (isNaN(ts)) {
          continue;
        }
        if (now - ts > MAX_AGE_MS) {
          await rm(dirPath, { recursive: true, force: true });
        }
      }
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  }, CLEANUP_INTERVAL_MS);

  return () => clearInterval(timer);
};
