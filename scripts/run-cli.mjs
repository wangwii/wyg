/**
 * 本地 CLI 子进程调用（跨平台，scripts/ 下共用）
 * ----------------------------------------------------------------
 * Windows 上调用 node_modules/.bin 里的 CLI 有四个坑，缺一个都会导致
 * 「本地恒红、CI（ubuntu）恒绿」这种最难排查的失败：
 *
 *   1. node_modules/.bin/<name> 是**无扩展名的 POSIX shim**（`#!/bin/sh`），
 *      Node 在 Windows 上无法执行它 → 本地 .bin 存在时必须落到 `<name>.cmd`；
 *      本地 .bin 不存在时回退**裸名**，交给 cmd.exe 的 PATHEXT 解析
 *      （硬加 .cmd 会在 pnpm.exe 这类全局 shim 上报「不是内部或外部命令」）；
 *   2. `<name>.cmd` **不经 shell 会 EINVAL**（.cmd/.bat 必须由 shell 启动）
 *      → 必须 `shell: true`；
 *   3. cmd.exe 把命令名里的 `/` 当作开关起始，`node_modules/.bin/x.cmd`
 *      会被切成命令 `node_modules` → Windows 上路径分隔符必须是反斜杠；
 *   4. Node v24 起 `spawnSync(cmd, args, { shell: true })` 是 DEP0190 运行时弃用：
 *      args 不转义、只按空格 join 后交给 shell，既有注入隐患又每次打印警告。
 *      故 runCli 把命令**显式拼成单个字符串**（Node 内部本来也是这么拼的，
 *      行为零差异），并用 SAFE_TOKEN 白名单拒绝任何 shell 元字符。
 *
 * 四者合一的正确姿势就是这里导出的 `bin()` + `runCli()`。
 * scripts/ 下任何要起 CLI 子进程的地方都应走它，不要裸写 spawnSync ——
 * sdd:new-change 曾因漏了 `shell: true` 在本地恒失败（2026-10-04 修复），
 * 2026-11-19 起 new-change / pre-archive 也统一收敛到 runCli。
 *
 * 约定：返回的是**相对路径**，调用方必须把 cwd 设为项目根（runCli 已代劳）。
 * 白名单只放行「无空白、无 shell 元字符」的 token；含空格的路径参数在
 * shell:true 下本来就会被拆错，现在改为明确报错（而不是悄悄拼出错误命令）。
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd());

/**
 * 解析 node_modules/.bin/<name> 的可执行目标（Windows 自动指向 .cmd）。
 *
 * 本地 .bin 存在时优先用本地副本（避免吃到全局版本导致行为漂移）；
 * 不存在时回退到裸名，交给 PATH 解析（如全局安装）。
 *
 * @param {string} name CLI 名，如 "openspec" / "tsx" / "pnpm"
 * @param {string} [root] 项目根，默认 process.cwd()
 * @returns {string}
 */
export function bin(name, root = ROOT) {
  if (process.platform === "win32") {
    const local = join(root, "node_modules", ".bin", `${name}.cmd`);
    // 见文件头第 1、3 点：本地 .bin 存在时走反斜杠 .cmd（否则 cmd 会把路径切成
    // 命令名）；不存在时回退裸名，让 cmd.exe 用 PATHEXT 找 .exe/.cmd/.bat。
    // 2026-11-19：原来这里硬回退 `${name}.cmd`，把 pnpm（mise 的 pnpm.exe）
    // 拼成找不到的 pnpm.cmd，导致 sdd:pre-archive 的 `$ pnpm sdd:verify` 失败。
    return existsSync(local) ? `node_modules\\.bin\\${name}.cmd` : name;
  }
  const local = join(root, "node_modules", ".bin", name);
  return existsSync(local) ? `node_modules/.bin/${name}` : name;
}

/**
 * shell:true 下允许出现的 token 字符集。
 *
 * Node 在 shell:true 时把 [cmd, ...args].join(" ") 原样交给 shell——**不转义**。
 * 只要放行空白或 & | ; $ ` " ' * ? < > ( ) 等元字符，就等于把命令拼接权交给
 * 调用方；这里一律拒绝，把 DEP0190 背后的注入隐患一并堵死。
 * 允许集覆盖本项目实际用法：CLI 子命令、flag、kebab-case change id、
 * 相对/绝对路径（含 Windows 反斜杠与盘符冒号）、--out 目录名等。
 */
const SAFE_TOKEN = /^[A-Za-z0-9_./\\:+=,@-]+$/;
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * 把 (name, args) 拼成一条可安全交给 shell 的命令字符串。
 *
 * 导出以便单测直接验证拼串与白名单（不真的起子进程）。
 *
 * @param {string} name CLI 名
 * @param {string[]} args 参数
 * @param {string} [root] 项目根
 * @returns {string}
 * @throws {Error} name/args 含空白或 shell 元字符时
 */
export function buildShellCommand(name, args, root = ROOT) {
  if (typeof name !== "string" || !SAFE_NAME.test(name)) {
    throw new Error(`不安全的 CLI 名：${JSON.stringify(name)}（只允许字母数字、_ . -）`);
  }
  if (!Array.isArray(args)) {
    throw new Error("runCli 的 args 必须是字符串数组");
  }
  for (const arg of args) {
    if (typeof arg !== "string" || !SAFE_TOKEN.test(arg)) {
      throw new Error(
        `拒绝执行含空白或 shell 元字符的参数：${JSON.stringify(arg)}。` +
          "shell:true 下参数不转义（DEP0190），如需传特殊字符请改用 process.execPath 直调。"
      );
    }
  }
  const cmdBin = bin(name, root);
  if (!SAFE_TOKEN.test(cmdBin)) {
    throw new Error(`解析出的 CLI 路径含非法字符：${cmdBin}`);
  }
  return [cmdBin, ...args].join(" ");
}

/**
 * 同步调用本地 CLI，返回 spawnSync 原始结果（status / error / signal）。
 *
 * 见文件头第 4 点：**不传 args**，整条命令以单字符串交给 spawnSync，
 * 这样 Node 不会再触发 DEP0190（v24+ 的运行时弃用警告）。
 *
 * @param {string} name CLI 名
 * @param {string[]} args 参数
 * @param {{ root?: string, stdio?: import("node:child_process").StdioOptions,
 *           encoding?: BufferEncoding, maxBuffer?: number,
 *           env?: NodeJS.ProcessEnv }} [options]
 */
export function runCli(name, args, options = {}) {
  const root = options.root ?? ROOT;
  let command;
  try {
    command = buildShellCommand(name, args, root);
  } catch (err) {
    // 参数校验失败绝不落到 shell。伪装成 spawnSync 的失败结果：所有调用方
    // 都检查 res.error，会走 describeCliFailure 的人话报错分支。
    const error = err instanceof Error ? err : new Error(String(err));
    error.code = "ERR_UNSAFE_ARGS";
    return { status: 1, signal: null, stdout: "", stderr: "", error };
  }
  return spawnSync(command, {
    stdio: options.stdio ?? "inherit",
    cwd: root,
    // 见文件头第 2、4 点：Windows 的 .cmd 必须经 shell；且不传 args 以避开 DEP0190
    shell: true,
    ...(options.encoding ? { encoding: options.encoding } : {}),
    ...(options.maxBuffer ? { maxBuffer: options.maxBuffer } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
}

/**
 * 本地 node_modules/.bin 里是否装了该 CLI。
 *
 * 用于「缺依赖时给出人话报错」的分支——别等到 subprocess 报 ENOENT/EINVAL
 * 才发现，那种 errno 在 Windows 上成因太多，看不出是没装还是怎么了。
 *
 * @param {string} name CLI 名
 * @param {string} [root] 项目根，默认 process.cwd()
 * @returns {boolean}
 */
export function hasLocalBin(name, root = ROOT) {
  const ext = process.platform === "win32" ? ".cmd" : "";
  return existsSync(join(root, "node_modules", ".bin", `${name}${ext}`));
}

/**
 * 把 spawnSync 的失败原因翻译成人类可读的一句话。
 * 历史教训：直接打印「请确认已安装依赖」会把真正的报错吞掉，排查成本极高。
 */
export function describeCliFailure(res) {
  if (res.error) {
    const code = res.error.code ?? "";
    const hints = {
      ENOENT: "可执行文件不存在（多半是 node_modules/.bin 里的 shim 没被正确解析）",
      EINVAL: "Windows 上 .cmd 必须经 shell 启动（缺 shell: true）",
      EPERM: "无执行权限",
      ERR_UNSAFE_ARGS: "命令参数含空白或 shell 元字符，已被 runCli 拒绝（未执行）",
    };
    return `${res.error.message}${hints[code] ? ` —— ${hints[code]}` : ""}`;
  }
  if (res.signal) return `被信号终止：${res.signal}`;
  return `退出码 ${res.status}`;
}
