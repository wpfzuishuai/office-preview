# Office Preview Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build a Dockerized Node.js service that converts Office files to HTML via LibreOffice for browser preview.

**Architecture:** Single Express server in a Docker container. GET /preview?url=... downloads the file, spawns LibreOffice headless to convert to HTML, replaces resource paths, and returns the result. Static assets served via /files/:taskId/*.

**Tech Stack:** Node.js 22, TypeScript, Express, LibreOffice headless, Docker

**File Structure:**
```
office-preview/
├── src/
│   ├── index.ts        # Entry point, server startup
│   ├── app.ts          # Express app setup, routes, error mapping
│   ├── converter.ts    # LibreOffice spawn wrapper
│   ├── download.ts     # HTTP(s) file download
│   ├── format.ts       # Content-Type validation
│   └── cleanup.ts      # Periodic temp dir cleanup
├── Dockerfile
├── tsconfig.json
├── .dockerignore
├── package.json
└── pnpm-lock.yaml
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.dockerignore`
- Create: `.gitignore`
- Create: `src/` directory

- [ ] **Step 1: Create package.json**

```json
{
  "name": "office-preview",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create .dockerignore and .gitignore**

`.dockerignore`:
```
node_modules/
dist/
.git/
```

`.gitignore`:
```
node_modules/
dist/
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`
Expected: Dependencies installed, `pnpm-lock.yaml` created.

- [ ] **Step 5: Create src directory**

Run: `mkdir -p src`

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json .dockerignore .gitignore
git commit -m "chore: scaffold project with TypeScript and Express"
```

---

### Task 2: Format validation

**Files:**
- Create: `src/format.ts`

- [ ] **Step 1: Create src/format.ts**

```typescript
/** 支持的 Office 文件 Content-Type 映射 */
const VALID_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

/** 不支持的文件扩展名集合 */
const INVALID_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe', 'dmg', 'pkg', 'apk', 'msi',
  'zip', 'rar', '7z', 'tar', 'gz',
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp',
  'mp3', 'mp4', 'avi', 'mov', 'mkv',
  'pdf',
]);

interface IIsFormatSupportedParams {
  /** Content-Type 头（可能包含 charset） */
  contentType: string | undefined;
  /** 从 URL 提取的文件扩展名 */
  ext: string;
}

/** 综合 Content-Type 和扩展名判断是否支持 */
export const isFormatSupported = ({ contentType, ext }: IIsFormatSupportedParams): boolean => {
  if (contentType) {
    const mimeType = contentType.split(';')[0]!.trim().toLowerCase();
    if (VALID_CONTENT_TYPES.has(mimeType)) {
      return true;
    }
  }
  // Content-Type 缺失或不匹配时，检查扩展名是否为明确的非 Office 格式
  if (INVALID_EXTENSIONS.has(ext.toLowerCase())) {
    return false;
  }
  // 不确定时宽松处理，交给 LibreOffice 尝试转换
  return true;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm build`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/format.ts
git commit -m "feat: add format validation"
```

---

### Task 3: File download

**Files:**
- Create: `src/download.ts`

- [ ] **Step 1: Create src/download.ts**

```typescript
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { get } from 'https';
import { request } from 'http';

/** 下载失败错误 */
export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DownloadError';
  }
}

interface IDownloadFileParams {
  /** 文件 URL */
  url: string;
  /** 目标文件路径 */
  destPath: string;
}

/** 流式下载文件到本地 */
export const downloadFile = ({ url, destPath }: IDownloadFileParams): Promise<void> => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? get : request;

    const req = protocol(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (!redirectUrl) {
          reject(new DownloadError('Redirect without location header'));
          return;
        }
        // 解析相对重定向
        const resolved = new URL(redirectUrl, url).href;
        downloadFile({ url: resolved, destPath }).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new DownloadError(`Download failed: HTTP ${res.statusCode}`));
        return;
      }

      const fileStream = createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => resolve());
      fileStream.on('error', (err) => reject(new DownloadError(`Write error: ${err.message}`)));
    });

    req.on('error', (err) => reject(new DownloadError(`Request error: ${err.message}`)));
    req.on('timeout', () => {
      req.destroy();
      reject(new DownloadError('Download timeout'));
    });
    req.end();
  });
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm build`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/download.ts
git commit -m "feat: add file download with redirect support"
```

---

### Task 4: LibreOffice conversion

**Files:**
- Create: `src/converter.ts`

- [ ] **Step 1: Create src/converter.ts**

```typescript
import { spawn } from 'child_process';

/** 转换失败错误 */
export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversionError';
  }
}

/** LibreOffice 转换超时时间（ms） */
const CONVERSION_TIMEOUT_MS = 30000;

interface IConvertToHtmlParams {
  /** 输入文件路径 */
  inputPath: string;
  /** 输出目录路径 */
  outputDir: string;
}

/** 使用 LibreOffice headless 将 Office 文件转为 HTML */
export const convertToHtml = ({ inputPath, outputDir }: IConvertToHtmlParams): Promise<void> => {
  return new Promise((resolve, reject) => {
    const proc = spawn('soffice', [
      '--headless',
      '--convert-to', 'html',
      '--outdir', outputDir,
      inputPath,
    ]);

    let stderr = '';
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new ConversionError('Conversion timeout'));
    }, CONVERSION_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new ConversionError(`LibreOffice exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new ConversionError(`Failed to start LibreOffice: ${err.message}`));
    });
  });
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm build`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/converter.ts
git commit -m "feat: add LibreOffice HTML conversion"
```

---

### Task 5: Temp file cleanup

**Files:**
- Create: `src/cleanup.ts`

- [ ] **Step 1: Create src/cleanup.ts**

```typescript
import { readdir, rm } from 'fs/promises';
import { join } from 'path';

/** 临时文件根目录 */
const TEMP_DIR = '/tmp/office-preview';
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
    } catch {
      // 目录尚不存在或已清理
    }
  }, CLEANUP_INTERVAL_MS);

  return () => clearInterval(timer);
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm build`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/cleanup.ts
git commit -m "feat: add periodic temp file cleanup"
```

---

### Task 6: Express app and routes

**Files:**
- Create: `src/app.ts`

- [ ] **Step 1: Create src/app.ts**

```typescript
import express, { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { mkdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { downloadFile, DownloadError } from './download';
import { convertToHtml, ConversionError } from './converter';
import { isFormatSupported } from './format';
import { request as httpRequest } from 'http';
import { get as httpsGet } from 'https';

/** 临时文件根目录 */
const TEMP_DIR = '/tmp/office-preview';

/** 通过 HEAD 请求获取 Content-Type */
const fetchContentType = (targetUrl: string): Promise<string | null> => {
  return new Promise((resolve) => {
    const protocol = targetUrl.startsWith('https') ? httpsGet : httpRequest;
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
    if (!isFormatSupported({ contentType, ext })) {
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm build`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app.ts
git commit -m "feat: add Express app with /preview and /files routes"
```

---

### Task 7: Entry point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create src/index.ts**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `pnpm build`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add server entry point"
```

---

### Task 8: Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY tsconfig.json ./
COPY src/ ./src/

RUN corepack enable && pnpm install --frozen-lockfile && pnpm build && pnpm prune --prod

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Commit**

```bash
git add Dockerfile
git commit -m "feat: add Dockerfile"
```

---

### Task 9: Build, run, and verify

- [ ] **Step 1: Build Docker image**

Run: `docker build -t office-preview .`
Expected: Image builds successfully.

- [ ] **Step 2: Run container**

Run: `docker run -d --name office-preview -p 3000:3000 office-preview`
Expected: Container starts, `docker logs office-preview` shows "listening on http://0.0.0.0:3000"

- [ ] **Step 3: Test with a sample .docx file**

Run: `curl -s "http://localhost:3000/preview?url=https://calibre-ebook.com/downloads/demos/demo.docx" | head -20`
Expected: Returns HTML content, not JSON error.

- [ ] **Step 4: Test missing url parameter**

Run: `curl -s "http://localhost:3000/preview"`
Expected: `{"error":"Missing required parameter: url"}` (HTTP 400)

- [ ] **Step 5: Test unsupported format**

Run: `curl -s "http://localhost:3000/preview?url=https://example.com/photo.jpg"`
Expected: JSON error with "Unsupported file format" (HTTP 400)

- [ ] **Step 6: Cleanup**

Run: `docker stop office-preview && docker rm office-preview`
