/**
 * SDD 覆盖率分析核心
 * ----------------------------------------------------------------
 * 把「场景 → 测试」的匹配逻辑从 CLI 壳里抽出来，供两处复用：
 *
 *   - scripts/sdd/coverage-report.ts   （命令行入口，人类可读报告 + JSON）
 *   - scripts/sdd/pre-archive.ts       （归档前门禁，需要结构化统计）
 *
 * 抽成独立模块的理由：pre-archive 需要「weak / skipped 的**计数**」才能决定
 * 是否阻断，而 CLI 入口只负责打印。两者若挤在一个文件里，pre-archive 就得
 * 去解析 CLI 的文本输出——那种耦合在改一次报告格式时必然断。
 *
 * 语义（v4）：名义覆盖 vs 执行覆盖
 * --------------------------------
 *   - **名义覆盖（nominal）**：场景名出现在某个 it 作用域里就算数（含被跳过的
 *     it）。这是 v3 沿用的口径，也是「覆盖率 100%」这个信号的来源。
 *   - **执行覆盖（executed）**：只认**真正会执行**的 it。
 *
 * 三个口径的判定依据：
 *
 *   1. **无条件跳过**（`describe.skip` / `it.skip`）—— 永远不执行，算缺口。
 *   2. **未跳过** —— 会执行。
 *   3. **条件跳过**（`describe.skipIf`）—— **本项目禁止**：覆盖率必须是确定事实，
 *      不能随运行环境变化。analyzeCoverage 检测到即抛错。
 *
 * 弱断言（weak）
 * --------------
 *   it 体内**没有**一条「强断言方法 + 非条件包裹」的 expect 时，该 it 被标为 weak：
 *   - no-expect            体内一条 expect 都没有（空语句充当断言）
 *   - weak-only            expect 都在，但全是弱断言方法
 *   - conditional-only     expect 都在，但全被条件包裹（可能根本不执行）
 *   - weak-and-conditional 强断言全被条件挡住，裸奔的反而只有弱断言
 *
 * weak 默认**只警告不阻断**；`--strict-assertions` 可转阻断（tasks 3.3）。
 */
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseTestScopes, type TestScope, type SkipKind } from "./test-scope-parser";
import { loadRunReport, indexRunReport, didExecute, type RunReport } from "./run-report";

export type Scenario = {
  source: string;
  requirement: string;
  scenario: string;
};

/**
 * 作用域的执行状态（三态）
 *
 *   - `executed`    确定执行过
 *   - `not-executed` 确定没执行（无条件跳过，或运行时报告里状态是 skipped）
 *   - `undetermined` 不可判定（条件跳过且无运行时证据）
 */
export type ExecutionState = "executed" | "not-executed" | "undetermined";

/** 报告里用到的测试作用域摘要 */
export type ScopeSummary = {
  file: string;
  line: number;
  itTitle: string;
  describes: string[];
  /** 该作用域的跳过性质 */
  skip: SkipKind;
  /** 弱断言成因；null = 强断言齐备 */
  weak: { kind: string; reason: string; expectCount: number } | null;
  /**
   * 运行时是否真的执行过。
   *   - `true`  执行过
   *   - `false` 没执行（被跳过）
   *   - `null`  不可判定（无运行时证据，且是条件跳过）
   */
  executed: boolean | null;
  /** 三态执行状态（比 executed 更精确：区分「确定没跑」与「不可判定」） */
  execution: ExecutionState;
};

/** 「名义上被覆盖、实际从未执行」的场景 */
export type SkippedScenario = Scenario & {
  /** 是哪些作用域名义上覆盖了它（定位「谁跳过了它」） */
  skippedBy: ScopeSummary[];
};

export type CoverageOptions = {
  /** 精确统计指定变更的 delta 场景 */
  changeId?: string | null;
  /** 同时统计全部进行中变更的 delta 场景 */
  includeChanges?: boolean;
  /** 测试目录，默认 tests/ */
  testsDir?: string;
  /** 项目根，默认 process.cwd() */
  root?: string;
  /** 运行时报告路径（vitest --reporter=json 的输出）；提供后才有执行口径的确定性 */
  runReport?: string | null;
};

export type CoverageResult = {
  /** 全部参与统计的场景 */
  scenarios: Scenario[];
  /** 名义覆盖（v3 口径：含被跳过的 it） */
  nominalCovered: Scenario[];
  /** 名义未覆盖 */
  nominalMissing: Scenario[];
  /** 执行覆盖（只认真正会执行的 it；有运行时证据时才是确定值） */
  executedCovered: Scenario[];
  /** 执行未覆盖 */
  executedMissing: Scenario[];
  /**
   * 「名义上被覆盖、实际从未执行」的场景。
   * = 执行未覆盖 减去 名义未覆盖，再扣掉「不可判定」的那部分。
   *
   * 只有**确定**没执行（无条件跳过，或运行时报告里状态是 skipped）才算。
   * 「不可判定」（条件跳过 + 无运行时证据）单列在 undeterminedScenarios，
   * 不据此判缺口——否则会把环境差异误判成没测试。
   */
  skippedOnly: SkippedScenario[];
  /**
   * 「名义上被覆盖、但覆盖它的作用域执行状态不可判定」的场景。
   *
   * 出现这个集合说明**缺少运行时证据**（没传 --run-report），
   * 或该场景的测试文件没进这次运行。它不是缺口，是「判不出来」——
   * 报告里单列可见，提示补运行时报告。
   */
  undeterminedScenarios: SkippedScenario[];
  /** 被跳过的测试作用域 */
  skippedScopes: ScopeSummary[];
  /** 弱断言的测试作用域 */
  weakScopes: ScopeSummary[];
  /** 参与扫描的测试文件数 */
  testFileCount: number;
  /** 运行时证据（未提供时为 null） */
  runReport: RunReport | null;
};

function listMarkdown(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...listMarkdown(full));
    else if (s.isFile() && full.endsWith(".md") && !full.endsWith("README.md")) out.push(full);
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitHeadings(
  content: string,
  level: number,
  prefix: string
): { heading: string; body: string }[] {
  const hashes = "#".repeat(level);
  const regex = new RegExp(`^${hashes}\\s+${escapeRegex(prefix)}.*$`, "gm");
  const matches = Array.from(content.matchAll(regex));
  if (matches.length === 0) return [];
  const blocks: { heading: string; body: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = (m.index ?? 0) + m[0].length;
    const next = matches[i + 1];
    const end = next ? (next.index ?? content.length) : content.length;
    blocks.push({
      heading: m[0].replace(new RegExp(`^${hashes}\\s+`), "").trim(),
      body: content.slice(start, end).trim(),
    });
  }
  return blocks;
}

function stripPrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length).trim() : s.trim();
}

function extractScenarios(specFile: string, root: string): Scenario[] {
  const rel = relative(root, specFile);
  const content = readFileSync(specFile, "utf8");
  const out: Scenario[] = [];
  for (const req of splitHeadings(content, 3, "Requirement:")) {
    const reqName = stripPrefix(req.heading, "Requirement:");
    for (const sc of splitHeadings(req.body, 4, "Scenario:")) {
      out.push({
        source: rel,
        requirement: reqName,
        scenario: stripPrefix(sc.heading, "Scenario:"),
      });
    }
  }
  return out;
}

function collectTestFiles(testsDir: string, root: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  if (!existsSync(testsDir)) return out;
  const walk = (d: string): void => {
    for (const e of readdirSync(d)) {
      const full = join(d, e);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else if (s.isFile() && /\.(test|spec)\.ts$/.test(e)) {
        out.push({ file: relative(root, full), text: readFileSync(full, "utf8") });
      }
    }
  };
  walk(testsDir);
  return out;
}

// 归一化：小写；把非 [a-z0-9\u4e00-\u9fa5] 的字符（标点、空白、括号等）统一成空格。
// 关键点：保留 CJK（中文）。旧逻辑用 [^a-z0-9]+，会把「无权限用户更新租户」整段中文
// 归一化成空串，最终只能靠括号里的英文标识符（如 forbidden）命中——这正是弱匹配 bug 的根因。
export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, " ");
}

/** 场景的匹配锚点：需求名 + 场景名（归一化后非空的部分） */
function needlesOf(sc: Scenario): string[] {
  return [normalize(sc.requirement), normalize(sc.scenario)].filter((n) => n.trim().length > 0);
}

/**
 * 覆盖判定（v3 行为，v4 保留为「名义覆盖」）：
 *   一个场景被覆盖 ⇔ 存在某个 it 作用域，其内**同时**含「需求名」与「场景名」两者的归一化原文。
 *   - 作用域 = 该 it 的外层 describe 链 + it 标题 + it 体（按 AST 解析，注释天然不计入）；
 *   - 用 every 要求「两者都要匹配」（旧逻辑用 some，任一命中即算，与规范相悖）；
 *   - 中文保留，避免「无权限用户更新租户」被归一化为空而只能靠 forbidden 命中。
 */
export function isCovered(sc: Scenario, scopes: string[]): boolean {
  const needles = needlesOf(sc);
  if (needles.length === 0) return false;
  return scopes.some((scope) => needles.every((needle) => scope.includes(needle)));
}

/**
 * 该作用域在这次运行里是否真的执行了。
 *
 * 三种判定：
 *   - 无运行时证据 + 未跳过        → `true`（必然执行）
 *   - 无运行时证据 + 无条件跳过    → `false`（永不执行）
 *   - 无运行时证据 + 条件跳过      → `null`（不可判定）
 *   - 有运行时证据                → 按报告里的 status 判定（passed/failed = 执行过）
 */
function executedOf(
  scope: TestScope,
  statusIndex: Map<string, string[]> | null,
  posixFile: string
): boolean | null {
  if (statusIndex) {
    const statuses = statusIndex.get(`${posixFile} ${scope.itTitle}`);
    // 报告里找不到这个用例 → 它所在的文件没进这次运行（或标题对不上）→ 不可判定
    if (!statuses) return scope.skip === "none" ? true : null;
    // 同名 it 可能有多个候选（极少），任一执行过即算执行过
    return statuses.some(didExecute);
  }
  if (scope.skip === "none") return true;
  if (scope.skip === "unconditional") return false;
  return null;
}

/** 由布尔执行标记推导三态执行状态 */
function executionStateOf(executed: boolean | null): ExecutionState {
  if (executed === true) return "executed";
  if (executed === false) return "not-executed";
  return "undetermined";
}

/**
 * 收集参与统计的场景。
 *
 * 主规范基线 openspec/specs/ 始终参与校验；delta 场景按调用方指定的范围追加。
 */
export function collectScenarios(opts: CoverageOptions): Scenario[] {
  const root = resolve(opts.root ?? process.cwd());
  const specsDir = join(root, "openspec", "specs");
  const changesDir = join(root, "openspec", "changes");
  const archiveDir = join(changesDir, "archive");

  let scenarios: Scenario[] = listMarkdown(specsDir).flatMap((f) => extractScenarios(f, root));

  if (opts.changeId) {
    const full = join(changesDir, opts.changeId);
    if (!existsSync(full) || !statSync(full).isDirectory()) {
      throw new Error(`变更不存在: ${opts.changeId}`);
    }
    const specsSubdir = join(full, "specs");
    if (existsSync(specsSubdir)) {
      scenarios = scenarios.concat(
        listMarkdown(specsSubdir).flatMap((f) => extractScenarios(f, root))
      );
    }
  } else if (opts.includeChanges && existsSync(changesDir)) {
    for (const entry of readdirSync(changesDir)) {
      const full = join(changesDir, entry);
      if (!statSync(full).isDirectory() || full === archiveDir) continue;
      const specsSubdir = join(full, "specs");
      if (!existsSync(specsSubdir)) continue;
      scenarios = scenarios.concat(
        listMarkdown(specsSubdir).flatMap((f) => extractScenarios(f, root))
      );
    }
  }

  return scenarios;
}

/**
 * 执行一次覆盖率分析。
 *
 * @throws 变更不存在（仅 --change 模式）/ 运行时报告不可读 / 测试中存在 skipIf
 */
export function analyzeCoverage(opts: CoverageOptions): CoverageResult {
  const root = resolve(opts.root ?? process.cwd());
  const testsDir = opts.testsDir ?? join(root, "tests");

  const scenarios = collectScenarios(opts);
  const tests = collectTestFiles(testsDir, root);

  // 运行时证据（可选）：用于核对 skip 作用域与测试文件是否真的进入本次运行
  const runReport = opts.runReport ? loadRunReport(opts.runReport, root) : null;
  const statusIndex = runReport ? indexRunReport(runReport) : null;

  // 解析每个测试文件的 describe/it 结构 → 测试作用域（外层 describe 链 + it 标题 + it 体）
  const parsed: TestScope[] = [];
  for (const t of tests) {
    parsed.push(...parseTestScopes(t.file, t.text));
  }

  /**
   * 条件跳过（`skipIf`）一律拒绝。
   *
   * 覆盖率是强事实：同一个场景在不同环境下"算不算覆盖"不能变。
   * 一旦允许条件跳过，门禁就能被 `it.skipIf(true)` 绕过——那和豁免表是同一个口子。
   * 环境依赖正确的做法是先修环境，而不是让测试有条件地不跑。
   */
  const conditionalSkips = parsed.filter((s) => s.skip === "conditional");
  if (conditionalSkips.length > 0) {
    const detail = conditionalSkips.map(
      (s) => `  - ${s.file}:${s.line}  ${[...s.describes, s.itTitle].join(" › ")}`
    );
    throw new Error(
      `检测到 ${conditionalSkips.length} 处条件跳过（skipIf），本项目禁止使用：\n` +
        detail.join("\n") +
        "\n请改为无条件执行；若确实依赖环境，先补齐环境再跑测试。"
    );
  }

  // 每个作用域的执行状态
  const executedFlags = new Map<TestScope, boolean | null>();
  for (const scope of parsed) {
    const posix = scope.file.replace(/\\/g, "/");
    executedFlags.set(scope, executedOf(scope, statusIndex, posix));
  }

  /** 名义口径：所有作用域（含被跳过的） */
  const nominalTexts = parsed.map((s) => normalize(s.scope));
  /**
   * 执行口径：只认「确定执行过」的作用域。
   * 无运行时证据时，条件跳过的作用域 `executed === null`（不可判定）→ **不计入**，
   * 因为「可能没跑」就不能算覆盖——这与 proposal 的语义一致，且报告里单列可见。
   */
  const executedScopes = parsed.filter((s) => executedFlags.get(s) === true);
  const executedTexts = executedScopes.map((s) => normalize(s.scope));

  const nominalMissing = scenarios.filter((sc) => !isCovered(sc, nominalTexts));
  const executedMissing = scenarios.filter((sc) => !isCovered(sc, executedTexts));
  const nominalCovered = scenarios.filter((sc) => isCovered(sc, nominalTexts));
  const executedCovered = scenarios.filter((sc) => isCovered(sc, executedTexts));

  const nominalMissingKeys = new Set(nominalMissing.map(scenarioKey));

  /**
   * 把「名义已覆盖、执行未覆盖」的场景按执行证据强度分成两类。
   *
   * 这两类必须分开，因为它们对门禁的意义完全相反：
   *
   *   - **确定未执行**（skippedOnly）：所有能覆盖它的作用域都**确定**没跑
   *     → 这是真实缺口，可以据此阻断。
   *   - **不可判定**（undeterminedScenarios）：覆盖它的作用域状态是
   *     「不可判定」（条件跳过 + 无运行时证据）
   *     → 静态分析无法判定，**不能**据此阻断——那会把「环境差异」误判成「没测试」。
   *
   * 若把两者混在一起（早期实现就是），第一阶段在没有运行时证据时
   * 会凭空多出几十条「假缺口」。
   */
  const splitByEvidence = (
    list: typeof executedMissing
  ): { skipped: SkippedScenario[]; undetermined: SkippedScenario[] } => {
    const skipped: SkippedScenario[] = [];
    const undetermined: SkippedScenario[] = [];
    for (const sc of list) {
      if (nominalMissingKeys.has(scenarioKey(sc))) continue;
      const needles = needlesOf(sc);
      // 名义上覆盖它、但没有执行过的作用域
      const covering = parsed.filter((s) => needles.every((n) => normalize(s.scope).includes(n)));
      const notExecuted = covering.filter((s) => executedFlags.get(s) !== true);
      const summary = notExecuted.map((s) => summarize(s, executedFlags.get(s) ?? null));
      const hasDeterminedNotExecuted = notExecuted.some(
        (s) => executionStateOf(executedFlags.get(s) ?? null) === "not-executed"
      );
      const entry = { ...sc, skippedBy: summary };
      if (hasDeterminedNotExecuted) skipped.push(entry);
      else undetermined.push(entry);
    }
    return { skipped, undetermined };
  };

  const { skipped: skippedOnly, undetermined: undeterminedScenarios } =
    splitByEvidence(executedMissing);

  return {
    scenarios,
    nominalCovered,
    nominalMissing,
    executedCovered,
    executedMissing,
    skippedOnly,
    undeterminedScenarios,
    skippedScopes: parsed
      .filter((s) => s.skip !== "none")
      .map((s) => summarize(s, executedFlags.get(s) ?? null)),
    weakScopes: parsed
      .filter((s) => s.weak !== null)
      .map((s) => summarize(s, executedFlags.get(s) ?? null)),
    testFileCount: tests.length,
    runReport,
  };
}

function summarize(scope: TestScope, executed: boolean | null): ScopeSummary {
  return {
    file: scope.file,
    line: scope.line,
    itTitle: scope.itTitle,
    describes: scope.describes,
    skip: scope.skip,
    weak: scope.weak
      ? { kind: scope.weak.kind, reason: scope.weak.reason, expectCount: scope.weak.expectCount }
      : null,
    executed,
    execution: executionStateOf(executed),
  };
}

/** 场景的稳定标识（用于集合比较） */
export function scenarioKey(sc: Scenario): string {
  return `${sc.source}|${sc.requirement}|${sc.scenario}`;
}

/**
 * 判断场景是否属于指定变更的 delta，而不是主规范基线（openspec/specs/）。
 *
 * 用途：`--change <id>` 是归档前门禁，只应让**本次变更**的缺口阻断归档。
 * 主规范基线里的存量缺口由全量命令（`pnpm sdd:coverage` / `--changes`，
 * CI quality job）负责阻断——两处都阻断会让任何一次归档都被无关的存量债连坐。
 *
 * 这与 coverage-report.ts 里 `--require-executed` 的既有原则一致：
 * 「某个兄弟变更没写测试，不该让所有变更的归档都被卡住」。
 * 名义覆盖路径此前没做同样的分流，属于实现不对称，这里补上判定依据。
 *
 * 注意 source 在 Windows 下由 `relative()` 产出反斜杠，需先归一化。
 */
export function isChangeDeltaScenario(sc: Scenario, changeId: string): boolean {
  const prefix = `openspec/changes/${changeId}/specs/`;
  return sc.source.replace(/\\/g, "/").startsWith(prefix);
}

/**
 * `--change <id>` 模式下把名义缺口按作用域分流。
 *
 *   - blocking 本次变更 delta 的场景缺测试 → **阻断归档**（本次变更的责任）
 *   - baseline 主规范基线的存量缺口       → 只报告、不阻断
 *
 * 为什么不阻断基线：全量命令 `pnpm sdd:coverage` / `--changes`（CI quality job）
 * 始终按全部缺口阻断，存量债在那里可见、可追。归档门禁再判一次，只会让
 * 一个已完成变更因为无关能力域的历史缺口而无法归档——正是设计文档里
 * 反复禁止的「连坐」。没有 `--change` 时行为完全不变（全部阻断）。
 *
 * 放在 core 而非 CLI 壳里，是为了让这段判定可被单测直接覆盖
 * （CLI 入口顶层会 process.exit，无法 import）。
 */
export function splitMissingByScope(
  missing: Scenario[],
  changeId: string | null
): { blocking: Scenario[]; baseline: Scenario[] } {
  if (!changeId) return { blocking: missing, baseline: [] };
  return {
    blocking: missing.filter((sc) => isChangeDeltaScenario(sc, changeId)),
    baseline: missing.filter((sc) => !isChangeDeltaScenario(sc, changeId)),
  };
}
