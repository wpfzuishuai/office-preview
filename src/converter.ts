import { execa } from 'execa';

/** LibreOffice 转换超时时间（ms） */
const CONVERSION_TIMEOUT_MS = 60000;

interface IConvertToPdfParams {
  /** 输入文件路径 */
  inputPath: string;
  /** 输出目录路径 */
  outputDir: string;
}

/** 使用 LibreOffice headless 将 Office 文件转为 PDF */
export const convertToPdf = async ({ inputPath, outputDir }: IConvertToPdfParams): Promise<void> => {
  await execa('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outputDir, inputPath], {
    timeout: CONVERSION_TIMEOUT_MS,
  });
};
