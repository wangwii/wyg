#!/usr/bin/env node
/**
 * SDD 规范格式校验器
 * ------------------
 * 在 `openspec validate`（OpenSpec 自带的结构校验）之外，补充 ecmp 项目级的
 * 写作规范校验：
 *
 *   1. 事实来源规范（openspec/specs/**\/spec.md）
 *      - 必须有 `## Purpose` 与 `## Requirements`
 *      - 每个 `### Requirement:` 至少有一个 `#### Scenario:`
 *      - 每个 Scenario 必须有 WHEN / THEN 条目（GIVEN 建议有）
 *      - 需求与场景不得仍是模板占位符
 *
 *   2. 变更增量（openspec/changes/<id>/specs/**\/*.md）
 *      - 必须至少有一个 delta 段：ADDED / MODIFIED / REMOVED / RENAMED Requirements
 *      - 需求 / 场景要求同上
 *      - REMOVED 需求必须带 **Reason** 与 **Migration**
 *
 *   3. 变更目录完整性
 *      - 必须有 `.openspec.yaml`、`proposal.md`、`tasks.md`
 *      - 除非 `.openspec.yaml` 声明 `skip_specs: true`，否则必须有 `specs/`
 *      - `design.md` 缺失只警告不报错（按 schema 它是条件产物）
 *
 * 退出码 0 表示通过，非 0 供 CI / pre-commit 阻断。
 *
 * Usage:
 *   pnpm sdd:verify                          # 门面：先 openspec validate，再本脚本 --project-only
 *   tsx scripts/sdd/verify-specs.ts          # 完整校验（结构项也兜底，旧行为）
 *   tsx scripts/sdd/verify-specs.ts --project-only   # 仅项目专属校验（结构项交给 openspec validate）
 */
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * `--project-only`：只跑 OpenSpec 模型之外的项目专属校验
 * （WHEN/THEN/GIVEN、占位符、REMOVED 的 Reason/Migration、产物完整性、变更完整性）。
 * 结构项（## Purpose / ## Requirements / delta 段 / 需求≥1 Scenario / SHALL·MUST 等）
 * 交由 `pnpm sdd:verify` 门面先跑的 `openspec validate --all --strict` 负责，避免重复维护。
 *
 * 不带该 flag 时维持旧行为（结构项也由本脚本兜底），供单独调用 / 回退使用。
 */
const PROJECT_ONLY = process.argv.includes("--project-only");

const ROOT = resolve(process.cwd());
const SPECS_DIR = join(ROOT, "openspec", "specs");
const CHANGES_DIR = join(ROOT, "openspec", "changes");
const ARCHIVE_DIR = join(CHANGES_DIR, "archive");

/** OpenSpec spec-driven schema 允许的 delta 段 */
const DELTA_SECTIONS = [
  "ADDED Requirements",
  "MODIFIED Requirements",
  "REMOVED Requirements",
  "RENAMED Requirements",
] as const;

type Issue = { file: string; message: string; level: "error" | "warn" };

function listMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...listMarkdownFiles(full));
    else if (s.isFile() && entry.endsWith(".md")) out.push(full);
  }
  return out;
}

function isReadme(file: string): boolean {
  return file.endsWith("/README.md") || file.endsWith("README.md");
}

/**
 * 按 `level` 级标题切分，标题文本以 `prefix` 开头。
 * 返回 { heading, body }[]；区块结束于下一个同前缀标题，或下一个同/更高级标题。
 */
function splitHeadings(
  content: string,
  level: number,
  prefix: string
): { heading: string; body: string }[] {
  const hashes = "#".repeat(level);
  const regex = new RegExp(`^${hashes}\\s+${escapeRegex(prefix)}.*$`, "gm");
  const headings = Array.from(content.matchAll(regex));
  if (headings.length === 0) return [];
  const blocks: { heading: string; body: string }[] = [];
  for (let i = 0; i < headings.length; i++) {
    const m = headings[i]!;
    const start = (m.index ?? 0) + m[0].length;
    const next = headings[i + 1];
    let end: number;
    if (next) {
      end = next.index ?? content.length;
    } else {
      const rest = content.slice(start);
      const stop = rest.search(new RegExp(`^#{1,${level}}\\s+`, "m"));
      end = stop === -1 ? content.length : start + stop;
    }
    blocks.push({
      heading: m[0].replace(new RegExp(`^${hashes}\\s+`), "").trim(),
      body: content.slice(start, end).trim(),
    });
  }
  return blocks;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripPrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length).trim() : s.trim();
}

/** 支持 `- WHEN ...`、`- **WHEN** ...`、`- GIVEN ...` 等写法 */
function hasStep(body: string, keyword: string): boolean {
  const re = new RegExp(`-\\s*\\**\\s*${keyword}\\b`, "i");
  return re.test(body);
}

function validateRequirementBlocks(
  file: string,
  content: string,
  issues: Issue[],
  projectOnly = PROJECT_ONLY
): void {
  const rel = relative(ROOT, file);
  const reqs = splitHeadings(content, 3, "Requirement:");
  if (reqs.length === 0) {
    // 结构项（spec 至少 1 个需求）由 openspec validate 兜底，project-only 下不重复报。
    if (!projectOnly) {
      issues.push({ file: rel, message: "没有找到 `### Requirement:` 段。", level: "error" });
    }
    return;
  }
  for (const req of reqs) {
    const reqName = stripPrefix(req.heading, "Requirement:");
    if (/<!--.*-->/.test(reqName) || reqName.length === 0) {
      issues.push({
        file: rel,
        message: "需求名仍是模板占位符，请填写真实需求名。",
        level: "error",
      });
    }

    const scenarios = splitHeadings(req.body, 4, "Scenario:");
    if (scenarios.length === 0) {
      // 需求≥1 场景由 openspec validate 兜底（REQUIREMENT_NO_SCENARIOS），project-only 下不重复报。
      if (!projectOnly) {
        issues.push({
          file: rel,
          message: `需求 "${reqName}" 没有任何 \`#### Scenario:\`。`,
          level: "error",
        });
      }
      continue;
    }
    for (const sc of scenarios) {
      const scName = stripPrefix(sc.heading, "Scenario:");
      if (/<!--.*-->/.test(scName) || scName.length === 0) {
        issues.push({
          file: rel,
          message: `需求 "${reqName}" 下的场景名是占位符。`,
          level: "error",
        });
      }
      if (!hasStep(sc.body, "WHEN")) {
        issues.push({
          file: rel,
          message: `场景 "${scName}"（需求 "${reqName}"）缺少 WHEN 条目。`,
          level: "error",
        });
      }
      if (!hasStep(sc.body, "THEN")) {
        issues.push({
          file: rel,
          message: `场景 "${scName}"（需求 "${reqName}"）缺少 THEN 条目。`,
          level: "error",
        });
      }
      if (!hasStep(sc.body, "GIVEN")) {
        issues.push({
          file: rel,
          message: `场景 "${scName}"（需求 "${reqName}"）建议补一条 GIVEN 前置条件。`,
          level: "warn",
        });
      }
    }
  }
}

/** 事实来源规范：openspec/specs/**\/spec.md */
function validateMainSpec(file: string): Issue[] {
  const issues: Issue[] = [];
  const rel = relative(ROOT, file);
  const content = readFileSync(file, "utf8");

  if (!PROJECT_ONLY) {
    if (!/^## Purpose\b/m.test(content)) {
      issues.push({ file: rel, message: "缺少 `## Purpose` 段。", level: "error" });
    }
    if (!/^## Requirements\b/m.test(content)) {
      issues.push({ file: rel, message: "缺少 `## Requirements` 段。", level: "error" });
    }
  }
  validateRequirementBlocks(file, content, issues);
  return issues;
}

/** 变更增量：openspec/changes/<id>/specs/**\/*.md */
function validateDeltaSpec(file: string): Issue[] {
  const issues: Issue[] = [];
  const rel = relative(ROOT, file);
  const content = readFileSync(file, "utf8");

  const hasDelta = DELTA_SECTIONS.some((s) =>
    new RegExp(`^##\\s+${escapeRegex(s)}\\b`, "m").test(content)
  );
  // delta 段存在性由 openspec validate 兜底（CHANGE_NO_DELTAS），project-only 下不重复报。
  if (!hasDelta && !PROJECT_ONLY) {
    issues.push({
      file: rel,
      message: `缺少 delta 段，必须包含下列之一：${DELTA_SECTIONS.join(" / ")}。`,
      level: "error",
    });
  }

  // REMOVED 需求必须给出 Reason 与 Migration
  for (const block of splitHeadings(content, 2, "REMOVED Requirements")) {
    for (const req of splitHeadings(block.body, 3, "Requirement:")) {
      const name = stripPrefix(req.heading, "Requirement:");
      if (!/\*\*Reason\*\*/i.test(req.body)) {
        issues.push({
          file: rel,
          message: `REMOVED 需求 "${name}" 缺少 **Reason**。`,
          level: "error",
        });
      }
      if (!/\*\*Migration\*\*/i.test(req.body)) {
        issues.push({
          file: rel,
          message: `REMOVED 需求 "${name}" 缺少 **Migration**。`,
          level: "error",
        });
      }
    }
  }

  validateRequirementBlocks(file, content, issues);
  return issues;
}

function hasSkipSpecs(dir: string): boolean {
  const meta = join(dir, ".openspec.yaml");
  if (!existsSync(meta)) return false;
  return /skip_specs\s*:\s*true/.test(readFileSync(meta, "utf8"));
}

function validateChange(dir: string): Issue[] {
  const issues: Issue[] = [];
  const rel = relative(ROOT, dir);

  if (!existsSync(join(dir, ".openspec.yaml"))) {
    issues.push({
      file: join(rel, ".openspec.yaml"),
      message: "缺少变更元数据（应由 `openspec new change` 生成）。",
      level: "error",
    });
  }
  for (const f of ["proposal.md", "tasks.md"]) {
    if (!existsSync(join(dir, f))) {
      issues.push({ file: join(rel, f), message: "缺少必需产物。", level: "error" });
    }
  }
  if (!existsSync(join(dir, "design.md"))) {
    issues.push({
      file: join(rel, "design.md"),
      message: "缺少 design.md（跨模块 / 数据模型 / 安全 / 迁移复杂度的变更建议补上）。",
      level: "warn",
    });
  }
  // rollout.md（人工移交清单）是**可选产物**：有它多一条跟踪线索，没它也不算缺件。
  // 这里只做存在性识别，不校验内容——它的完成度由 pre-archive 打印，不参与门禁判定。

  const specsSubdir = join(dir, "specs");
  const specsMissing =
    !existsSync(specsSubdir) ||
    !statSync(specsSubdir).isDirectory() ||
    listMarkdownFiles(specsSubdir).filter((f) => !isReadme(f)).length === 0;
  // specs/ 缺失（且未 skip_specs）由 openspec validate 兜底（CHANGE_NO_DELTAS，且尊重 skip_specs），
  // project-only 下不重复报；其余产物完整性（.openspec.yaml / proposal / tasks / design）仍由本脚本守。
  if (specsMissing && !hasSkipSpecs(dir) && !PROJECT_ONLY) {
    issues.push({
      file: join(rel, "specs/"),
      message:
        "缺少规范增量。若本变更确实不改变任何行为（纯重构/工具链/文档），请在 .openspec.yaml 中设置 skip_specs: true。",
      level: "error",
    });
  }

  return issues;
}

function main(): number {
  const issues: Issue[] = [];

  // 1. 事实来源规范
  if (existsSync(SPECS_DIR)) {
    for (const file of listMarkdownFiles(SPECS_DIR)) {
      if (isReadme(file)) continue;
      issues.push(...validateMainSpec(file));
    }
  } else {
    issues.push({
      file: "openspec/specs/",
      message: "规范目录不存在。",
      level: "error",
    });
  }

  // 2 & 3. 进行中的变更
  if (existsSync(CHANGES_DIR)) {
    for (const entry of readdirSync(CHANGES_DIR)) {
      const full = join(CHANGES_DIR, entry);
      if (!statSync(full).isDirectory()) continue;
      if (full === ARCHIVE_DIR) continue; // 归档是历史，不做增量校验
      issues.push(...validateChange(full));
      const specsSubdir = join(full, "specs");
      if (existsSync(specsSubdir) && statSync(specsSubdir).isDirectory()) {
        for (const file of listMarkdownFiles(specsSubdir)) {
          if (isReadme(file)) continue;
          issues.push(...validateDeltaSpec(file));
        }
      }
    }
  }

  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");

  for (const w of warns) console.warn(`⚠  ${w.file}: ${w.message}`);
  for (const e of errors) console.error(`✗  ${e.file}: ${e.message}`);

  if (warns.length > 0) console.warn(`\n${warns.length} 条警告（不阻断）。`);
  if (errors.length > 0) {
    console.error(`\n${errors.length} 个规范问题，需修复后继续。`);
    return 1;
  }
  console.log("✓ 规范格式校验通过。");
  return 0;
}

process.exit(main());
