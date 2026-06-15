import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { mkdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { downloadFile, DownloadError } from './download';
import { convertToHtml, ConversionError } from './converter';
import { isFormatSupported } from './format';
import { get as httpsGet } from 'https';
import { request as httpRequest } from 'http';

/** 临时文件根目录 */
const TEMP_DIR = '/tmp/office-preview';

/** 通过 HEAD 请求获取 Content-Type */
const fetchContentType = (targetUrl: string): Promise<string | null> => {
  return new Promise((resolve) => {
    // https.get 自动调用 .end()（HEAD 通过 options.method 指定）;
    // http.request 需要手动调用 .end()
    const protocol = targetUrl.startsWith('https:') ? httpsGet : httpRequest;
    const req = protocol(targetUrl, { method: 'HEAD', timeout: 5000 }, (res) => {
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

/** 替换 HTML 中相对路径为 /files 路由 */
const replaceResourcePaths = (html: string, taskId: string): string => {
  const prefix = `/files/${taskId}`;
  return html.replace(
    /(src|href)="(?!https?:\/\/|\/|data:|#)([^"]+)"/gi,
    (_: string, attr: string, p: string) => `${attr}="${prefix}/${p}"`,
  );
};

/** 创建 Express 应用 */
export const createApp = (): express.Express => {
  const app = express();

  // 静态资源服务：提供转换产物中的图片、CSS 等
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

    // Content-Type 检查（HEAD 失败不阻止，交给后续处理）
    const contentType = await fetchContentType(url);
    const ext = extname(parsedUrl.pathname).replace('.', '');
    if (!isFormatSupported({ contentType: contentType ?? undefined, ext })) {
      res.status(400).json({ error: `Unsupported file format: ${contentType || ext}` });
      return;
    }

    // 生成任务目录
    const taskId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const taskDir = join(TEMP_DIR, taskId);

    try {
      await mkdir(taskDir, { recursive: true });

      // 下载文件
      const inputExt = ext || 'bin';
      const inputPath = join(taskDir, `input.${inputExt}`);
      await downloadFile({ url, destPath: inputPath });

      // 转换为 HTML
      await convertToHtml({ inputPath, outputDir: taskDir });

      // 读取转换结果
      const htmlPath = join(taskDir, 'input.html');
      const html = await readFile(htmlPath, 'utf-8');

      // 替换资源路径并返回
      const resultHtml = replaceResourcePaths(html, taskId);
      res.type('html').send(resultHtml);
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
    }
  });

  return app;
};
