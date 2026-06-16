# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Commands

```bash
pnpm install          # 安装依赖
pnpm build            # 编译 TypeScript → dist/
pnpm start            # 运行编译产物

# Docker
docker build -t office-preview .
docker rm -f office-preview 2>/dev/null
docker run -d --name office-preview -p 3000:3000 office-preview
docker logs -f office-preview
```

## Architecture

Single-process Express HTTP service. Office files → LibreOffice headless → PDF → pdf.js inline rendering.

```
GET /preview?url=<file-url>
  → HEAD request (check Content-Type)
  → download to /dev/shm/office-preview/<task-id>/
  → soffice --headless --convert-to pdf (60s timeout, semaphore-limited)
  → embed as base64 HTML with pdf.js
  → clean up temp dir
```

### Source files

| File               | Role                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------- |
| `src/index.ts`     | Entry point — creates temp dir, starts Express on port 3000                             |
| `src/app.ts`       | Express app: `/preview` route, content-type sniffing, pdf.js HTML generation, semaphore |
| `src/converter.ts` | Wraps `soffice` via `execa` (60s timeout)                                               |
| `src/download.ts`  | Downloads files from the given URL                                                      |
| `src/format.ts`    | Content-Type validation (doc, docx, xls, xlsx, ppt, pptx, odt, ods, odp, csv)           |
| `src/constants.ts` | Shared constants: `TEMP_DIR`, `PORT`, `MAX_CONCURRENT_CONVERSIONS`                      |

## Key details

- **Package manager**: pnpm (frozen lockfile)
- **TypeScript**: `strict: true`, target ES2022, CommonJS output to `dist/`
- **Concurrency**: max 2 simultaneous LibreOffice conversions (promise-based semaphore)
- **Temp files**: `/dev/shm` (tmpfs), Linux container only
- **Base image**: `node:22-slim` + libreoffice-writer/calc/impress + fonts-noto-cjk
- **No tests / linting** — minimal service
- **Deprecated spec**: `docs/superpowers/specs/` describes an older HTML-conversion approach; now uses PDF + pdf.js
