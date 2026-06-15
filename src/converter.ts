import { spawn } from 'child_process';

/** 转换失败错误 */
export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversionError';
  }
}

/** LibreOffice 转换超时时间（ms） */
const CONVERSION_TIMEOUT_MS = 60000;

interface ISpawnParams {
  /** 命令 */
  cmd: string;
  /** 命令参数 */
  args: string[];
}

/** 执行命令并返回 Promise */
const runCommand = ({ cmd, args }: ISpawnParams): Promise<void> => {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);

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
        reject(new ConversionError(`${cmd} exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new ConversionError(`Failed to start ${cmd}: ${err.message}`));
    });
  });
};

interface IConvertToPdfParams {
  /** 输入文件路径 */
  inputPath: string;
  /** 输出目录路径 */
  outputDir: string;
}

/** 使用 LibreOffice headless 将 Office 文件转为 PDF */
export const convertToPdf = ({ inputPath, outputDir }: IConvertToPdfParams): Promise<void> => {
  return runCommand({
    cmd: 'soffice',
    args: ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, inputPath],
  });
};

interface IPdfToImagesParams {
  /** PDF 文件路径 */
  pdfPath: string;
  /** 输出目录路径 */
  outputDir: string;
}

/** 使用 pdftoppm 将 PDF 逐页转为 PNG 图片，命名格式：page-1.png, page-2.png */
export const pdfToImages = ({ pdfPath, outputDir }: IPdfToImagesParams): Promise<void> => {
  return runCommand({
    cmd: 'pdftoppm',
    args: ['-png', '-scale-to', '1920', pdfPath, `${outputDir}/page`],
  });
};
