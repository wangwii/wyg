#!/usr/bin/env node
/**
 * SDD 归档前一键门禁
 * ----------------------------------------------------------------
 * 把散落在 CONSTITUTION §3 / docs/openspec.md §5.5 里的"归档前必须跑通"
 * 收敛成一条命令，避免靠记忆执行、漏一步就把脏变更归档：
 *
 *   0. tasks.md 全部勾选（未完成的条目直接列出）
 *   1. pnpm sdd:verify              规范格式 + 变更完整性
 *   2. pnpm sdd:coverage --change <id>
 *                                 事实来源与「本次归档变更」的 delta 场景是否都有测试；
 *                                 仅扫描本变更目录（不扫描其它无关的 in-flight 变更），
 *                                 主规范基线 openspec/specs/ 始终参与校验。
 *
 * 指标回归的"可见性"改由 CI 的 baseline:debt 看板 + baseline:drift 守护承担，
 * 不再在此处设基线门禁（基线比对由 baseline:trend / baseline:debt 独立提供）。
 *
 * v4 · 断言强度与跳过统计
 * ----------------------
 * 门禁额外读取覆盖率分析的**结构化结果**（不再靠解析 CLI 文本输出），据此：
 *   - weak（存根断言）：**默认只警告**；--strict-assertions 转为阻断
 *   - skipped（名义覆盖但从未执行）：**默认只报告**；--require-executed 转为阻断
 *
 * 条件跳过（`describe.skipIf`）被禁止：检测到即报错。`--run-report <vitest json>`
 * 仍可提供，用于核对「被 .skip 的用例在本次运行里确实没跑」，但不改变判定口径。
 *
 * 「先报告、后阻断」是硬约束：一次性把 skip 转为阻断会把其它在途变更全拉红，
 * 影响面必须先跑一轮全量确认（见 tasks 4.2 与 docs/sdd-coverage-inventory.md）。
 *
 * 任一环节非 0 退出即整体失败。跳过某一环节用 --skip-<step> 显式声明，
 * 并在提交信息里说明原因——不要让门禁静默失效。
 *
 * 用法：
 *   pnpm sdd:pre-archive --change <id>
 *   pnpm sdd:pre-archive --change <id> --skip-coverage
 *   pnpm sdd:pre-archive --change <id> --strict-assertions
 *   pnpm sdd:pre-archive --change <id> --require-executed --run-report .vitest-report.json
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeCoverage } from "./coverage-core";
import { optionValue as cliOptionValue } from "./cli-args";
import { describeCliFailure, runCli } from "./run-cli.mjs";
import { findProcessActions, parseChecklist } from "./rollout";

const ROOT = resolve(process.cwd());
const CHANGES_DIR = join(ROOT, "openspec", "changes");
const ARCHIVE_DIR = join(CHANGES_DIR, "archive");

const argv = process.argv.slice(2);

/**
 * 取带值选项的值，同时支持 `--opt value` 与 `--opt=value` 两种写法。
 *
 * 实现见 cli-args.ts（与 coverage-report.ts 共用一份）。
 * 曾发生过一个隐蔽 bug：本文件原本只认空格形式，
 * `--run-report=x.json` 被静默忽略 → 运行时证据没加载 →
 * 条件跳过全被判成「未执行」→ 门禁误报 44 条**假缺口**。
 * 「看起来有道理」的假缺口比直接报错难查得多，故两处共用一份实现。
 */
const argValue = (name: string): string | null => cliOptionValue(name, argv);

const CHANGE = argValue("change");
const SKIP_VERIFY = argv.includes("--skip-verify");
const SKIP_COVERAGE = argv.includes("--skip-coverage");
/** 跳过步骤 3（断言强度 + 执行覆盖） */
const SKIP_QUALITY = argv.includes("--skip-quality");
/** 存在弱断言即阻断（默认只警告） */
const STRICT_ASSERTIONS = argv.includes("--strict-assertions");
/** 运行时报告（vitest --reporter=json 的输出）→ 提供「实际是否执行」的证据 */
const RUN_REPORT = argValue("run-report");
/** 存在「名义覆盖但实际未执行」的场景即阻断（默认只报告） */
const REQUIRE_EXECUTED = argv.includes("--require-executed");

const GREEN = "✓";
const RED = "✗";
const YELLOW = "!";

function step(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 56 - title.length))}`);
}

function run(label: string, name: string, args: string[]): boolean {
  console.log(`$ ${name} ${args.join(" ")}`);
  // 起子进程统一走 run-cli：Windows .cmd 解析 + DEP0190 单字符串拼法 + 参数白名单
  // 都在那里收口。--change <id> 等外部输入不会再被拼成可注入的 shell 命令。
  const res = runCli(name, args, { stdio: "inherit", root: ROOT });
  if (res.error) {
    console.error(`${RED} ${label} 无法执行：${describeCliFailure(res)}`);
    return false;
  }
  if (res.status !== 0) {
    console.error(`${RED} ${label} 未通过（退出码 ${res.status}）。`);
    return false;
  }
  console.log(`${GREEN} ${label} 通过。`);
  return true;
}

/** 步骤 0：tasks.md 必须全部勾选 */
function checkTasksChecked(dir: string): boolean {
  const tasksPath = join(dir, "tasks.md");
  if (!existsSync(tasksPath)) {
    console.error(`${RED} 缺少 tasks.md。`);
    return false;
  }
  const lines = readFileSync(tasksPath, "utf8").split(/\r?\n/);
  const unchecked: string[] = [];
  let total = 0;
  for (const raw of lines) {
    const m = raw.match(/^\s*-\s*\[( |x|X)\]\s+(.*)$/);
    if (!m) continue;
    total++;
    if (m[1] !== "x" && m[1] !== "X") unchecked.push(m[2]!.trim());
  }
  if (total === 0) {
    console.error(`${RED} tasks.md 里没有任何 \`- [ ]\` / \`- [x]\` 任务条目。`);
    return false;
  }
  if (unchecked.length > 0) {
    console.error(`${RED} ${unchecked.length}/${total} 个任务尚未勾选：`);
    for (const t of unchecked) console.error(`   - [ ] ${t}`);
    console.error("   归档意味着本次变更已完成：未勾选的任务要么做完，要么挪到新的 change。");
    return false;
  }
  console.log(`${GREEN} tasks.md ${total} 个任务全部勾选。`);
  return true;
}

/**
 * 步骤 3：断言强度 + 跳过统计。
 *
 * 复用 coverage-core 的结构化结果（不解析 CLI 文本输出——那种耦合在改一次
 * 报告格式时必然断）。
 *
 * 判定：
 *   - weak（存根断言）：默认只警告；--strict-assertions 转为阻断
 *   - skipped（名义覆盖但从未执行）：第一阶段只报告，不阻断；
 *     提供 --run-report <vitest json> 时可按运行时事实判定，
 *     并用 --require-executed 转为阻断。
 */
function checkAssertionQuality(changeId: string): boolean {
  let result: ReturnType<typeof analyzeCoverage>;
  try {
    result = analyzeCoverage({
      changeId,
      root: ROOT,
      runReport: RUN_REPORT,
    });
  } catch (err) {
    console.error(`${RED} ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  const weak = result.weakScopes;
  const skipped = result.skippedOnly;

  if (skipped.length > 0) {
    console.log(
      `${YELLOW} ${skipped.length} 个场景名义上被覆盖、实际从未执行（被 describe.skip / it.skip 跳过）：`
    );
    for (const sc of skipped.slice(0, 10)) {
      console.log(`   - [${sc.source}] Requirement="${sc.requirement}" Scenario="${sc.scenario}"`);
    }
    if (skipped.length > 10)
      console.log(`   …… 另有 ${skipped.length - 10} 处，详见 pnpm sdd:coverage`);
    if (!REQUIRE_EXECUTED) {
      console.log("   当前为第一阶段：仅报告不阻断（--require-executed 可转为阻断）。");
    }
  } else {
    console.log(`${GREEN} 没有「名义覆盖但从未执行」的场景。`);
  }

  if (REQUIRE_EXECUTED && skipped.length > 0) {
    console.error("");
    console.error(
      `${RED} ${skipped.length} 个场景名义上有测试、实际从未执行（--require-executed 已开启，阻断）：`
    );
    for (const sc of skipped) {
      console.error(
        `   - [${sc.source}] Requirement="${sc.requirement}" Scenario="${sc.scenario}"`
      );
    }
    console.error(
      "   覆盖率是强需求：不提供豁免。环境缺失（真库 / dev server / 浏览器）应先修复环境，" +
        "不能靠跳过测试换取门禁变绿。"
    );
    return false;
  }

  if (weak.length === 0) {
    console.log(`${GREEN} 没有弱断言。`);
    return true;
  }

  console.log("");
  console.log(`${YELLOW} ${weak.length} 处弱断言（it 体内没有可验证的强断言）：`);
  for (const w of weak) {
    const chain = [...w.describes, w.itTitle].join(" › ");
    console.log(`   - ${w.file}:${w.line}  ${chain}`);
    console.log(`       ${w.weak!.reason}`);
  }

  if (!STRICT_ASSERTIONS) {
    console.log("   当前为第一阶段：仅警告不阻断（--strict-assertions 可转为阻断）。");
    return true;
  }
  console.error(`${RED} 存在 ${weak.length} 处弱断言（--strict-assertions 已开启，阻断）。`);
  return false;
}

/**
 * 步骤 0b：人工移交清单——**只列出，不阻断**。
 *
 * 门禁只对工程事实负责（实现完成 + 规范就绪）。部署、生产配置、数据订正、
 * 需人判断的验收这些事，门禁既无法验证也无法替人完成；把它当硬门禁的唯一后果
 * 是逼出"假勾选"（archive/2026-10-24-fix-device-catalog-modal-bugs 有过实锤）。
 * 所以这里只让"还没做"这件事**可见**。
 */
function reportRollout(dir: string): void {
  const rolloutPath = join(dir, "rollout.md");
  if (!existsSync(rolloutPath)) {
    console.log(`${GREEN} 无 rollout.md（本次变更未登记人工移交项）。`);
    return;
  }

  const report = parseChecklist(readFileSync(rolloutPath, "utf8"));
  if (report.total === 0) {
    console.log(`${GREEN} rollout.md 无人工移交项。`);
    return;
  }
  if (report.unchecked.length === 0) {
    console.log(`${GREEN} rollout.md 的 ${report.total} 项人工移交已全部完成。`);
    return;
  }

  console.log(
    `${YELLOW} ${report.unchecked.length}/${report.total} 项人工移交尚未完成（**不阻断归档**）：`
  );
  for (const item of report.unchecked) {
    const where = item.section ? `（${item.section}）` : "";
    console.log(`   - [ ] ${item.text}${where}`);
  }
  console.log("   这些动作由人执行，门禁无法验证；归档后按 rollout.md 跟踪到闭环即可。");
}

/**
 * 步骤 0c：门禁自指任务——**报警，不阻断**。
 *
 * `tasks.md` 里写「归档前跑一次 pre-archive」这类流程动作，等于把门禁本身当成变更内容：
 * 不管实际做没做，它都会因为门禁而红，于是永远差一条。
 * 改不改由人决定（逼着改只会催生措辞绕道），但必须让人看见。
 */
function reportProcessActions(dir: string): void {
  const tasksPath = join(dir, "tasks.md");
  if (!existsSync(tasksPath)) return;

  const hits = findProcessActions(readFileSync(tasksPath, "utf8"));
  if (hits.length === 0) {
    console.log(`${GREEN} 任务清单未混入流程动作。`);
    return;
  }

  console.log(`${YELLOW} tasks.md 有 ${hits.length} 条任务实为流程动作（报警，不阻断）：`);
  for (const h of hits) console.log(`   - 第 ${h.line} 行 [${h.label}] ${h.text}`);
  console.log("   流程动作在门禁通过后直接执行即可；确需登记就写进 rollout.md，别留在任务清单里。");
}

function main(): number {
  const id = CHANGE;
  if (!id) {
    console.error("用法：pnpm sdd:pre-archive --change <change-id>");
    console.error(
      "可用变更：" +
        (existsSync(CHANGES_DIR)
          ? readdirSync(CHANGES_DIR)
              .filter(
                (e) =>
                  statSync(join(CHANGES_DIR, e)).isDirectory() &&
                  join(CHANGES_DIR, e) !== ARCHIVE_DIR
              )
              .join(", ") || "（无）"
          : "（无）")
    );
    return 2;
  }

  const dir = join(CHANGES_DIR, id);
  if (!existsSync(dir)) {
    console.error(`${RED} 变更不存在：openspec/changes/${id}`);
    return 2;
  }

  console.log(`归档前门禁：${id}`);
  const failures: string[] = [];

  step("0a/3 tasks.md 完成度");
  if (!checkTasksChecked(dir)) failures.push("tasks.md 未完成");

  step("0b/3 人工移交清单");
  reportRollout(dir);

  step("0c/3 门禁自指任务");
  reportProcessActions(dir);

  if (!SKIP_VERIFY) {
    step("1/3 规范格式与变更完整性");
    if (!run("sdd:verify", "pnpm", ["sdd:verify"])) failures.push("sdd:verify");
  }

  if (!SKIP_COVERAGE) {
    step("2/3 场景 → 测试覆盖率");
    if (!run("sdd:coverage", "pnpm", ["sdd:coverage", "--change", id]))
      failures.push("sdd:coverage");
  }

  // 步骤 3 与步骤 2 语义已独立：步骤 2 管「场景有没有测试引用」（名义口径），
  // 步骤 3 管「断言强度 + 是否真的执行过」（执行口径）。故各自独立开关。
  if (!SKIP_QUALITY) {
    step("3/3 断言强度与执行覆盖");
    if (!checkAssertionQuality(id)) failures.push("断言强度 / 执行覆盖");
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`${RED} 归档前门禁未通过：${failures.join(" / ")}`);
    console.error("   修好后再归档；确需跳过某一步，用 --skip-* 并在提交信息里写明原因。");
    return 1;
  }

  console.log(`${GREEN} 归档前门禁全部通过。`);
  console.log("\n归档后别忘了：");
  console.log(`  1. pnpm sdd:archive ${id}`);
  console.log(`  2. 更新 docs/BASELINE.md 台账状态（如本次变更登记了指标台账条目）`);
  return 0;
}

process.exit(main());
