/** 临时文件根目录（/dev/shm 为内存文件系统） */
export const TEMP_DIR = '/dev/shm/office-preview';
/** 服务端口 */
export const PORT = 3000;
/** 最大并发转换数 */
export const MAX_CONCURRENT_CONVERSIONS = 2;
/** pdf.js CDN 地址 */
export const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
/** pdf.js Worker CDN 地址 */
export const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
/** LRU 缓存最大容量（512MB） */
export const MAX_CACHE_SIZE = 512 * 1024 * 1024;
/** LRU 缓存目录（/dev/shm 为内存文件系统） */
export const CACHE_DIR = '/dev/shm/office-preview-cache';
