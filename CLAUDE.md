# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
docker build -t office-preview .
docker rm -f office-preview 2>/dev/null
docker run -d --name office-preview -p 3000:3000 office-preview
docker logs -f office-preview   # 查看日志
```

Base image: `node:22-slim` + `libreoffice-writer` + `libreoffice-calc` + `libreoffice-impress` + `fonts-noto-cjk`（中文渲染）。

## Architecture

Single-process Express HTTP service that converts Office files to PDF via LibreOffice headless, then renders the PDF inline in the browser using pdf.js (CDN).

```
GET /preview?url=<file-url>
  → HEAD request to check Content-Type
  → download file to /dev/shm/office-preview/<task-id>/
  → soffice --headless --convert-to pdf
  → embed PDF as base64 in HTML with pdf.js
  → clean up temp dir
```

### Source files

| File | Role |
|------|------|
| `src/index.ts` | Entry point — creates `/dev/shm/office-preview/`, starts Express on port 3000 |
| `src/app.ts` | Express app with the `/preview` route, content-type sniffing, and pdf.js HTML generation |
| `src/converter.ts` | Wraps `soffice` via `execa` (60s timeout) |
| `src/download.ts` | Downloads files from the given URL |
| `src/format.ts` | Content-Type validation (doc, docx, xls, xlsx, ppt, pptx, odt, ods, odp, csv) |
| `src/constants.ts` | Shared constants — `TEMP_DIR`, `PORT`, `MAX_CONCURRENT_CONVERSIONS` |

## Key details

- Package manager: **pnpm** (frozen lockfile)
- TypeScript: `strict: true`, target ES2022, CommonJS output to `dist/`
- Concurrency: max 2 simultaneous LibreOffice conversions (semaphore in `app.ts`)
- Temp files use `/dev/shm`（内存文件系统），仅在 Linux 容器内可用
- 无需本地安装 LibreOffice，所有依赖都在 Docker 镜像内
- No tests, no linting — this is a minimal service
- The design doc at `docs/superpowers/specs/` describes an older HTML-conversion approach; the service now uses PDF + pdf.js inline rendering
