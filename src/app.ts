import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { mkdir, readFile, rm } from 'fs/promises';
import { join, extname } from 'path';
import { downloadFile } from './download';
import { convertToPdf } from './converter';
import { isFormatSupported, fetchContentType } from './format';
import { TEMP_DIR, MAX_CONCURRENT_CONVERSIONS } from './constants';
import { buildPreviewHtml } from './view';

/** 并发转换信号量 */
let activeConversions = 0;

/** 创建 Express 应用 */
export const createApp = (): express.Express => {
  const app = express();

  app.get('/preview', async (req: Request, res: Response) => {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Missing required parameter: url' });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      res.status(400).json({ error: `Invalid URL: ${url}` });
      return;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      res.status(400).json({ error: 'Only http and https URLs are supported' });
      return;
    }

    if (activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
      res.status(503).json({ error: 'Server busy, try again later' });
      return;
    }

    const contentType = await fetchContentType(url);
    if (!isFormatSupported({ contentType: contentType ?? undefined })) {
      res.status(400).json({ error: `Unsupported file format: ${contentType || 'unknown'}` });
      return;
    }

    const taskId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const taskDir = join(TEMP_DIR, taskId);

    activeConversions++;
    try {
      await mkdir(taskDir, { recursive: true });

      const inputExt = extname(parsedUrl.pathname).replace('.', '') || 'bin';
      const inputPath = join(taskDir, `input.${inputExt}`);
      await downloadFile({ url, destPath: inputPath });

      await convertToPdf({ inputPath, outputDir: taskDir });

      const pdfPath = join(taskDir, 'input.pdf');
      const pdfBuffer = await readFile(pdfPath);
      await rm(taskDir, { recursive: true, force: true });

      const html = buildPreviewHtml(pdfBuffer.toString('base64'));
      res.type('html').send(html);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    } finally {
      activeConversions--;
    }
  });

  return app;
};
