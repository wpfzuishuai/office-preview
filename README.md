# office-preview

在线预览 Office 文件的轻量服务。通过 LibreOffice 将 Office 文件转为 PDF，再使用 pdf.js 在浏览器中渲染。

## 快速开始

```bash
docker build -t office-preview .
docker run -d --name office-preview -p 3000:3000 office-preview
```

打开浏览器访问：

```
http://localhost:3000/preview?url=<文件地址>
```

## 支持格式

| 类型 | 扩展名 |
|------|--------|
| Word | `.doc` `.docx` `.odt` |
| Excel | `.xls` `.xlsx` `.ods` `.csv` |
| PowerPoint | `.ppt` `.pptx` `.odp` |

## 镜像说明

基于 `node:22-slim`，额外安装：

- `libreoffice-writer` / `libreoffice-calc` / `libreoffice-impress` — Office 转 PDF
- `fonts-noto-cjk` — 中文等 CJK 字符渲染

## 工作流程

1. 对目标 URL 发起 HEAD 请求，检查 Content-Type 是否受支持
2. 下载文件到 `/dev/shm/office-preview/<task-id>/`（内存文件系统）
3. 调用 `soffice --headless --convert-to pdf` 转为 PDF
4. 将 PDF 以 base64 内嵌到 HTML 中，通过 pdf.js 渲染
5. 清理临时目录

## 本地开发

```bash
pnpm install
pnpm dev        # tsx 热重载
pnpm build      # 编译到 dist/
pnpm start      # 运行编译产物
```

本地开发需自行安装 LibreOffice。

## 限制

- 最多同时处理 2 个转换请求
- 单次转换超时 60 秒
- 临时目录 `/dev/shm` 仅在 Linux 容器内可用
