/**
 * 命令行选项解析
 * ----------------------------------------------------------------
 * 抽出独立模块的原因：覆盖率 CLI（coverage-report.ts）与归档门禁
 * （pre-archive.ts）都要读「带值选项」，而这两个入口历史上各写了一份
 * 解析逻辑——其中一份漏了等号形式，于是出现了一个隐蔽且危害很大的 bug：
 *
 *   `--run-report=x.json` 被静默忽略 → 运行时证据没加载 →
 *   条件跳过全被判成「未执行」→ 门禁误报 44 条**假缺口**。
 *
 * 更糟的是「看起来有道理」（跳过确实存在），排查成本极高。
 * 两处共用一份实现，从结构上杜绝「改了一处漏了另一处」。
 */

/**
 * 取带值选项的值，同时支持 `--opt value` 与 `--opt=value` 两种写法。
 *
 * @param name 选项名，**不含** `--` 前缀（如 "run-report"）
 * @param argv 参数数组（默认 process.argv.slice(2)）
 * @returns 选项值；未提供或值为空时返回 null
 */
export function optionValue(name: string, argv: string[] = process.argv.slice(2)): string | null {
  // 等号形式：--name=value
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) {
    const value = eq.slice(name.length + 3);
    return value.length > 0 ? value : null;
  }
  // 空格形式：--name value
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1]!.startsWith("--")) {
    return argv[idx + 1]!;
  }
  return null;
}

/** 判断开关型选项（无值）是否出现 */
export function hasFlag(name: string, argv: string[] = process.argv.slice(2)): boolean {
  return argv.includes(`--${name}`);
}
