import { createApp } from './app';
import { mkdir } from 'fs/promises';
import { PORT, TEMP_DIR } from './constants';

const main = async (): Promise<void> => {
  await mkdir(TEMP_DIR, { recursive: true });

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`office-preview listening on http://0.0.0.0:${PORT}`);
  });
};

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
