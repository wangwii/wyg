#!/usr/bin/env node
/**
 * SDD 场景 → 测试 覆盖率报告
 * --------------------------
 * 扫描 `openspec/specs/` 下所有 GIVEN/WHEN/THEN 场景，检查 `tests/` 下是否存在
 * 引用了该场景名的测试用例，输出覆盖率并在有未覆盖场景时以非 0 退出。
 *
 * 匹配规则（v3 · 行为覆盖，而非引用覆盖）：
 *   1. 用 TypeScript AST 解析 describe/it 结构（脚本见同目录 test-scope-parser.ts）；
 *      注释不计入作用域（AST 的 trivia 不参与 getText()），
 *      正则字面量里的引号也不会干扰结构识别；
 *   2. 把每个 `it` 与其外层 describe 链、it 标题、it 体拼成一个「测试作用域」；
 *   3. 场景名与需求名做归一化（小写 + 非 [a-z0-9\u4e00-\u9fa5] 转空格，**保留中文/CJK**）；
 *   4. 一个场景算「覆盖」当且仅当：存在某个 it 作用域，其内**同时**含需求名原文与场景名原文
 *      （every，而非 some）—— 单靠 describe 名、单靠 it 名、或注释里的只言片语都不算。
 *
 * v2 → v3 的原因：v2 的手写字符扫描器不识别正则字面量，
 * `/"([^"]+)"/g` 会让扫描器的「是否在字符串内」状态错位，
 * 把本该属于某个 describe 的 it 挂到别的 describe 链上，产生**假缺失**。
 * 详见 scripts/sdd/test-scope-parser.ts 顶部说明。
 *
 * v4 · 名义覆盖 vs 执行覆盖 + 存根断言检测
 * -----------------------------------------
 * v3 的「覆盖率 100%」是个**不可信**的信号：它只看名字匹配，不看断言是否存在，
 * 也不看那个 it 到底会不会执行。v4 因此同时给出四个数字：
 *
 *   名义覆盖（nominal）  场景名出现在某个 it 作用域里（含被跳过的 it）—— v3 口径
 *   执行覆盖（executed）  只认**真正执行过**的 it
 *   已跳过（skipped）    「名义上被覆盖、实际从未执行」的场景 ← v3 把它们当成了 100%
 *   弱断言（weak）        it 体内没有一条「强断言方法 + 非条件包裹」的 expect
 *
 * 「执行覆盖」怎么判定「真的执行过」——两档依据：
 *
 *   1. **无条件跳过**（`.skip`）        永远不执行 → 静态即可判定 → 算缺口
 *   2. **未跳过**                      会执行     → 静态即可判定 → 算覆盖
 *
 * **条件跳过（`.skipIf`）被禁止**：检测到即以退出码 2 报错并列出位置。
 * 覆盖率必须是确定事实，不能因为环境差异时绿时红；环境问题应先修环境。
 *
 * 选项：
 *   --changes            同时统计进行中变更的 delta 场景（全部进行中变更）
 *   --change <id>        只追加该变更的 delta 场景，且**只按 delta 缺口阻断**（用于 pre-archive，
 *                        避免主规范基线的存量缺口把本次归档连坐）。主规范基线仍照常扫描、
 *                        照常列出缺口，由全量命令与 CI 门禁负责阻断。
 *   --json               以 JSON 输出，便于 CI 消费
 *   --tests <dir>        指定测试目录（默认 tests/）
 *   --run-report <file>  vitest JSON 报告（--reporter=json 的输出）→ 提供运行时证据
 *   --require-executed   按**执行覆盖**判定并阻断（第二阶段）；默认仍按名义覆盖
 *   --strict-assertions  存在弱断言即以非 0 退出（默认只警告）
 *
 * Usage:
 *   pnpm sdd:coverage
 *   tsx scripts/sdd/coverage-report.ts --changes
 *   tsx scripts/sdd/coverage-report.ts --change add-approval-approver-binding-notify
 *   tsx scripts/sdd/coverage-report.ts --run-report vitest-report.json --require-executed
 */
import { resolve, join } from "node:path";
import {
  analyzeCoverage,
  splitMissingByScope,
  type CoverageResult,
  type Scenario,
} from "./coverage-core";
import { optionValue as cliOptionValue } from "./cli-args";

const ROOT = resolve(process.cwd());

const argv = process.argv.slice(2);
const INCLUDE_CHANGES = argv.includes("--changes");
const AS_JSON = argv.includes("--json");
const STRICT_ASSERTIONS = argv.includes("--strict-assertions");
const REQUIRE_EXECUTED = argv.includes("--require-executed");
const CHANGE_ID = argv.includes("--change") ? (argv[argv.indexOf("--change") + 1] ?? null) : null;
const testsIdx = argv.indexOf("--tests");
const TESTS_DIR =
  testsIdx >= 0 && argv[testsIdx + 1] ? resolve(ROOT, argv[testsIdx + 1]!) : join(ROOT, "tests");

/**
 * 取带值选项的值，同时支持 `--opt value` 与 `--opt=value` 两种写法。
 *
 * 只认 `--opt value` 的话，`--run-report=x.json` 会被静默忽略——
 * 报告里就表现为「运行时证据：无」，而门禁**看起来**正常通过。
 * 这种「参数没生效但结果看起来对」的失败模式比报错更难查，故两种写法都支持。
 *
 * 实现见 cli-args.ts（与 pre-archive.ts 共用一份，避免改一处漏一处）。
 */
function optionValue(name: string): string | null {
  return cliOptionValue(name, argv);
}

const RUN_REPORT = optionValue("run-report");

function scenarioLine(sc: Scenario): string {
  return `  - [${sc.source}] Requirement="${sc.requirement}" Scenario="${sc.scenario}"`;
}

function printScenarioSection(title: string, scenarios: Scenario[]): void {
  if (scenarios.length === 0) return;
  console.log("");
  console.log(`${scenarios.length} 个${title}：`);
  for (const sc of scenarios) console.log(scenarioLine(sc));
}

function printSkippedSection(result: CoverageResult): void {
  if (result.skippedOnly.length === 0) return;
  console.log("");
  console.log(
    `${result.skippedOnly.length} 个场景「名义上被覆盖、实际从未执行」（被 skip 吃掉）：`
  );
  for (const sc of result.skippedOnly) {
    console.log(scenarioLine(sc));
    for (const by of sc.skippedBy) {
      const state =
        by.execution === "not-executed"
          ? "确定未执行"
          : by.execution === "executed"
            ? "已执行"
            : "不可判定（运行时状态未知）";
      console.log(`      ↳ ${by.file}:${by.line}  ${by.itTitle}  [${state}]`);
    }
  }
}

function printUndeterminedSection(result: CoverageResult): void {
  if (result.undeterminedScenarios.length === 0) return;
  console.log("");
  console.log(
    `${result.undeterminedScenarios.length} 个场景「覆盖状态不可判定」（测试未出现在本次运行报告中）：`
  );
  for (const sc of result.undeterminedScenarios) {
    console.log(scenarioLine(sc));
  }
  console.log(
    "  这些场景**不是缺口**——它们有测试，只是无法静态判定是否执行过。" +
      "提供运行时报告可得到确定结论：--run-report <vitest json>"
  );
}

function printWeakSection(result: CoverageResult): void {
  if (result.weakScopes.length === 0) return;
  console.log("");
  console.log(`${result.weakScopes.length} 处弱断言（it 体内没有可验证的强断言）：`);
  for (const w of result.weakScopes) {
    const chain = [...w.describes, w.itTitle].join(" › ");
    console.log(`  - ${w.file}:${w.line}  ${chain}`);
    console.log(`      ${w.weak!.reason}`);
  }
}

function main(): number {
  let result: CoverageResult;
  try {
    result = analyzeCoverage({
      changeId: CHANGE_ID,
      includeChanges: INCLUDE_CHANGES,
      testsDir: TESTS_DIR,
      root: ROOT,
      runReport: RUN_REPORT,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (AS_JSON) {
      console.log(
        JSON.stringify({ scenarios: 0, covered: 0, missing: [], error: message }, null, 2)
      );
    } else {
      console.error(message);
    }
    return 2;
  }

  const total = result.scenarios.length;
  const nominalCovered = result.nominalCovered.length;
  const executedCovered = result.executedCovered.length;
  const missing = result.nominalMissing;
  /** `--change` 模式下只让本次 delta 的缺口阻断；基线存量缺口照常列出但不阻断 */
  const { blocking: blockingMissing, baseline: baselineMissing } = splitMissingByScope(
    missing,
    CHANGE_ID
  );

  /**
   * 第二阶段要阻断的缺口 = 「名义上有测试、实际从未执行」。
   *
   * 为什么不是整个 executedMissing
   * ------------------------------
   * executedMissing ⊇ nominalMissing：名义上就没测试的场景，执行口径下当然也缺。
   * 但那部分属于**名义覆盖**的职责（既有 CI 步骤 `sdd:coverage --changes` 就在管），
   * 由它来阻断才合适。在这里重复阻断，会让「skip 门禁」与「覆盖门禁」互相连坐：
   * 某个兄弟变更的 delta 场景没写测试，会让**所有**变更的归档都被卡住——
   * 正是 proposal 里明令禁止的「一次性把其它在途变更拉红」。
   *
   * 因此本门禁只管 skippedOnly（名义已覆盖、被 skip 吃掉的那部分）。
   */
  const requiredExecutedMissing = REQUIRE_EXECUTED ? result.skippedOnly : [];

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        {
          scenarios: total,
          covered: nominalCovered,
          percent: total === 0 ? 100 : Math.round((nominalCovered / total) * 100),
          missing,
          // v4 新增：执行口径与 skip / weak 统计
          nominal: {
            covered: nominalCovered,
            percent: total === 0 ? 100 : Math.round((nominalCovered / total) * 100),
            missingCount: missing.length,
          },
          executed: {
            covered: executedCovered,
            percent: total === 0 ? 100 : Math.round((executedCovered / total) * 100),
            missingCount: result.executedMissing.length,
            /** 有运行时证据时才是确定值 */
            determined: result.runReport !== null,
          },
          skippedCount: result.skippedOnly.length,
          skippedScopes: result.skippedOnly,
          skippedTestScopes: result.skippedScopes,
          undeterminedCount: result.undeterminedScenarios.length,
          undeterminedScenarios: result.undeterminedScenarios,
          weakCount: result.weakScopes.length,
          weakScopes: result.weakScopes,
          runReport: result.runReport
            ? { path: result.runReport.reportPath, counts: result.runReport.counts }
            : null,
          /** 第二阶段阻断用的缺口清单（名义已覆盖但实际未执行） */
          requiredExecutedMissing,
          /** 执行口径下的全部缺口（含名义就缺的那部分，仅供观测） */
          executedMissing: result.executedMissing,
          /** --change 模式：会阻断本次归档的缺口（仅本次 delta） */
          blockingMissing,
          /** --change 模式：主规范基线的存量缺口（只报告，由全量门禁负责） */
          baselineMissing,
        },
        null,
        2
      )
    );
    // 默认按名义覆盖阻断；--require-executed 改按执行覆盖阻断
    // --change 模式只按本次 delta 的缺口阻断，存量基线缺口不连坐
    if (blockingMissing.length > 0) return 1;
    if (REQUIRE_EXECUTED && requiredExecutedMissing.length > 0) return 1;
    if (STRICT_ASSERTIONS && result.weakScopes.length > 0) return 1;
    return 0;
  }

  if (total === 0) {
    console.log("未发现任何规范场景（openspec/specs/ 为空），无需检查覆盖率。");
    return 0;
  }

  const evidenceNote = result.runReport
    ? `执行证据：${result.runReport.reportPath}（passed ${result.runReport.counts.passed} / skipped ${result.runReport.counts.skipped}）`
    : "执行证据：无（只影响 skip 作用域的核对，不改变静态判定结果）";
  const scopeNote = CHANGE_ID
    ? `阻断口径：--change ${CHANGE_ID} 只按本次 delta 的缺口阻断；主规范基线存量缺口仅报告，` +
      `由全量门禁 pnpm sdd:coverage --changes 负责。`
    : null;

  console.log(
    `扫描 ${total} 个场景，${result.testFileCount} 个测试文件。\n` +
      `名义覆盖 ${nominalCovered}/${total}（${Math.round((nominalCovered / total) * 100)}%） ` +
      `执行覆盖 ${executedCovered}/${total}（${Math.round((executedCovered / total) * 100)}%）\n` +
      `${evidenceNote}\n` +
      (scopeNote ? `${scopeNote}\n` : "")
  );

  const bySource = new Map<string, Scenario[]>();
  for (const sc of result.scenarios) {
    bySource.set(sc.source, [...(bySource.get(sc.source) ?? []), sc]);
  }
  console.log("场景覆盖率（名义口径）：");
  console.log("");
  for (const [source, scs] of bySource) {
    const done = scs.filter((s) => !missing.includes(s)).length;
    const pct = Math.round((done / scs.length) * 100);
    console.log(`  ${pct.toString().padStart(3)}%  ${source}  (${done}/${scs.length})`);
  }

  if (CHANGE_ID) {
    printScenarioSection("本次变更 delta 场景没有任何测试引用（阻断归档）", blockingMissing);
    printScenarioSection("主规范基线存量场景没有任何测试引用（不阻断本次归档）", baselineMissing);
    if (baselineMissing.length > 0) {
      console.log(
        `  ⚠ 以上 ${baselineMissing.length} 处是存量缺口，与本次变更无关；` +
          "它们仍会使 pnpm sdd:coverage / --changes 与 CI quality job 红灯，需单独处置。"
      );
    }
  } else {
    printScenarioSection("场景没有任何测试引用", missing);
  }
  printSkippedSection(result);
  printUndeterminedSection(result);
  printWeakSection(result);

  if (blockingMissing.length > 0) {
    console.log(
      "\n提示：每个场景必须有对应的 it —— 其外层 describe 为需求名、it 标题为场景名原文（两者都要命中，且注释不计入）。"
    );
    return 1;
  }

  console.log(
    missing.length === 0
      ? "\n全部场景都有对应测试引用。"
      : "\n本次变更的 delta 场景都有对应测试引用；主规范基线的存量缺口见上方清单。"
  );

  if (result.skippedOnly.length > 0) {
    console.log(
      `\n注意：其中 ${result.skippedOnly.length} 个场景名义上有测试、实际从未执行（见上方「已跳过」清单）。`
    );
    if (!REQUIRE_EXECUTED) {
      console.log("  当前为第一阶段：仅报告不阻断（--require-executed 可转为阻断）。");
    }
  }
  if (result.weakScopes.length > 0) {
    console.log(
      `\n注意：${result.weakScopes.length} 处 it 缺少可验证的强断言（见上方「弱断言」清单）。`
    );
    if (!STRICT_ASSERTIONS) {
      console.log("当前为第一阶段：仅警告不阻断（--strict-assertions 可转为阻断）。");
    }
    if (STRICT_ASSERTIONS) return 1;
  }

  if (REQUIRE_EXECUTED && requiredExecutedMissing.length > 0) {
    console.log("");
    console.log(
      `${requiredExecutedMissing.length} 个场景名义上有测试、实际从未执行（被 skip 吃掉）：`
    );
    for (const sc of requiredExecutedMissing) {
      console.log(scenarioLine(sc));
      for (const by of sc.skippedBy) {
        console.log(`      ↳ ${by.file}:${by.line}  ${by.itTitle}`);
      }
    }
    console.log(
      "\n提示：覆盖率是强需求，不提供豁免。若套件因环境缺失（真库 / dev server / 浏览器）" +
        "无法执行，应先修复环境，而不是跳过测试。"
    );
    return 1;
  }

  return 0;
}

process.exit(main());
