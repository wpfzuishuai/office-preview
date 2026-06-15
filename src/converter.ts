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

interface IConvertParams {
  /** 输入文件路径 */
  inputPath: string;
  /** 输出目录路径 */
  outputDir: string;
  /** 输出格式 */
  format: 'html' | 'png';
}

/** 使用 LibreOffice headless 转换 Office 文件 */
const convert = ({ inputPath, outputDir, format }: IConvertParams): Promise<void> => {
  return new Promise((resolve, reject) => {
    const proc = spawn('soffice', [
      '--headless',
      '--convert-to', format,
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

interface IConvertToHtmlParams {
  /** 输入文件路径 */
  inputPath: string;
  /** 输出目录路径 */
  outputDir: string;
}

/** 使用 LibreOffice headless 将 Office 文件转为 HTML */
export const convertToHtml = ({ inputPath, outputDir }: IConvertToHtmlParams): Promise<void> => {
  return convert({ inputPath, outputDir, format: 'html' });
};

interface IConvertToImagesParams {
  /** 输入文件路径 */
  inputPath: string;
  /** 输出目录路径 */
  outputDir: string;
}

/** 使用 LibreOffice headless 将 Office 文件逐页转为 PNG 图片 */
export const convertToImages = ({ inputPath, outputDir }: IConvertToImagesParams): Promise<void> => {
  return convert({ inputPath, outputDir, format: 'png' });
};
