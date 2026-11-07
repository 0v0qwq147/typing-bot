#!/usr/bin/env node
'use strict';

/**
 * typing-bot / index.js
 * ---------------------------------------------------------------------------
 * 屏幕英文文本 -> OCR -> 虚拟键序列 -> 真实键盘输入
 *
 * 定位：给"你自己在开发的"打字游戏提供一个可编程 bot 对手，用于回归测试
 * （房间同步、掉帧容错、结算逻辑、错误输入的判定等）。
 *
 * 设计要点：
 *  1. 按键注入走虚拟键码 (VK + Shift)，而不是 Unicode 注入。这样对那些监听
 *     keydown.code / WM_KEYDOWN 而不是 WM_CHAR 的游戏同样有效。
 *  2. "手感"参数全部集中在 buildSteps()，方便调出不同水平的对手。
 *  3. 默认带 lead-time 倒计时 + dry-run，避免误打到别的应用。
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { createWorker, PSM } = require('tesseract.js');
const { t, setLang } = require('./i18n.js');

const PS1 = path.join(__dirname, 'windows.ps1');
const TMPDIR = path.join(os.tmpdir(), 'typing-bot');
const REGION_FILE = path.join(__dirname, 'region.json');

// 截图内容指纹：画面没变就不必再跑一次 OCR。
function sha1File(file) {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
  } catch { return null; }
}

// 记住上次框选的区域，省得每次手抄坐标。
function saveRegion(rect) {
  try {
    fs.writeFileSync(REGION_FILE, JSON.stringify({ ...rect, savedAt: new Date().toISOString() }, null, 2));
    return true;
  } catch { return false; }
}

function loadRegion() {
  try {
    const r = JSON.parse(fs.readFileSync(REGION_FILE, 'utf8'));
    if (Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.w) && Number.isFinite(r.h)) return r;
  } catch { /* 没存过或文件坏了 */ }
  return null;
}

// ------------------------------------------------------------------ 可调默认值
const DEFAULTS = {
  lang: 'eng',
  psm: PSM.SINGLE_LINE,

  scale: 1,           // 截图放大倍数；1 = 不放大（最快），小字看不清再用 --scale 2
  whitelist: '',      // 限定字符集，能显著提高识别率
  invert: false,      // 反色后再识别：深色背景 + 亮色文字的游戏需要

  // 默认就按「快」来：这些是老版本让人手动调的参数，现在开箱即用。
  wpm: 150,           // 目标手速
  acc: 1,             // 准确率，<1 时会随机打错并退格纠正
  jitter: 0.12,       // 击键间隔抖动比例
  wordPauseMs: 0,     // 每个单词后的额外停顿
  thinkMs: 0,         // 起手思考时间
  keyDownMs: 4,       // 单个键按下到抬起的时长

  leadMs: 1200,       // 打字前的准备倒计时
  maxChars: 300,      // 安全阀：超过则认为 OCR 出了噪声，拒绝执行
  loopIntervalMs: 120,
};

// 针对具体游戏的预设：--game dz 就是桌面上那个「筋斗云打字」（C++ 关键字）。
// 屏幕上是小写英文关键字 + 下划线 / #，字号很大——限定字符集后识别又快又准。
const GAME_PRESETS = {
  dz: {
    whitelist: 'abcdefghijklmnopqrstuvwxyz_#',
    scale: 1,
    invert: true,          // 游戏是深色背景 + 亮色字符
    psm: PSM.SINGLE_LINE,
    wpm: 160,
    jitter: 0.08,
    wordPauseMs: 0,
    thinkMs: 0,
    keyDownMs: 3,
    loopIntervalMs: 100,
  },
};

// ===========================================================================
// 1. 字符 -> 虚拟键映射（US 布局）
// ===========================================================================
const VK = {
  SPACE: 0x20, ENTER: 0x0d, TAB: 0x09, BACK: 0x08, LSHIFT: 0xa0,
};

// 不需要 Shift 的符号键
const PLAIN_KEY = {
  '-': 0xbd, '=': 0xbb, '[': 0xdb, ']': 0xdd, '\\': 0xdc,
  ';': 0xba, "'": 0xde, ',': 0xbc, '.': 0xbe, '/': 0xbf, '`': 0xc0,
};

// 需要 Shift 的符号键
const SHIFT_KEY = {
  '_': 0xbd, '+': 0xbb, '{': 0xdb, '}': 0xdd, '|': 0xdc,
  ':': 0xba, '"': 0xde, '<': 0xbc, '>': 0xbe, '?': 0xbf, '~': 0xc0,
  '!': 0x31, '@': 0x32, '#': 0x33, '$': 0x34, '%': 0x35,
  '^': 0x36, '&': 0x37, '*': 0x38, '(': 0x39, ')': 0x30,
};

/** 把单个字符翻译成一个物理按键。返回 null 表示该字符无法直接打出。 */
function mapChar(ch) {
  if (ch === ' ') return { vk: VK.SPACE, shift: false };
  if (ch === '\n') return { vk: VK.ENTER, shift: false };
  if (ch === '\t') return { vk: VK.TAB, shift: false };

  const code = ch.charCodeAt(0);
  if (code >= 97 && code <= 122) return { vk: 0x41 + code - 97, shift: false };
  if (code >= 65 && code <= 90) return { vk: 0x41 + code - 65, shift: true };
  if (code >= 48 && code <= 57) return { vk: 0x30 + code - 48, shift: false };
  if (PLAIN_KEY[ch] !== undefined) return { vk: PLAIN_KEY[ch], shift: false };
  if (SHIFT_KEY[ch] !== undefined) return { vk: SHIFT_KEY[ch], shift: true };
  return null;
}

// 打错时的"手滑"候选，keyboard 上相邻的键
const ADJACENT = {
  a: 'sqwz', b: 'vghn', c: 'xdfv', d: 'sfce', e: 'wrsd', f: 'dgrv',
  g: 'fhtb', h: 'gjyn', i: 'uokj', j: 'hknm', k: 'jlmo', l: 'kop',
  m: 'njk', n: 'bhm', o: 'iplk', p: 'ol', q: 'wa', r: 'etfd',
  s: 'awdx', t: 'rygf', u: 'yijh', v: 'cfgb', w: 'qase', x: 'zsdc',
  y: 'tugh', z: 'xas',
  ' ': 'cvn', '.': ',', ',': '.', "'": ';', ';': "'",
};

function pickWrongKey(ch) {
  const pool = ADJACENT[ch.toLowerCase()] || ADJACENT[ch];
  if (!pool) return null;
  const wrong = pool[Math.floor(Math.random() * pool.length)];
  return mapChar(wrong);
}

// ===========================================================================
// 2. 击键序列生成（"人类手感"模型都在这里）
// ===========================================================================

/** 近似高斯抖动，避免间隔过于均匀而显得机械 */
function jitterize(base, factor) {
  if (factor <= 0) return base;
  const u = (Math.random() + Math.random() + Math.random()) / 3; // 0..1, 中间集中
  const noise = (u - 0.5) * 2 * factor;
  return Math.max(0, base * (1 + noise));
}

/**
 * 把一段文本展开成按键步骤序列。
 * 每个 step: { vk, shift, pre, post }
 *   pre  —— 按下这键之前等待多久
 *   post —— 抬起之后等待多久
 */
function buildSteps(text, cfg) {
  const steps = [];
  const msPerChar = 60000 / (Math.max(1, cfg.wpm) * 5); // WPM -> 每字符毫秒
  let prev = null;
  let plannedErrors = 0;

  for (const ch of text) {
    const mapped = mapChar(ch);
    if (!mapped) continue;

    // 第一个键之前不再额外等一个间隔，那段时间由 thinkMs 承担
    let pre = prev === null ? 0 : jitterize(msPerChar, cfg.jitter);

    // 单词边界稍微停顿一下，这是真人打字节奏最明显的特征
    if (prev === ' ' && cfg.wordPauseMs > 0) {
      pre += cfg.wordPauseMs * (0.4 + Math.random() * 1.2);
    }

    // 随机手滑：打错 -> 停顿 -> 退格 -> 重打。用于测试游戏的纠错/判错逻辑
    if (cfg.acc < 1 && Math.random() > cfg.acc) {
      const wrong = pickWrongKey(ch);
      if (wrong) {
        plannedErrors++;
        steps.push({
          vk: wrong.vk, shift: wrong.shift,
          pre: Math.round(pre * 0.5),
          post: Math.round(msPerChar * 0.3),
        });
        steps.push({
          vk: VK.BACK, shift: false,
          pre: 0,
          post: Math.round(msPerChar * 0.28),
        });
        pre = jitterize(msPerChar * 0.6, cfg.jitter);
      }
    }

    steps.push({ vk: mapped.vk, shift: mapped.shift, pre: Math.round(pre), post: 0 });
    prev = ch;
  }

  if (steps.length) steps[0].pre += cfg.thinkMs;
  return { steps, plannedErrors };
}

// ===========================================================================
// 3. Windows 原生桥接
// ===========================================================================
// 每次 spawn 一个 powershell.exe 要 2 秒上下（进程启动 + Add-Type 编译 C#），
// 一次完整流程要调 3 次（切焦点 / 截图 / 打字），光开销就 5-6 秒——这是「跑起来
// 没反应」的主因。改成常驻宿主：启动一次，之后每个命令走 stdin 一行 JSON、
// stdout 一行 JSON，单次往返降到几十毫秒。
let psHost = null;
let psHostDisabled = false;

function startPsHost() {
  const proc = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-STA',
    '-ExecutionPolicy', 'Bypass',
    '-File', PS1, 'serve',
  ], { windowsHide: true });

  const st = { proc, buf: '', seq: 0, pending: new Map() };

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    st.buf += d;
    let i;
    while ((i = st.buf.indexOf('\n')) >= 0) {
      const line = st.buf.slice(0, i).trim();
      st.buf = st.buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const p = st.pending.get(msg.id);
      if (!p) continue;
      st.pending.delete(msg.id);
      p.resolve(msg.payload);
    }
  });

  const die = (err) => {
    const e = err instanceof Error ? err : new Error(String(err));
    e.transport = true;
    for (const p of st.pending.values()) p.reject(e);
    st.pending.clear();
    if (psHost === st) psHost = null;
    psHostDisabled = true;     // 本次进程内不再尝试常驻，全部回退一次性调用
  };
  proc.on('error', die);
  proc.on('exit', () => die(new Error('PowerShell 常驻进程已退出')));
  proc.stderr.on('data', () => { /* Add-Type 之类偶尔会往 stderr 写，忽略 */ });

  return st;
}

function hostCall(args) {
  const st = psHost || (psHost = startPsHost());

  // ['capture','-Out','C:\\x.png','-X','10'] -> {id, Command:'capture', Out:..., X:10}
  const req = { id: ++st.seq, Command: String(args[0]) };
  for (let i = 1; i < args.length; i += 2) {
    const key = String(args[i]).replace(/^-+/, '');
    const val = args[i + 1];
    if (val === undefined) { req[key] = true; continue; }   // 纯开关
    req[key] = /^-?\d+$/.test(String(val)) ? Number(val) : String(val);
  }

  return new Promise((resolve, reject) => {
    st.pending.set(req.id, { resolve, reject });
    try {
      st.proc.stdin.write(`${JSON.stringify(req)}\n`);
    } catch (e) {
      st.pending.delete(req.id);
      const err = new Error(`写入常驻进程失败：${e.message}`);
      err.transport = true;
      reject(err);
    }
  }).then((payload) => {
    if (!payload || payload.ok === false) {
      throw new Error((payload && payload.error) || 'PowerShell 命令失败');
    }
    return payload;
  });
}

function runPsOneShot(args, { silent = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-STA',
      '-ExecutionPolicy', 'Bypass',
      '-File', PS1,
      ...args.map(String),
    ], { windowsHide: true });

    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('error', reject);
    child.on('close', () => {
      const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const jsonLine = [...lines].reverse().find((l) => l.startsWith('{'));
      if (!jsonLine) {
        return reject(new Error(`PowerShell 无有效输出${err ? `：${err.trim()}` : ''}`));
      }
      try {
        const parsed = JSON.parse(jsonLine);
        if (!parsed.ok) return reject(new Error(parsed.error || '未知 PowerShell 错误'));
        resolve(parsed);
      } catch (e) {
        reject(new Error(`解析 PowerShell 输出失败：${jsonLine.slice(0, 300)}`));
      }
    });
    void silent;
  });
}

// 交互式 UI 命令（拖拽框选、按键自检窗口）必须在独立进程里跑：它们会自己
// 开窗并跑消息循环，塞进常驻宿主里会收不到按键 / 卡住宿主的读取循环。
const ONESHOT_COMMANDS = new Set(['pick-region', 'input-probe']);

// 对外统一入口：优先走常驻宿主，宿主不可用时静默回退到一次性进程。
function runPs(args, opts = {}) {
  if (psHostDisabled || ONESHOT_COMMANDS.has(String(args[0]))) {
    return runPsOneShot(args, opts);
  }
  return hostCall(args).catch((e) => {
    if (!e.transport) throw e;          // 命令本身报错，原样上抛
    return runPsOneShot(args, opts);
  });
}

function shutdownPsHost() {
  if (!psHost) return;
  try { psHost.proc.stdin.end(); } catch { /* ignore */ }
  try { psHost.proc.kill(); } catch { /* ignore */ }
  psHost = null;
  psHostDisabled = true;
}

process.on('exit', shutdownPsHost);
process.on('SIGINT', () => { shutdownPsHost(); process.exit(130); });

function listWindows() {
  return runPs(['list-windows']);
}

function capture(target, cfg, tag = 'capture') {
  const outFile = path.join(TMPDIR, `${tag}-${Date.now()}.png`);
  const args = ['capture', '-Out', outFile, '-Scale', cfg.scale];

  // --region 是屏幕绝对坐标，--crop 才是窗口内的相对坐标。
  // 两者必须分开处理：如果同时给了 --window 和 --region，窗口截图会把屏幕坐标
  // 当成窗口内裁剪框，拍到完全错误的地方（表现为"识别不到 / 打不出字"）。
  // 此时改为：仍按屏幕坐标截图，--window 只用于打字前自动切焦点。
  const useWindow = (target.window || target.handle) && (!target.rect || target.crop);

  if (useWindow) {
    if (target.handle) args.push('-Handle', target.handle);
    else args.push('-Window', target.window);
    if (target.crop) {
      args.push('-X', target.crop.x, '-Y', target.crop.y, '-W', target.crop.w, '-H', target.crop.h);
    }
  }
  else if (target.rect) {
    args.push('-X', target.rect.x, '-Y', target.rect.y, '-W', target.rect.w, '-H', target.rect.h);
  }

  // 开关必须放在最后：宿主协议按「-键 值」两两配对，孤立的开关只能在末尾。
  if (cfg.invert) args.push('-Invert');

  return runPs(args).then((r) => ({ ...r, file: outFile }));
}

function typeSequence(steps, cfg, target) {
  const seqFile = path.join(TMPDIR, `seq-${Date.now()}.json`);
  fs.mkdirSync(TMPDIR, { recursive: true });
  fs.writeFileSync(seqFile, JSON.stringify({ keyDelay: cfg.keyDownMs, steps }), 'utf8');

  // LeadMs 传 0：准备倒计时已经在 runOnce 里等过了，这里再传一次会白等两遍。
  const args = ['type', '-TextFile', seqFile, '-KeyDelay', cfg.keyDownMs, '-LeadMs', 0];
  if (target.window) args.push('-Window', target.window);
  else if (target.handle) args.push('-Handle', target.handle);

  return runPs(args).then((r) => {
    try { fs.unlinkSync(seqFile); } catch { /* ignore */ }
    return r;
  });
}

// ===========================================================================
// 4. OCR
// ===========================================================================
let ocrWorker = null;
let ocrReady = false;
let ocrInitPromise = null;

// 加载语言包约 2.5 秒。做成单飞（single-flight）：并行预热和正式识别同时进来时
// 也只会创建一个 worker，不会互相抢着初始化。
function getWorker(cfg) {
  if (ocrWorker && ocrReady) return Promise.resolve(ocrWorker);
  if (ocrInitPromise) return ocrInitPromise;

  ocrInitPromise = (async () => {
    process.stderr.write(`${t('ocrLoading')}\n`);
    const worker = await createWorker(cfg.lang, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && cfg.debug) {
          process.stderr.write(`  [OCR] ${Math.round(m.progress * 100)}%\n`);
        }
      },
    });
    const params = { tessedit_pageseg_mode: String(cfg.psm) };
    if (cfg.whitelist) params.tessedit_char_whitelist = cfg.whitelist;
    await worker.setParameters(params);
    ocrWorker = worker;
    ocrReady = true;
    return worker;
  })();

  ocrInitPromise.catch(() => { ocrInitPromise = null; });
  return ocrInitPromise;
}

async function recognize(file, cfg) {
  const worker = await getWorker(cfg);
  const { data } = await worker.recognize(file);
  return { text: data.text || '', confidence: data.confidence || 0, words: data.words || [] };
}

/** OCR 结果清洗：只做保守处理，不做容易误伤的"智能修复" */
function normalize(raw, replacements) {
  let s = raw.replace(/\r/g, ' ').replace(/\n+/g, ' ');
  s = s.replace(/[ \t]+/g, ' ');
  for (const [from, to] of replacements) {
    s = s.split(from).join(to);
  }
  return s.trim();
}

// ===========================================================================
// 5. 命令行
// ===========================================================================

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { out[key] = true; continue; }
    out[key] = next;
    i++;
  }
  return out;
}

function parseRect(s) {
  const nums = String(s).split(',').map((n) => parseInt(n.trim(), 10));
  if (nums.length !== 4 || nums.some((n) => Number.isNaN(n))) {
    throw new Error(t('regionFormat', s));
  }
  return { x: nums[0], y: nums[1], w: nums[2], h: nums[3] };
}

function parseReplace(s) {
  if (!s) return [];
  return String(s).split(',').map((pair) => {
    const [from, to] = pair.split('->');
    if (!from || to === undefined) throw new Error(t('replaceFormat', pair));
    return [from, to === 'SPACE' ? ' ' : to];
  });
}

function buildConfig(raw) {
  const cfg = { ...DEFAULTS };

  // 预设先铺底，显式参数再覆盖——这样 --game dz 只是「一套更好的默认值」。
  if (raw.game) {
    const preset = GAME_PRESETS[String(raw.game).toLowerCase()];
    if (!preset) {
      throw new Error(t('badPreset', raw.game, Object.keys(GAME_PRESETS).join(', ')));
    }
    Object.assign(cfg, preset);
  }

  if (raw.lang) cfg.lang = raw.lang;
  if (raw.psm) cfg.psm = PSM[String(raw.psm).toUpperCase()] ?? parseInt(raw.psm, 10);
  if (raw.scale) cfg.scale = parseInt(raw.scale, 10);
  if (raw.whitelist) cfg.whitelist = raw.whitelist;
  if (raw.invert) cfg.invert = true;
  if (raw['no-invert']) cfg.invert = false;
  if (raw.wpm) cfg.wpm = parseFloat(raw.wpm);
  if (raw.acc) cfg.acc = parseFloat(raw.acc);
  if (raw.jitter) cfg.jitter = parseFloat(raw.jitter);
  if (raw['word-pause']) cfg.wordPauseMs = parseInt(raw['word-pause'], 10);
  if (raw.think) cfg.thinkMs = parseInt(raw.think, 10);
  if (raw.keydown) cfg.keyDownMs = parseInt(raw.keydown, 10);
  if (raw.lead !== undefined) cfg.leadMs = raw.lead === true ? 0 : parseInt(raw.lead, 10);
  if (raw['max-chars']) cfg.maxChars = parseInt(raw['max-chars'], 10);
  if (raw.interval) cfg.loopIntervalMs = parseInt(raw.interval, 10);
  cfg.debug = !!raw.debug;
  return cfg;
}


function askConfirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()) || answer.trim() === '');
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ===========================================================================
// 6. 主流程
// ===========================================================================

async function runOnce(cfg, opts, target, state) {
  fs.mkdirSync(TMPDIR, { recursive: true });

  // 给了窗口（用于切焦点）时，截图前先把它提到前台——否则本工具的终端窗口
  // 可能正好盖住识别区域，屏幕拷贝拍到的是终端而不是游戏文本，
  // 表现为「识别为空、主程序没反应」。
  if (target.rect && (target.window || target.handle)) {
    const focusArgs = ['focus'];
    if (target.handle) focusArgs.push('-Handle', target.handle);
    else focusArgs.push('-Window', target.window);
    const fr = await runPs(focusArgs).catch((e) => {
      throw new Error(t('noWindowFound', e.message));
    });
    if (fr.foreground === false) {
      console.log(t('focusLost'));
    }
  }

  const shot = await capture(target, cfg);
  if (opts.debug) {
    console.log(t('debugShot', shot.file, shot.width, shot.height, shot.source));
  }

  // 循环模式：画面和上一轮一模一样就什么都不用做——省掉一次 OCR。
  const hash = sha1File(shot.file);
  if (state && state.hash === hash && state.lastText) {
    if (!opts.keepShot) { try { fs.unlinkSync(shot.file); } catch { /* ignore */ } }
    return state.lastText;
  }

  const result = await recognize(shot.file, cfg);
  const text = normalize(result.text, opts.replacements);

  if (!opts.keepShot) { try { fs.unlinkSync(shot.file); } catch { /* ignore */ } }
  if (state) state.hash = hash;

  if (!text) {
    console.log(t('noText', result.confidence.toFixed(1)));
    if (opts.keepShot) {
      console.log(t('keptShot', shot.file));
      console.log(t('openShot'));
    }
    else {
      console.log(t('addDebug'));
    }
    console.log(t('causes'));
    return null;
  }

  const printable = text.length > 160 ? `${text.slice(0, 160)}…` : text;
  console.log(t('recognized', text.length, result.confidence.toFixed(1)));
  console.log(`  「${printable}」`);

  if (text.length > cfg.maxChars) {
    console.log(t('overMax', cfg.maxChars));
    return null;
  }

  if (opts.dryRun) {
    console.log(t('dryRun'));
    return text;
  }

  // 这段文字已经由本工具打过了（屏幕上还留着、只是变灰/变暗）→ 不能再打一遍，
  // 否则会一直往游戏里灌重复字符。
  if (state && state.lastText === text) {
    console.log(t('skipSame'));
    return text;
  }

  if (opts.confirm && !(await askConfirm(t('confirmPrompt')))) {
    console.log(t('skipped'));
    return text;
  }

  const { steps, plannedErrors } = buildSteps(text, cfg);
  const estimatedMs = steps.reduce((sum, s) => sum + s.pre + s.post + cfg.keyDownMs, 0);

  console.log(t('plan', text.length, steps.length, plannedErrors, (estimatedMs / 1000).toFixed(1)));

  if (cfg.leadMs > 0) {
    process.stdout.write(t('leadSoon', (cfg.leadMs / 1000).toFixed(1)));
    await sleep(cfg.leadMs);
    process.stdout.write('\r  ' + ' '.repeat(50) + '\r');
  }

  const started = Date.now();
  const typed = await typeSequence(steps, cfg, target);
  const elapsed = Date.now() - started;

  const netChars = steps.filter((s) => s.vk !== VK.BACK).length;
  const wpm = elapsed > 0 ? (netChars / 5) / (elapsed / 60000) : 0;
  console.log(t('done', typed.chars, elapsed, wpm.toFixed(1)));

  if (state) state.lastText = text;   // 记住打过什么，下一轮同文不再重打
  return text;
}

async function main() {
  const raw = parseArgs(process.argv.slice(2));
  if (raw.locale) setLang(String(raw.locale));
  if (raw.help || raw.h) { console.log(t('help')); return; }

  if (raw.windows) {
    const { windows } = await listWindows();
    console.log(t('windowsHeader'));
    for (const w of windows) {
      console.log(`  ${String(w.handle).padStart(12)}  ${String(w.rect.w).padStart(5)}x${String(w.rect.h).padStart(5)}  pid=${String(w.pid).padEnd(6)}  ${w.title.slice(0, 60)}`);
    }
    console.log(t('windowsFooter'));
    return;
  }

  if (raw.pick) {
    const pickDelay = raw['pick-delay'] !== undefined && raw['pick-delay'] !== true
      ? parseInt(raw['pick-delay'], 10) || 0 : 5000;

    if (pickDelay > 0) {
      console.log(t('pickSoon', pickDelay / 1000));
      for (let left = pickDelay / 1000; left > 0; left--) {
        process.stdout.write(`  ${left}…  `);
        await sleep(1000);
      }
      process.stdout.write('\r' + ' '.repeat(40) + '\r');
    }

    console.log(t('pickOverlay'));
    const r = await runPs(['pick-region']);
    const { x, y, w, h } = r.region;
    const saved = saveRegion({ x, y, w, h });
    console.log(t('pickDone', x, y, w, h, saved));
    console.log(t('pickVerifyTitle'));
    console.log(t('pickVerify', `node index.js --region ${x},${y},${w},${h} --dry-run`));
    console.log('');
    console.log(t('pickStartTitle'));
    console.log(t('pickVerify', `node index.js --region ${x},${y},${w},${h} --wpm 80`));
    console.log('');
    return;
  }

  const cfg = buildConfig(raw);
  const opts = {
    dryRun: !!raw['dry-run'],
    confirm: !!raw.confirm,
    keepShot: !!raw.debug,
    replacements: parseReplace(raw.replace),
  };

  const target = {
    window: raw.window,
    handle: raw.handle ? parseInt(raw.handle, 10) : 0,
    rect: raw.region ? parseRect(raw.region) : null,   // 屏幕绝对坐标
    crop: raw.crop ? parseRect(raw.crop) : null,       // 窗口内相对坐标
  };

  // --last：复用上次 --pick 记住的区域
  if (!target.rect && raw.last) {
    const saved = loadRegion();
    if (!saved) {
      console.log(t('savedRegionMissing'));
      process.exitCode = 1;
      return;
    }
    target.rect = { x: saved.x, y: saved.y, w: saved.w, h: saved.h };
    console.log(t('reuseRegion', saved.x, saved.y, saved.w, saved.h));
  }

  if (!target.window && !target.handle && !target.rect) {
    console.log(t('noTarget'));
    if (loadRegion()) console.log(t('noTargetHint'));
    console.log(t('help'));
    process.exitCode = 1;
    return;
  }

  console.log(t('start'));

  const cropText = target.crop ? t('cropText', target.crop.x, target.crop.y, target.crop.w, target.crop.h) : '';
  const shotDesc = target.rect
    ? t('shotScreen', target.rect.x, target.rect.y, target.rect.w, target.rect.h)
    : target.window ? t('shotWindow', target.window, cropText) : t('shotHandle', target.handle, cropText);
  console.log(t('shotLine', shotDesc));

  if (target.rect && (target.window || target.handle)) {
    console.log(t('focusLine', target.window || target.handle));
  }
  else if (target.rect && !opts.dryRun) {
    console.log(t('focusWarn1'));
    console.log(t('focusWarn2'));
  }
  console.log(t('params', cfg.wpm, (cfg.acc * 100).toFixed(0), cfg.jitter, cfg.psm) + '\n');

  // 启动时的两笔固定开销（PowerShell 宿主 ~2.3s、OCR 语言包 ~2.5s）并行付掉，
  // 而不是串起来让人干等 5 秒。
  getWorker(cfg).catch(() => {});
  runPs(['list-windows']).catch(() => {});

  if (!raw.loop) {
    await runOnce(cfg, opts, target, null);
    if (ocrWorker) await ocrWorker.terminate().catch(() => {});
    return;
  }

  console.log(`${t('loopOn')}\n`);
  const state = { hash: null, lastText: null };
  let round = 0;

  for (;;) {
    round++;
    process.stdout.write(`${t('round', round)}\n`);
    // 准备倒计时只在第一轮有意义（给你点进游戏的时间）；循环里每轮再等一次
    // 纯粹是白白拖慢速度。
    const roundCfg = round === 1 ? cfg : { ...cfg, leadMs: 0 };
    const text = await runOnce(roundCfg, opts, target, state).catch((e) => {
      console.log(t('loopErr', e.message));
      return null;
    });
    void text;
    await sleep(cfg.loopIntervalMs);
  }
}

module.exports = {
  mapChar, buildSteps, buildConfig, parseArgs, normalize,
  recognize, runPs, listWindows, capture, DEFAULTS, VK, PSM,
  saveRegion, loadRegion, REGION_FILE,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(`${t('errPrefix')}${e.message}`);
    process.exitCode = 1;
  });
}
