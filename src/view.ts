import { PDFJS_URL, PDFJS_WORKER_URL } from "./constants";

/** 生成 pdf.js 渲染预览 HTML 页面，PDF 以 base64 内嵌 */
export const buildPreviewHtml = (base64: string): string => {
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
<div class="pages" id="pagesContainer"><div class="loading">正在加载...</div></div>
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
