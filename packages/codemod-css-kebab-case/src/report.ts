/**
 * 报告生成器
 *
 * 支持 markdown 和 json 两种格式，按文件分组，不含 diff。
 */

import type {
  ChangeEntry,
  FailureEntry,
  RewrittenFile,
  SkipEntry,
} from './types.js';

/** 报告格式 */
export type ReportFormat = 'md' | 'json';

/** 报告数据结构（JSON 格式输出） */
export interface ReportData {
  /** 统计摘要 */
  summary: {
    /** 扫描文件数 */
    scannedFiles: number;
    /** 改动文件数 */
    changedFiles: number;
    /** 转换类名数 */
    changes: number;
    /** 跳过项数 */
    skips: number;
    /** 失败项数 */
    failures: number;
  };
  /** 按文件分组的改动 */
  changesByFile: Array<{
    file: string;
    changes: ChangeEntry[];
  }>;
  /** 跳过项 */
  skips: SkipEntry[];
  /** 失败项 */
  failures: FailureEntry[];
}

/**
 * 构建 ReportData
 *
 * @param files - 改写结果列表
 * @param skips - 跳过项
 * @param failures - 失败项
 */
export function buildReportData(
  files: RewrittenFile[],
  skips: SkipEntry[],
  failures: FailureEntry[],
): ReportData {
  const changedFiles = files.filter((f) => f.changed);
  const allChanges = files.flatMap((f) => f.changes);

  return {
    summary: {
      scannedFiles: files.length,
      changedFiles: changedFiles.length,
      changes: allChanges.length,
      skips: skips.length,
      failures: failures.length,
    },
    changesByFile: changedFiles.map((f) => ({
      file: f.file,
      changes: f.changes,
    })),
    skips,
    failures,
  };
}

/**
 * 生成报告
 *
 * @param data - 报告数据
 * @param format - 格式（md 或 json）
 * @returns 报告字符串
 */
export function generateReport(data: ReportData, format: ReportFormat): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }
  return generateMarkdown(data);
}

/**
 * 生成 Markdown 报告
 */
export function generateMarkdown(data: ReportData): string {
  const lines: string[] = [];

  // 标题
  lines.push('# CSS Kebab Codemod Report');
  lines.push('');

  // 摘要
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Scanned: ${data.summary.scannedFiles} files`);
  lines.push(
    `- To change: ${data.summary.changedFiles} files (${data.summary.changes} class names)`,
  );
  lines.push(`- Skipped: ${data.summary.skips} items`);
  lines.push(`- Failures: ${data.summary.failures} items`);
  lines.push('');

  // 按文件分组的改动
  if (data.changesByFile.length > 0) {
    lines.push('## Changes by File');
    lines.push('');

    for (const fileGroup of data.changesByFile) {
      lines.push(`### ${fileGroup.file}`);
      lines.push('');
      lines.push('| Location | Original | Converted | Kind |');
      lines.push('|----------|----------|-----------|------|');

      for (const change of fileGroup.changes) {
        const loc = `L${change.line}:C${change.column}`;
        lines.push(
          `| ${loc} | \`${change.from}\` | \`${change.to}\` | ${change.kind} |`,
        );
      }
      lines.push('');
    }
  }

  // 跳过项
  if (data.skips.length > 0) {
    lines.push('## Skipped');
    lines.push('');

    lines.push('| Location | Snippet | Reason | Message |');
    lines.push('|----------|---------|--------|---------|');

    for (const skip of data.skips) {
      const loc = `${skip.file}:L${skip.line}:C${skip.column}`;
      lines.push(
        `| ${loc} | \`${skip.snippet}\` | ${skip.reason} | ${skip.message} |`,
      );
    }
    lines.push('');
  }

  // 失败项
  if (data.failures.length > 0) {
    lines.push('## Failures');
    lines.push('');

    lines.push('| Location | Class | Message |');
    lines.push('|----------|-------|---------|');

    for (const failure of data.failures) {
      const loc = `${failure.file}:L${failure.line}:C${failure.column}`;
      lines.push(
        `| ${loc} | \`${failure.className ?? '-'}\` | ${failure.message} |`,
      );
    }
    lines.push('');
  } else {
    lines.push('## Failures');
    lines.push('');
    lines.push('- (none)');
    lines.push('');
  }

  return lines.join('\n');
}
