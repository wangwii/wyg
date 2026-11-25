#!/usr/bin/env node
/**
 * sdd:verify 门面
 * ------------
 * 组合两道校验，结构规则交给 OpenSpec 官方作为单一事实源，项目专属规则留在
 * `verify-specs.ts`——避免用正则重复维护 OpenSpec 已机检的结构项（delta 段 /
 * ## Purpose / ## Requirements / 需求≥1 Scenario / SHALL·MUST / Change≥1 delta /
 * Why 最小长度 / 任务复选框），同时保留 OpenSpec 模型之外、官方管不了的校验
 * （WHEN·THEN·GIVEN、需求/场景名非占位符、REMOVED 须带 Reason/Migration、
 * 变更产物完整性、变更完整性声明）。
 *
 * 两道任一失败即整体非零退出，供 CI / pre-commit（含 sdd:pre-archive）阻断。
 *
 * Usage:
 *   pnpm sdd:verify
 *
 * 等价于：
 *   openspec validate --all --strict
 *   && tsx scripts/verify-specs.ts --project-only
 *
 * 若需单独跑「完整项目校验」（结构项也由本脚本兜底，旧行为），
 * 直接：tsx scripts/verify-specs.ts
 */
import { describeCliFailure, runCli } from "./run-cli.mjs";

/**
 * 同步执行一道校验，返回结果是否通过。
 *
 * 起子进程统一交给 run-cli 的 runCli()：Windows 下 node_modules/.bin 里的 shim
 * 是无扩展名的 POSIX 脚本，必须 shell:true + .cmd 才能跑起来；早年间这里用
 * execFileSync 直调 shim，本地恒 ENOENT 而 CI（ubuntu）恒绿，失败还被 catch
 * 静默吞掉，排查成本极高。
 */
function runStep(label: string, name: string, args: string[]): boolean {
  const res = runCli(name, args);
  if (res.error) {
    console.error(`  ${label} 无法执行：${describeCliFailure(res)}`);
    return false;
  }
  if (res.status !== 0) {
    console.error(`  ${label} 未通过（退出码 ${res.status}）。`);
    return false;
  }
  return true;
}

let failed = false;

console.log("\n▶ [1/2] OpenSpec 结构校验：openspec validate --all --strict");
if (!runStep("阶段 1", "openspec", ["validate", "--all", "--strict"])) failed = true;

console.log(
  "\n▶ [2/2] 项目专属校验（写作规范 WHEN/THEN + 产物完整性 + 变更完整性）：verify-specs --project-only"
);
if (!runStep("阶段 2", "tsx", ["scripts/verify-specs.ts", "--project-only"])) failed = true;

if (failed) {
  console.error("\n✗ sdd:verify 未通过（见上方各阶段输出）。");
  process.exit(1);
}
console.log("\n✓ sdd:verify 通过（OpenSpec 结构校验 + 项目专属校验）。");
process.exit(0);
