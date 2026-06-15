import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { mkdir, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { downloadFile, DownloadError } from './download';
import { convertToImages, ConversionError } from './converter';
import { isFormatSupported } from './format';
import { request as httpsRequest } from 'https';
import { request as httpRequest } from 'http';
import { TEMP_DIR, MAX_CONCURRENT_CONVERSIONS } from './constants';

/** 并发转换信号量 */
let activeConversions = 0;

/** 通过 HEAD 请求获取 Content-Type */
const fetchContentType = (targetUrl: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const protocol = targetUrl.startsWith('https:') ? httpsRequest : httpRequest;
    const req = protocol(targetUrl, { method: 'HEAD', timeout: 5000 }, (res) => {
      res.on('error', () => {});
      res.resume();
      resolve(res.headers['content-type'] || null);
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
};

/** 生成图片预览 HTML 页面 */
const buildPreviewHtml = (images: string[], taskId: string): string => {
  const imgTags = images
    .map((name) => `<img src="/files/${taskId}/${name}" style="max-width:100%;margin-bottom:16px;display:block;" />`)
    .join('\n');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:16px;background:#e8e8e8;display:flex;flex-direction:column;align-items:center;">
${imgTags}
</body>
</html>`;
};

/** 创建 Express 应用 */
export const createApp = (): express.Express => {
  const app = express();

  // 静态资源服务：提供转换产物中的图片
  app.use('/files', express.static(TEMP_DIR, { maxAge: '30m' }));

  app.get('/preview', async (req: Request, res: Response) => {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Missing required parameter: url' });
      return;
    }

    // 校验 URL 基本格式
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

    // 并发限制
    if (activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
      res.status(503).json({ error: 'Server busy, try again later' });
      return;
    }

    // Content-Type 检查（HEAD 失败不阻止）
    const contentType = await fetchContentType(url);
    const ext = extname(parsedUrl.pathname).replace('.', '');
    if (!isFormatSupported({ contentType: contentType ?? undefined, ext })) {
      res.status(400).json({ error: `Unsupported file format: ${contentType || ext}` });
      return;
    }

    // 生成任务目录
    const taskId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const taskDir = join(TEMP_DIR, taskId);

    activeConversions++;
    try {
      await mkdir(taskDir, { recursive: true });

      // 下载文件
      const inputExt = ext || 'bin';
      const inputPath = join(taskDir, `input.${inputExt}`);
      await downloadFile({ url, destPath: inputPath });

      // 逐页转为 PNG 图片
      await convertToImages({ inputPath, outputDir: taskDir });

      // 收集生成的图片并按名称排序
      const files = await readdir(taskDir);
      const images = files
        .filter((f) => f.endsWith('.png'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      if (images.length === 0) {
        res.status(500).json({ error: 'Conversion produced no output' });
        return;
      }

      // 返回图片预览页面
      const html = buildPreviewHtml(images, taskId);
      res.type('html').send(html);
    } catch (err) {
      if (err instanceof DownloadError) {
        res.status(502).json({ error: err.message });
        return;
      }
      if (err instanceof ConversionError) {
        res.status(500).json({ error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: `Internal error: ${message}` });
    } finally {
      activeConversions--;
    }
  });

  return app;
};
