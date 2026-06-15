# Office Preview Service — Design Doc

## Summary

Office 文件预览服务。通过 URL 参数传入文件地址，使用 LibreOffice 转换为 HTML 后返回。整体打包为 Docker 镜像，单容器部署。

## Architecture

```
Client → Docker Container (Node.js + LibreOffice) → External File Server
```

单进程架构：Express HTTP 服务 + `child_process.spawn` 调用 LibreOffice headless 模式。

## API

### GET /preview

| Parameter | Required | Description |
|-----------|----------|-------------|
| `url`      | yes      | Source file URL |

**Flow:**

1. Parse `url` parameter
2. HEAD request to check Content-Type, reject non-Office formats
3. Stream download file to `/tmp/office-preview/<task-id>/`
4. `spawn` LibreOffice: `soffice --headless --convert-to html <input> --outdir <dir>`
5. Read the output HTML, replace resource paths with `/files/<task-id>/` prefix
6. Return HTML string; async cleanup of temp dirs older than 30 min

### GET /files/:taskId/*

Serve static assets (images, CSS) from the conversion output directory.

## Error Handling

| Scenario | Status | Response |
|----------|--------|----------|
| Missing `url` | 400 | `{ error: "..." }` |
| Unsupported format | 400 | `{ error: "..." }` |
| Download failed | 502 | `{ error: "..." }` |
| Conversion failed | 500 | `{ error: "..." }` |
| Timeout (30s) | 500 | `{ error: "..." }` |

## Supported Formats

doc, docx, xls, xlsx, ppt, pptx, odt, ods, odp

## Tech Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 22 |
| Framework | Express |
| HTTP client | native `http`/`https` |
| LibreOffice invocation | `child_process.spawn` |
| Temp dir | `/tmp/office-preview/` |
| Package manager | pnpm |
| Base image | `node:22-slim` + LibreOffice |

## Docker

Single stage: start from `node:22-slim`, apt install `libreoffice-writer libreoffice-calc libreoffice-impress`, copy source, run.

## Non-Goals

- Authentication / authorization
- Rate limiting
- Caching
- Horizontal scaling
