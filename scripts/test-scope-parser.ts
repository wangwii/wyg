/**
 * SDD 测试作用域解析器
 * --------------------
 * 从测试文件中解析出「测试作用域」——每个 `it` 连同其外层 `describe` 链、
 * it 标题与 it 体，拼接为一个可被覆盖率报告检索的字符串。
 *
 * 为什么用 TypeScript AST 而不用手写字符扫描器
 * --------------------------------------------
 * v2 曾用正则 + 手写扫描器解析 describe/it。扫描器按「字符串字面量」跳过引号区间，
 * 但**不识别正则字面量**：`/"([^"]+)"/g` 这类正则里有 3 个双引号，会让扫描器的
 * 「当前是否在字符串内」状态在后续正文里彻底错位——表现是同文件里后面的
 * describe/it 全部丢失或被挂到错误的 describe 链上。
 *
 * 真实案例（change fix-device-catalog-modal-bugs）：
 *   tests/components/device-instance-refine.test.ts 里的
 *   `setBody.matchAll(/"([^"]+)"/g)` 导致扫描器状态错位，
 *   「分组顺序为基本信息 → 技术参数 → 采购与资产」场景被误挂到
 *   「设备实例列表的默认可见列与列设置」describe 下，
 *   于是 `pnpm sdd:coverage` 报假缺失（该场景其实有测试）。
 *
 * TypeScript 的 parser 本身就能正确区分字符串 / 模板字面量 / 正则字面量，
 * 用 AST 解析是唯一不会误判的做法。本模块只依赖 `typescript`（devDependency），
 * 由 tsx 直接执行。
 *
 * v4 · 跳过状态与断言强度
 * ------------------------
 * v3 只回答「场景名有没有出现在某个 it 作用域里」，于是两个假信号成立：
 *
 *   1. **被跳过的套件照样计 100%**。`describe.skipIf(!availability.ok)` 在
 *      无浏览器 / 无 dev server 时整组不执行，但覆盖率是「名义值」——
 *      change run-base-year-approval-flow 的评审就是这么发现
 *      「浏览器 e2e 从未真正执行、却标着 ✅」的。
 *   2. **存根断言照样计 100%**。`it` 标题里写了场景名就算覆盖，
 *      `expect(result).toBeDefined()` 加一句「当前实现尚未检查」就足以
 *      让一个未实现的需求计为 100%。
 *
 * 本模块因此额外产出两个信号：
 *   - `skipped`：it 是否落在被跳过的作用域里（describe 级 skip 向下传递）；
 *   - `weak`：it 体内是否**没有**可验证的强断言（无 expect / 仅弱断言 /
 *     断言被条件包裹）。
 */
import ts from "typescript";

/** 弱断言诊断结果 */
export type WeakAssertion = {
  /**
   * 弱断言的成因：
   *   - no-expect            有效断言一条都没有（空语句充当断言）
   *   - weak-only            断言都在，但全是弱断言方法
   *   - conditional-only     断言都在，但全被条件包裹（可能根本不执行）
   *   - weak-and-conditional 弱断言与条件包裹混杂
   */
  kind: "no-expect" | "weak-only" | "conditional-only" | "weak-and-conditional";
  /** 人话说明（报告直接打印） */
  reason: string;
  /** 有效断言总数（含委托给本地 helper 的） */
  expectCount: number;
};

export type TestScope = {
  /** 外层 describe 链（由外到内） */
  describes: string[];
  /** it 标题原文 */
  itTitle: string;
  /** describe 链 + it 标题 + it 体 */
  scope: string;
  /**
   * 该 it 的跳过性质。
   *
   * - `none`         未跳过
   * - `unconditional` 永远不执行（`.skip`）—— 是真缺口
   * - `conditional`  取决于运行时环境（`.skipIf`）—— 需要运行时证据判定
   *
   * **describe 级 skip 向下传递**给其内所有 it（含嵌套 describe 里的 it）。
   */
  skip: SkipKind;
  /** 弱断言诊断；null = 存在可验证的强断言 */
  weak: WeakAssertion | null;
  /** it 标题在源文件中的行号（1-based），用于报告定位 */
  line: number;
  /** 源文件路径（调用方传入，通常是相对仓库根的路径） */
  file: string;
  /**
   * 完整标题链（describe 链 + it 标题，用空格连接）。
   *
   * 与 vitest JSON 报告里的 `fullName` 格式一致，用于把静态解析出的作用域
   * 与**运行时证据**对上：只有 fullName 一致，才能说「这个 it 在那次运行里
   * 真的执行了」。
   */
  fullName: string;
};

/**
 * 取调用实参里的「标题」。
 *
 * 支持三类字面量：
 *   - 字符串字面量   "Requirement: X"
 *   - 无插值模板串   `Requirement: X`
 *   - 带插值模板串   `组织架构管理页（${reason}） | Requirement: X`
 *                     —— 只取**静态片段**，插值表达式（运行时才知道）不参与匹配。
 *                     与旧扫描器语义一致：模板串标题里的插值部分是噪声，
 *                     真正的需求名 / 场景名仍写在静态片段中。
 */
function titleOf(node: ts.CallExpression): string | null {
  const arg = node.arguments[0];
  if (!arg) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) {
    let text = arg.head.text;
    for (const span of arg.templateSpans) text += span.literal.text;
    return text;
  }
  return null;
}

/** describe / it 的调用形态 */
type CallInfo = {
  kind: "describe" | "it";
  /** 跳过的性质 */
  skip: SkipKind;
};

/**
 * 跳过的性质——决定「这个 it 到底会不会执行」的**可信度**。
 *
 *   - `none`        未跳过
 *   - `unconditional` `describe.skip` / `it.skip` —— **永远不执行**。
 *                  无论环境如何，这条路径上的场景就是没有测试覆盖，属于真缺口。
 *   - `conditional` `describe.skipIf(cond)` / `it.skipIf(cond)` —— 条件跳过。
 *                  **本项目禁止使用**：覆盖率必须是确定事实，analyzeCoverage
 *                  检测到 `conditional` 就直接抛错（见 coverage-core）。
 */
export type SkipKind = "none" | "unconditional" | "conditional";

/**
 * 判断调用是 describe 还是 it，并识别跳过修饰符。
 *
 * 覆盖的形态：
 *   - describe("T", fn) / it("T", fn)
 *   - describe.skip("T", fn) / it.skip / it.only / describe.only …
 *   - describe.skipIf(cond)("T", fn)  —— 柯里化：外层是 CallExpression，
 *     其 callee 又是 CallExpression(describe.skipIf(cond))。
 *   - describe.each([…])("T", fn) / it.each([…])("T", fn)
 *
 * 跳过修饰符取属性名的**最后一段**（`skip` / `skipIf`）：
 * 柯里化形态下属性名挂在内层调用的 callee 上（`describe.skipIf`），
 * 非柯里化形态下挂在当前调用的 callee 上（`describe.skip`），
 * 两者都要能取到，否则 skip 会被静默归一成普通 describe/it。
 */
function callInfoOf(node: ts.CallExpression): CallInfo | null {
  let expr: ts.Node = node.expression;
  let lastProp: string | null = null;

  // 柯里化：describe.skipIf(cond)(title, fn) —— expression 本身是 CallExpression
  if (ts.isCallExpression(expr)) {
    const inner = expr.expression;
    if (ts.isPropertyAccessExpression(inner)) {
      lastProp = inner.name.text;
      expr = inner.expression;
    } else {
      expr = inner;
    }
  } else if (ts.isPropertyAccessExpression(expr)) {
    // 属性访问：describe.skip / it.each / expect.soft
    lastProp = expr.name.text;
    expr = expr.expression;
  }

  if (ts.isIdentifier(expr) && (expr.text === "describe" || expr.text === "it")) {
    const skip: SkipKind =
      lastProp === "skip" ? "unconditional" : lastProp === "skipIf" ? "conditional" : "none";
    return { kind: expr.text, skip };
  }
  return null;
}

/**
 * 取 describe / it 的回调函数。
 *
 * 不能固定取 arguments[1]：vitest 支持 `describe(title, options, fn)` 三参数形态
 * （如 `describe.skipIf(cond)("…", { timeout: 60_000 }, () => {})`），此时
 * arguments[1] 是 options 对象而非回调——固定取 [1] 会让整块 describe 内的
 * 所有 it 被静默丢弃，报成「场景无测试」的假缺失（change serverless-event-bus
 * 的集成组整组因此 0 覆盖）。这里改为取第一个函数实参。
 */
function callbackOf(node: ts.CallExpression): ts.ArrowFunction | ts.FunctionExpression | null {
  for (const arg of node.arguments) {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) return arg;
  }
  return null;
}

/**
 * 取回调函数的函数体文本（it 体）。
 *
 * it 体参与匹配，是因为部分测试把「需求名 / 场景名」写进了断言内容而非标题里
 * （例如 describe 标题被多个需求名拼在一起的情形）。
 */
function bodyOf(node: ts.CallExpression, sf: ts.SourceFile): string {
  const cb = callbackOf(node);
  if (!cb) return "";
  return cb.body.getText(sf);
}

/* ------------------------------------------------------------------ *
 * 断言强度分析
 * ------------------------------------------------------------------ */

/**
 * 一律视为「弱」的断言方法：只证明值存在/为真，证明不了业务语义。
 *
 * 刻意**不含** `toBe(true)`：
 *   `expect(x).toBe(true)` 比 `expect(x).toBeTruthy()` **更强**（前者还排除了
 *   其它 truthy 值），把它算弱在逻辑上说不通。而它在���仓库里是主流写法
 *   （1247 处 subject 为表达式的 `toBe(布尔字面量)`），绝大多数是有意义的
 *   业务断言——全判弱会把 97 条正常用例染黄，工具当场失去可信度。
 *
 * `toBe(true)` 真正的问题形态是**同义反复**：`expect(true).toBe(true)`——
 * 无论实现怎么坏都恒成立。这由 `isTautology` 单独识别。
 */
const WEAK_MATCHERS = new Set(["toBeDefined", "toBeTruthy", "toBeFalsy"]);

/** 字面量节点（true / false / 字符串 / 数字） */
function isLiteralNode(node: ts.Node | undefined): boolean {
  if (!node) return false;
  return (
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.StringLiteral ||
    node.kind === ts.SyntaxKind.NumericLiteral
  );
}

/**
 * 同义反复检测：`expect(<字面量>).toBe(<字面量>)`。
 *
 * 这类断言**恒成立**——无论被测代码怎么坏都通过，是最强的存根信号。
 * 评审报告里 `expect(true).toBe(true);` 那种「smoke 断言」即属此类。
 */
function isTautology(
  expectCall: ts.CallExpression,
  matcherCall: ts.CallExpression | null
): boolean {
  if (!matcherCall) return false;
  const expected = matcherCall.arguments[0];
  if (!expected || !isLiteralNode(expected)) return false;
  const subject = expectCall.arguments[0];
  return subject !== undefined && isLiteralNode(subject);
}

/** 是否是 `expect(...)` 调用（含 expect.soft / expect.poll 形态） */
function isExpectCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === "expect";
  if (ts.isPropertyAccessExpression(callee)) {
    return ts.isIdentifier(callee.expression) && callee.expression.text === "expect";
  }
  return false;
}

/**
 * 取 expect 链末端的断言方法名与调用节点。
 *
 *   expect(x).toBe(y)              → ("toBe", CallExpression)
 *   expect(x).resolves.toBe(y)     → ("toBe", CallExpression)
 *   expect(x).not.toBe(y)          → ("toBe", CallExpression)
 *   expect.soft(x).toBe(y)         → ("toBe", CallExpression)
 *
 * 链上的属性名按出现顺序收集，**最后一个**才是真正的断言方法
 * （`not` / `resolves` / `rejects` 只是修饰）。
 */
function matcherOf(expectCall: ts.CallExpression): {
  matcher: string | null;
  call: ts.CallExpression | null;
} {
  let cur: ts.Node = expectCall;
  let matcher: string | null = null;
  let call: ts.CallExpression | null = null;
  for (;;) {
    const parent: ts.Node | undefined = cur.parent;
    if (!parent) break;
    if (ts.isPropertyAccessExpression(parent) && parent.expression === cur) {
      matcher = parent.name.text;
      cur = parent;
      continue;
    }
    if (ts.isCallExpression(parent) && parent.expression === cur) {
      call = parent;
    }
    break;
  }
  return { matcher, call };
}

/**
 * 断言被什么条件结构包裹（= 「可能根本不执行」）。
 *
 * 只认**真正让断言变成可选**的结构：
 *   - if / else 分支        —— 条件不成立时整块跳过（评审报告 §3.3 的原例）
 *   - catch 块              —— 没抛错就永远不执行（try 成功即等于什么都没验）
 *   - 三元表达式分支
 *   - `a && expect(...)` / `a || expect(...)` 的右操作数（短路）
 *
 * **刻意不算**的两类（否则全是假阳性）：
 *   - for / while 循环体 —— 表驱动测试的标配（`for (const e of REGISTRY)`），
 *     集合非空时断言必然执行；把它判成弱会把几十条正常用例全染黄。
 *   - 嵌套函数体 —— `await runScenario(async (tx) => { expect(...) })` 这种
 *     「断言在回调里」的写法，回调由 helper 负责调用，是本仓库的主流写法。
 *
 * 返回具体结构名而不只是布尔，是为了让报告能说清「这条断言被什么挡住了」——
 * 清理时才知道该改条件分支还是该改断言本身。
 */
function conditionalWrapperOf(node: ts.Node, root: ts.Node): string | null {
  let cur: ts.Node | undefined = node.parent;
  while (cur && cur !== root) {
    if (ts.isIfStatement(cur)) return "if";
    if (ts.isCatchClause(cur)) return "catch";
    if (ts.isConditionalExpression(cur)) return "ternary";
    if (
      ts.isBinaryExpression(cur) &&
      (cur.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        cur.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      // 只有右操作数是条件化的；左操作数总会求值
      const start = cur.right.getStart();
      const end = cur.right.getEnd();
      if (node.getStart() >= start && node.getEnd() <= end) return "&&/||";
    }
    cur = cur.parent;
  }
  return null;
}

/** 收集 it 体内的 expect 调用 */
function collectExpectCalls(body: ts.Node): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isExpectCall(node)) out.push(node);
    ts.forEachChild(node, visit);
  };
  visit(body);
  return out;
}

/**
 * 收集本文件内定义的 helper（函数声明 / 变量赋值的箭头函数）及其函数体。
 *
 * 为什么需要这一步
 * ----------------
 * 真实测试里大量 it 把断言**委托**给本文件定义的 helper：
 *
 *   function expectParseError(result, msg) {
 *     expect(result.error.issues.map(...).join()).toContain(msg);
 *   }
 *   it("Scenario: 采购价为负数被拒绝", () => {
 *     expectParseError(deviceCreateBodySchema.safeParse({...}), "不能为负数");
 *   });
 *
 * 若只扫 it 体内的字面 `expect(`，这类 it 会被误判成「no-expect」——
 * 报告里塞满假阳性，工具直接失去价值。
 *
 * 因此**解析 helper 的函数体**，把里面的断言一并计入 it 的有效断言集合：
 * helper 里有强断言 → 这个 it 确实有验证能力；helper 里啥也没有 →
 * 这个 it 确实是空壳。
 *
 * 跨文件导入的 helper 无法静态解析，保守起见不计入（宁可漏报，不可误报成
 * 「这个 it 没有任何断言」——那是更强的指控）。
 */
function collectLocalHelperBodies(sf: ts.SourceFile): Map<string, ts.Node[]> {
  const bodies = new Map<string, ts.Node[]>();
  const add = (name: string, body: ts.Node): void => {
    const list = bodies.get(name);
    if (list) list.push(body);
    else bodies.set(name, [body]);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      // overload 声明没有 body（只有签名），跳过
      if (node.body) add(node.name.text, node.body);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const init = node.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        add(node.name.text, init.body);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return bodies;
}

/** 一条「有效断言」的画像 */
type AssertSite = {
  /** 断言方法是否弱（toBeDefined / toBeTruthy / toBe(布尔字面量) 等） */
  weakMatcher: boolean;
  /** 是否被条件包裹（可能根本不执行） */
  conditional: boolean;
};

/** 收集函数体里对本地 helper 的调用 */
function collectLocalHelperCalls(
  body: ts.Node,
  helpers: Map<string, ts.Node[]>
): { name: string; call: ts.CallExpression }[] {
  const out: { name: string; call: ts.CallExpression }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (helpers.has(name)) out.push({ name, call: node });
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return out;
}

/**
 * 收集函数体里的有效断言（直接断言 + 委托给本地 helper 的断言）。
 *
 * @param path 递归路径上的 helper 名，用于切断 helper 互相调用的环
 */
function collectAssertSites(
  body: ts.Node,
  helpers: Map<string, ts.Node[]>,
  path: Set<string>
): AssertSite[] {
  const sites: AssertSite[] = [];

  // 1. 直接的 expect 调用
  for (const call of collectExpectCalls(body)) {
    const { matcher, call: matcherCall } = matcherOf(call);
    sites.push({
      weakMatcher:
        (matcher !== null && WEAK_MATCHERS.has(matcher)) || isTautology(call, matcherCall),
      conditional: conditionalWrapperOf(call, body) !== null,
    });
  }

  // 2. 委托给本地 helper 的断言
  for (const { name, call } of collectLocalHelperCalls(body, helpers)) {
    if (path.has(name)) continue; // helper 互相调用 → 切断环
    const conditionalAtCall = conditionalWrapperOf(call, body) !== null;
    const nextPath = new Set(path);
    nextPath.add(name);
    for (const helperBody of helpers.get(name) ?? []) {
      for (const site of collectAssertSites(helperBody, helpers, nextPath)) {
        sites.push({
          weakMatcher: site.weakMatcher,
          // helper 内的条件 与 调用点的条件 取并集
          conditional: site.conditional || conditionalAtCall,
        });
      }
    }
  }

  return sites;
}

/**
 * 分析 it 体的断言强度。
 *
 * 判定口径：**存在一条「强断言方法 + 非条件包裹」的 expect 才算有验证能力**。
 * 只要没有这样的 expect，it 就被标为 weak，并给出成因：
 *
 *   - no-expect            有效断言一条都没有（空语句充当断言）
 *   - weak-only            断言都在，但全是弱断言方法
 *   - conditional-only     断言都在，但全被条件包裹（可能根本不执行）
 *   - weak-and-conditional 强断言全被条件挡住，裸奔的只有弱断言
 *
 * 委托给本地 helper 的断言**一并计入**——helper 里有强断言，这个 it 就确实
 * 有验证能力；helper 里啥也没有，这个 it 就确实是空壳。
 */
function analyzeWeak(
  cb: ts.ArrowFunction | ts.FunctionExpression,
  helpers: Map<string, ts.Node[]>
): WeakAssertion | null {
  const sites = collectAssertSites(cb.body, helpers, new Set());

  if (sites.length === 0) {
    return {
      kind: "no-expect",
      reason:
        "it 体内没有任何 expect() 断言（空语句无法证明任何行为；若断言隐含在会抛错的轮询 helper 里，请显式补一条 expect）",
      expectCount: 0,
    };
  }

  const hasStrong = sites.some((s) => !s.weakMatcher && !s.conditional);
  if (hasStrong) return null;

  const allWeak = sites.every((s) => s.weakMatcher);
  const allConditional = sites.every((s) => s.conditional);

  if (allWeak && allConditional) {
    return {
      kind: "weak-and-conditional",
      reason: "断言既是弱断言方法，又被条件包裹（可能根本不执行）",
      expectCount: sites.length,
    };
  }
  if (allWeak) {
    return {
      kind: "weak-only",
      reason: "仅含弱断言（toBeDefined / toBeTruthy / toBe(布尔字面量) 等），证明不了业务语义",
      expectCount: sites.length,
    };
  }
  if (allConditional) {
    return {
      kind: "conditional-only",
      reason: "断言全部被条件包裹（如 if (...) { expect(...) }），可能根本不执行",
      expectCount: sites.length,
    };
  }
  // 混杂：强断言存在但全被条件挡住，裸奔的反而只有弱断言
  return {
    kind: "weak-and-conditional",
    reason: "强断言全部被条件包裹，裸奔的只有弱断言（可能根本不执行）",
    expectCount: sites.length,
  };
}

/**
 * 解析单个测试文件，返回全部测试作用域。
 *
 * 注释不计入作用域：TS 的 trivia（注释）不属于 AST 节点，
 * `getText()` 只会取到真实代码，因此注释里的字样不会成为「覆盖证据」。
 */
export function parseTestScopes(fileName: string, source: string): TestScope[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const scopes: TestScope[] = [];

  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  // 本文件内定义的 helper（断言可能藏在里面，需一并解析）
  const helpers = collectLocalHelperBodies(sf);

  /**
   * @param inheritedSkip 外层 describe 的跳过性质（describe 级 skip 向下传递）
   */
  const walk = (node: ts.Node, describes: string[], inheritedSkip: SkipKind): void => {
    if (ts.isCallExpression(node)) {
      const info = callInfoOf(node);
      const title = titleOf(node);
      if (info?.kind === "describe" && title !== null) {
        const cb = callbackOf(node);
        const body = cb ? cb.body : null;
        // describe 级 skip 向下传递；unconditional 优先于 conditional（更强的确定性）
        const skip = mergeSkip(inheritedSkip, info.skip);
        if (body && ts.isBlock(body)) {
          for (const stmt of body.statements) walk(stmt, [...describes, title], skip);
        }
        return;
      }
      if (info?.kind === "it" && title !== null) {
        const cb = callbackOf(node);
        scopes.push({
          describes,
          itTitle: title,
          scope: [...describes, title, bodyOf(node, sf)].join(" "),
          skip: mergeSkip(inheritedSkip, info.skip),
          weak: cb ? analyzeWeak(cb, helpers) : null,
          line: lineOf(node),
          file: fileName,
          fullName: [...describes, title].join(" "),
        });
        return;
      }
    }
    ts.forEachChild(node, (child) => walk(child, describes, inheritedSkip));
  };

  walk(sf, [], "none");
  return scopes;
}

/**
 * 合并两层跳过性质。
 *
 * `unconditional` 优先：外层 `describe.skip` 意味着内层的一切都**永不执行**，
 * 即使内层自己写的是 `it.skipIf(cond)`（那个条件再真也没用）。
 */
function mergeSkip(outer: SkipKind, inner: SkipKind): SkipKind {
  if (outer === "unconditional" || inner === "unconditional") return "unconditional";
  if (outer === "conditional" || inner === "conditional") return "conditional";
  return "none";
}
