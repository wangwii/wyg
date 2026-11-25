/**
 * 人工移交通道（change clarify-sdd-contract-and-handoff，task 3.1 / 3.3 / 3.4）
 * -------------------------------------------------------------------------
 * 背景：`tasks.md` 原本同时承担两种性质完全不同的东西——
 *   ① agent 可完成、可自动验证的工程事实；
 *   ② 必须由人执行的动作（部署、生产配置、数据订正、需人判断的验收）。
 *
 * 门禁只能对 ① 负责。把 ② 混进 tasks.md，结果是二选一：
 *   - 门禁放行 → 人工事项被悄悄漏掉；
 *   - 门禁阻断 → 变更永远卡在"预归档"，最后大家学会**假勾选**。
 * 后者的实锤在 archive/2026-10-24-fix-device-catalog-modal-bugs/tasks.md：
 *   `- [x] 4.4（可选）浏览器手动冒烟…` 下面写着「状态：未执行」。
 * 勾着，但没做。门禁从"防止脏变更归档"退化成"防止忘勾选"。
 *
 * 所以本模块把 ② 迁到 `rollout.md`：**只列出，不阻断**。
 * 「人工事项还没做」这件事必须**可见**，而不是必须**消失**。
 *
 * 另一半是**门禁自指任务**：`tasks.md` 里写「归档前跑一次 pre-archive」这类
 * 流程动作，等于把门禁本身当成变更内容——不管做没做，它都会因为门禁自己而红。
 * 这类条目同样只报警、不阻断（报警即可，逼着改会催生措辞绕道）。
 *
 * 纯函数、无副作用，供 `pre-archive` 与单测共用。
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** 单条复选框：`- [ ] 文本` / `- [x] 文本`（容忍缩进与 `*`/`+` 标记） */
const CHECKBOX_RE = /^\s*[-*+]\s*\[( |x|X)\]\s+(.*)$/;

/** 章节标题（只认二级） */
const SECTION_RE = /^##\s+(.+?)\s*$/;

export interface ChecklistItem {
  /** 1-based 行号 */
  line: number;
  /** 所属二级章节名；无章节时为 `""` */
  section: string;
  /** 条目文本（已 trim，保留原样供人读） */
  text: string;
}

export interface ChecklistReport {
  /** 复选框条目总数（含已完成） */
  total: number;
  /** 已完成条目数 */
  done: number;
  /** 未完成条目（供门禁打印） */
  unchecked: ChecklistItem[];
}

/**
 * 解析 markdown 里的复选框清单。
 *
 * 跳过围栏代码块（``` / ~~~）：模板里会用代码块示范格式，
 * 把示范当成真实条目会让每个新变更都凭空多出一条未完成项。
 */
export function parseChecklist(md: string): ChecklistReport {
  const lines = md.split(/\r?\n/);
  const unchecked: ChecklistItem[] = [];
  let total = 0;
  let done = 0;
  let section = "";
  let fence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker[0]!;
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const sec = line.match(SECTION_RE);
    if (sec) {
      section = sec[1]!.trim();
      continue;
    }

    const m = line.match(CHECKBOX_RE);
    if (!m) continue;
    total++;
    if (m[1] !== " ") {
      done++;
      continue;
    }
    unchecked.push({ line: i + 1, section, text: m[2]!.trim() });
  }

  return { total, done, unchecked };
}

/**
 * 流程动作的**命令调用形态**。
 *
 * 只认 `pnpm <script>` 这种可执行的调用写法：
 *   - 文件路径引用（`scripts/sdd/pre-archive.ts`）**不匹配**——
 *     实现这些脚本的任务本身就必然提到它们的名字，否则这条规则无法自证。
 *   - 单纯的脚本文本（`sdd:coverage`）不匹配：跑覆盖率是"可自动验证的完成条件"，
 *     属于工程事实，本来就该留在 tasks.md。
 *
 * 台账那条只认**带路径的动作**（`更新 docs/BASELINE.md`）。裸的「更新台账」
 * 不算——变更任务里经常只是提到这个词，钉得太宽会淹掉真信号。
 */
export const PROCESS_TASK_PATTERNS: ReadonlyArray<{
  id: string;
  label: string;
  re: RegExp;
}> = [
  { id: "pre-archive", label: "归档前门禁", re: /\bpnpm\s+(?:run\s+)?sdd:pre-archive\b/ },
  { id: "archive", label: "归档", re: /\bpnpm\s+(?:run\s+)?sdd:archive\b/ },
  { id: "baseline", label: "度量查询", re: /\bpnpm\s+(?:run\s+)?baseline:(?:trend|debt|record)\b/ },
  { id: "ledger", label: "台账更新", re: /更新\s*docs\/BASELINE\.md/ },
];

export interface ProcessActionHit extends ChecklistItem {
  /** 命中的规则 id，便于提示"该挪到哪" */
  patternId: string;
  /** 规则人读名 */
  label: string;
}

/**
 * 在任务清单里找出**流程动作**条目。
 *
 * 只看复选框行：正文与标题里描述流程是正常的（本文件这类规则文档就在描述它），
 * 把正文也算进去会让规则永远报自己。
 */
export function findProcessActions(md: string): ProcessActionHit[] {
  const hits: ProcessActionHit[] = [];
  // 复用复选框解析：先拿到所有条目（含已勾选），再逐条匹配
  const all: ChecklistItem[] = [];
  {
    const lines = md.split(/\r?\n/);
    let section = "";
    let fence: string | null = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1]!;
        if (fence === null) fence = marker[0]!;
        else if (marker[0] === fence) fence = null;
        continue;
      }
      if (fence !== null) continue;
      const sec = line.match(SECTION_RE);
      if (sec) {
        section = sec[1]!.trim();
        continue;
      }
      const m = line.match(CHECKBOX_RE);
      if (m) all.push({ line: i + 1, section, text: m[2]!.trim() });
    }
  }

  for (const item of all) {
    for (const p of PROCESS_TASK_PATTERNS) {
      if (p.re.test(item.text)) {
        hits.push({ ...item, patternId: p.id, label: p.label });
        break;
      }
    }
  }
  return hits;
}

/** 模板路径：与脚本同目录的 templates/ 下 */
const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "templates");

export function rolloutTemplatePath(): string {
  return join(TEMPLATES_DIR, "rollout.md");
}

export function readRolloutTemplate(): string {
  const p = rolloutTemplatePath();
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

/**
 * 为新变更铺设 `rollout.md`（空模板）。
 *
 * 与 `new-change.ts` 里"不预填产物模板"的原则**不冲突**：那条约束针对的是
 * `.openspec.yaml` / `proposal.md` 这类由 OpenSpec 托管的产物——预填空白模板会让
 * `openspec status` 误判为已完成。`rollout.md` 不在 schema 里，填不填都不影响状态判定。
 *
 * @returns 是否新建（已存在则不覆盖，返回 false）
 */
export function scaffoldRollout(changeDir: string): boolean {
  const target = join(changeDir, "rollout.md");
  if (existsSync(target)) return false;
  const template = readRolloutTemplate();
  if (!template) return false;
  mkdirSync(changeDir, { recursive: true });
  copyFileSync(rolloutTemplatePath(), target);
  return true;
}
