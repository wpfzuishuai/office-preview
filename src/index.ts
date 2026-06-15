import { createApp } from './app';
import { startCleanup } from './cleanup';
import { mkdir } from 'fs/promises';

/** 服务端口 */
const PORT = 3000;
/** 临时文件根目录 */
const TEMP_DIR = '/tmp/office-preview';

const main = async (): Promise<void> => {
  // 确保临时目录存在
  await mkdir(TEMP_DIR, { recursive: true });

  // 启动定期清理
  const stopCleanup = startCleanup();

  const app = createApp();

  const server = app.listen(PORT, () => {
    console.log(`office-preview listening on http://0.0.0.0:${PORT}`);
  });

  // 优雅关闭
  const shutdown = () => {
    console.log('Shutting down...');
    stopCleanup();
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
