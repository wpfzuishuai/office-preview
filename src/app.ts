import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { mkdir, readFile, rm } from 'fs/promises';
import { join, extname } from 'path';
import { downloadFile } from './download';
import { convertToPdf } from './converter';
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

/** pdf.js CDN 地址 */
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

/** 生成 pdf.js 渲染预览 HTML 页面，PDF 以 base64 内嵌 */
const buildPreviewHtml = (base64: string): string => {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#525659; }
  .pages { display:flex; flex-direction:column; align-items:center; padding:16px 0; }
  .page-wrapper { margin-bottom:12px; box-shadow:0 2px 12px rgba(0,0,0,.5); background:#fff; max-width:calc(100% - 32px); }
  .page-wrapper canvas { display:block; max-width:100%; height:auto !important; }
  .loading { color:#ccc; text-align:center; padding:60px 20px; font:16px system-ui,sans-serif; }
</style>
</head>
<body>
<div class="pages" id="pagesContainer"><div class="loading">正在加载 PDF...</div></div>
<script src="${PDFJS_URL}"></script>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS_WORKER_URL}';

const PADDING = 32;
const container = document.getElementById('pagesContainer');
let pdfDoc = null;

const renderAllPages = () => {
  if (!pdfDoc) return;
  container.innerHTML = '';
  const dpr = window.devicePixelRatio || 1;
  const screenWidth = window.innerWidth - PADDING;
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    pdfDoc.getPage(i).then((page) => {
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = (screenWidth / baseViewport.width) * dpr;
      const viewport = page.getViewport({ scale });
      const wrapper = document.createElement('div');
      wrapper.className = 'page-wrapper';
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      wrapper.appendChild(canvas);
      container.appendChild(wrapper);
      page.render({ canvasContext: canvas.getContext('2d'), viewport });
    });
  }
};

// 将 base64 字符串转为 Uint8Array 传给 pdf.js
const binaryStr = atob('${base64}');
const bytes = new Uint8Array(binaryStr.length);
for (let i = 0; i < binaryStr.length; i++) {
  bytes[i] = binaryStr.charCodeAt(i);
}

pdfjsLib.getDocument({ data: bytes }).promise.then((pdf) => {
  pdfDoc = pdf;
  renderAllPages();
}).catch((err) => {
  container.innerHTML = '<div class="loading" style="color:#f66;">\\u52a0\\u8f7d PDF \\u5931\\u8d25\\uff1a' + err.message + '</div>';
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderAllPages, 200);
});
</script>
</body>
</html>`;
};

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

      // 读取 PDF，内嵌到 HTML 后立即清理临时目录
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
