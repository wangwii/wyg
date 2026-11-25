/**
 * 运行时执行证据
 * ----------------------------------------------------------------
 * 静态分析只能知道「这个 it 带了 `.skipIf(cond)`」，**不知道 cond 在某次运行里
 * 是真是假**。而「cond 为真」与否直接决定该 it 是否真的跑过——这正是
 * 「skip 不计入覆盖」能否安全转阻断的难点。
 *
 * 解法：让测试运行自己产出证据。
 *
 *   vitest run --reporter=json --outputFile=<report.json>
 *
 * 该报告逐条给出每个用例的最终 `status`（passed / failed / skipped / pending），
 * 以及所属文件与完整标题链（describe 链 + it 标题）。把它读进来，
 * 就能回答「这次运行里，这个 it 到底执行了没有」——**运行时事实，而非猜测**。
 *
 * 为什么不能只靠静态分析
 * ----------------------
 * 本仓库 32 处 skip **全部**是 `describe.skipIf(cond)`（无条件 `.skip` 只存在于
 * 测试自身的 fixture 里）。这些套件的真实状态完全取决于运行环境：
 *   - 集成套件（真库）：CI 起了 PGlite → **会执行**
 *   - 浏览器套件（dev server + Edge）：CI 不起 dev server → **永不执行**
 * 把两类一视同仁地判成「缺口」，就会在 CI 里误伤 46 个真实覆盖的场景；
 * 一视同仁地判成「覆盖」，则等于没修。只有运行时证据能区分。
 */
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

/** vitest JSON 报告里一条用例的结果 */
export type RunEvidence = {
  /** 源文件（相对仓库根，正斜杠） */
  file: string;
  /** it 标题原文 */
  title: string;
  /** 外层 describe 标题链（运行时值，含插值展开） */
  ancestors: string[];
  /** vitest 给出的最终状态 */
  status: string;
};

export type RunReport = {
  /** 读取的报告路径（相对仓库根） */
  reportPath: string;
  /** 全部用例的执行结果 */
  entries: RunEvidence[];
  /** 报告中出现的文件集合（正斜杠相对路径） */
  files: Set<string>;
  /** 统计：passed / failed / skipped / pending 计数 */
  counts: { passed: number; failed: number; skipped: number; pending: number; total: number };
};

/** vitest JSON 报告的最小结构（只取需要的字段） */
type VitestJsonReport = {
  testResults?: Array<{
    name?: string;
    assertionResults?: Array<{
      title?: string;
      fullName?: string;
      status?: string;
      ancestorTitles?: string[];
    }>;
  }>;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  numTotalTests?: number;
};

/**
 * 读取 vitest JSON 报告，转成「每个用例是否真的执行了」的证据集合。
 *
 * @param reportPath 报告文件路径（绝对或相对仓库根）
 * @param root 仓库根，用于把报告里的绝对路径转成相对路径
 * @throws 报告不存在 / 不是合法 JSON / 结构不符
 */
export function loadRunReport(reportPath: string, root: string): RunReport {
  const absolute = resolve(root, reportPath);
  if (!existsSync(absolute)) {
    throw new Error(`运行时报告不存在：${reportPath}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(absolute, "utf8"));
  } catch (err) {
    throw new Error(
      `运行时报告不是合法 JSON：${reportPath}（${err instanceof Error ? err.message : String(err)}）`,
      { cause: err }
    );
  }
  const doc = raw as VitestJsonReport;
  if (!Array.isArray(doc.testResults)) {
    throw new Error(`运行时报告缺少 testResults 数组：${reportPath}`);
  }

  const entries: RunEvidence[] = [];
  const files = new Set<string>();
  for (const suite of doc.testResults) {
    if (!suite.name) continue;
    const file = relative(root, resolve(suite.name)).replace(/\\/g, "/");
    files.add(file);
    for (const assertion of suite.assertionResults ?? []) {
      entries.push({
        file,
        title: assertion.title ?? "",
        ancestors: assertion.ancestorTitles ?? [],
        status: assertion.status ?? "unknown",
      });
    }
  }

  return {
    reportPath: reportPath.replace(/\\/g, "/"),
    entries,
    files,
    counts: {
      passed: doc.numPassedTests ?? 0,
      failed: doc.numFailedTests ?? 0,
      skipped: doc.numPendingTests ?? 0,
      pending: doc.numPendingTests ?? 0,
      total: doc.numTotalTests ?? entries.length,
    },
  };
}

/**
 * 该用例在这次运行里**真的执行了**吗？
 *
 * vitest 的 `status` 取值：`passed` / `failed` 表示跑了（失败也算跑了——那是
 * 另一个问题，由 `pnpm test` 负责）；`skipped` / `pending` / `todo` 表示没跑。
 */
export function didExecute(status: string): boolean {
  return status === "passed" || status === "failed";
}

/**
 * 把运行报告索引成「文件 + it 标题 → 状态列表」的查表。
 *
 * **为什么用「文件 + it 标题」而不是 vitest 的 `fullName`**：
 * `fullName` 含 describe 链的**运行时值**，而 describe 标题常带插值
 * （如 `` 基准年审批流端到端（${availability.reason}） ``）——
 * 静态解析拿不到那个插值后的字符串，两边对不上，实测 122 个条件跳过作用域
 * 会全部落到「不可判定」。
 *
 * it 标题则稳定（实测 122/122 全部命中）。同名 it 在同一文件里出现多次极少
 * （1369 个组合里只有 2 个），故按列表存全部候选，取「任一执行过即算执行过」——
 * 保守方向正确：宁可认为跑过，也不要误判成缺口。
 */
export function indexRunReport(report: RunReport): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const entry of report.entries) {
    const key = `${entry.file} ${entry.title}`;
    const list = index.get(key);
    if (list) list.push(entry.status);
    else index.set(key, [entry.status]);
  }
  return index;
}
