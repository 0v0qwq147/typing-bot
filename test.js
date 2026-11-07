#!/usr/bin/env node
'use strict';

/**
 * typing-bot / test.js
 * 环境自检：验证 PowerShell 桥接、字符映射、节奏模型、OCR 识别链路。
 * 不会向你的桌面发送任何真实按键（打字通路只跑一次空序列）。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  mapChar, buildSteps, recognize, runPs, listWindows,
  normalize, DEFAULTS, VK,
} = require('./index.js');

const TMP = path.join(os.tmpdir(), 'typing-bot-selftest');
let passed = 0;
let failed = 0;

function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? `  -> ${detail}` : ''}`); }
}

/** 逐字符相似度 0..1 */
function similarity(a, b) {
  if (a === b) return 1;
  const prev = new Array(b.length + 1).fill(0);
  let cur = prev.slice();
  for (let i = 0; i <= b.length; i++) prev[i] = i;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  const dist = prev[b.length];
  return 1 - dist / Math.max(a.length, b.length);
}

async function main() {
  fs.mkdirSync(TMP, { recursive: true });

  console.log('\n=== 1. PowerShell 桥接 ===');
  try {
    const r = await listWindows();
    check('list-windows 可用', Array.isArray(r.windows) && r.windows.length > 0,
      `返回 ${r.windows ? r.windows.length : 0} 个窗口`);
  } catch (e) {
    check('list-windows 可用', false, e.message);
  }

  console.log('\n=== 2. 字符 -> 虚拟键映射 ===');
  const cases = [
    ['a', 0x41, false], ['z', 0x5a, false],
    ['A', 0x41, true], ['Z', 0x5a, true],
    ['0', 0x30, false], ['9', 0x39, false],
    [' ', VK.SPACE, false],
    ['!', 0x31, true], ['@', 0x32, true], ['#', 0x33, true],
    ['-', 0xbd, false], ['_', 0xbd, true],
    ['[', 0xdb, false], ['{', 0xdb, true],
    [';', 0xba, false], [':', 0xba, true],
    [',', 0xbc, false], ['<', 0xbc, true],
    ['.', 0xbe, false], ['>', 0xbe, true],
    ['/', 0xbf, false], ['?', 0xbf, true],
  ];
  let mapOk = true;
  let mapErr = '';
  for (const [ch, vk, shift] of cases) {
    const m = mapChar(ch);
    if (!m || m.vk !== vk || m.shift !== shift) {
      mapOk = false;
      mapErr = `'${ch}' 期望 vk=0x${vk.toString(16)},shift=${shift}，实际 ${JSON.stringify(m)}`;
      break;
    }
  }
  check('字母/数字/符号全部映射正确', mapOk, mapErr);
  check('不可打印字符返回 null', mapChar('中') === null && mapChar('\u0001') === null);

  console.log('\n=== 3. 击键节奏模型 ===');
  const cfg60 = { ...DEFAULTS, wpm: 60, jitter: 0, acc: 1, wordPauseMs: 0, thinkMs: 0 };
  const s60 = buildSteps('hello world', cfg60);
  const totalMs = s60.steps.reduce((s, x) => s + x.pre + x.post + cfg60.keyDownMs, 0);
  // 60 WPM = 300 CPM = 每字符 200ms。11 个字符之间有 10 个间隔，再加 11 次 keydown。
  const expectMs = 10 * 200 + 11 * cfg60.keyDownMs;
  check('60 WPM 下 11 字符耗时符合预期', Math.abs(totalMs - expectMs) < 60,
    `实际 ${totalMs}ms，期望 ${expectMs}ms`);

  const cfg30 = { ...DEFAULTS, wpm: 30, jitter: 0, acc: 1, wordPauseMs: 0, thinkMs: 0 };
  const s30 = buildSteps('hello world', cfg30);
  const total30 = s30.steps.reduce((s, x) => s + x.pre + x.post + cfg30.keyDownMs, 0);
  const expect30 = 10 * 400 + 11 * cfg30.keyDownMs;
  check('降到 30 WPM 则间隔翻倍', Math.abs(total30 - expect30) < 120,
    `实际 ${total30}ms，期望 ${expect30}ms`);

  const cfgErr = { ...DEFAULTS, wpm: 60, jitter: 0, acc: 0.5, thinkMs: 0 };
  let sawBackspace = false;
  for (let i = 0; i < 60; i++) {
    if (buildSteps('hello world again', cfgErr).steps.some((s) => s.vk === VK.BACK)) {
      sawBackspace = true; break;
    }
  }
  check('acc<1 会产生退格纠正', sawBackspace);

  const cfgJit = { ...DEFAULTS, wpm: 60, jitter: 0.5, acc: 1, wordPauseMs: 0, thinkMs: 0 };
  const jit = buildSteps('hello world hello', cfgJit).steps.slice(1).map((s) => s.pre);
  const uniqueJit = new Set(jit).size;
  check('抖动使间隔不均匀', uniqueJit > jit.length * 0.6, `${uniqueJit}/${jit.length} 个不同值`);

  const think = { ...DEFAULTS, thinkMs: 700 };
  check('起手思考时间计入第一步', buildSteps('a', think).steps[0].pre >= 700);

  console.log('\n=== 4. OCR 识别链路 ===');
  const sample = 'The quick brown fox jumps over the lazy dog';
  const renderSpec = path.join(TMP, 'render.json');
  const rendered = path.join(TMP, 'sample.png');
  fs.writeFileSync(renderSpec, JSON.stringify({ text: sample, font: 'Consolas', size: 28, scale: 2 }), 'utf8');

  try {
    const r = await runPs(['render', '-TextFile', renderSpec, '-Out', rendered]);
    check('渲染 OCR 样本图', r.ok && fs.existsSync(rendered), JSON.stringify(r));

    console.log('  正在初始化 OCR（首次需下载 eng 语言数据，请稍等）…');
    const ocr = await recognize(rendered, { ...DEFAULTS, psm: DEFAULTS.psm });
    const got = normalize(ocr.text, []);
    const sim = similarity(got, sample);
    console.log(`  原文: 「${sample}」`);
    console.log(`  识别: 「${got}」`);
    check('识别相似度 >= 0.9', sim >= 0.9, `相似度 ${(sim * 100).toFixed(1)}%，置信度 ${ocr.confidence.toFixed(1)}%`);
  } catch (e) {
    check('OCR 识别链路', false, e.message);
  }

  console.log('\n=== 5. 打字通路（空序列，不产生实际按键）===');
  try {
    const seqFile = path.join(TMP, 'empty-seq.json');
    fs.writeFileSync(seqFile, JSON.stringify({ keyDelay: 5, steps: [] }), 'utf8');
    const t = await runPs(['type', '-TextFile', seqFile, '-KeyDelay', 5, '-LeadMs', 0]);
    check('序列文件可被解析并执行', t.ok && t.chars === 0, JSON.stringify(t));
  } catch (e) {
    check('打字通路', false, e.message);
  }

  if (process.argv.includes('--live')) {
    console.log('\n=== 6. 真实按键注入（会短暂弹出一个接收窗口）===');
    const probeText = 'Hello 123 abc_X@.';
    const liveCfg = { ...DEFAULTS, wpm: 700, jitter: 0, thinkMs: 50, wordPauseMs: 0, acc: 1 };
    const { steps } = buildSteps(probeText, liveCfg);
    const liveFile = path.join(TMP, 'live-seq.json');
    fs.writeFileSync(liveFile, JSON.stringify({ keyDelay: 2, expected: probeText, steps }), 'utf8');

    try {
      const r = await runPs(['input-probe', '-TextFile', liveFile]);
      console.log(`  期望: 「${r.expected}」`);
      console.log(`  实得: 「${r.captured}」`);
      check('按键能被目标窗口接收', r.verdict === true, r.verdict ? ''
        : `SendInput 失败 ${r.failed} 次，win32 错误码 ${r.win32}。` +
          '当前会话很可能不允许合成输入（常见于服务/沙箱/远程会话），' +
          '请从普通的桌面终端运行本工具。');
    } catch (e) {
      check('按键注入自检', false, e.message);
    }
  }

  console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===\n`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`自检崩溃：${e.stack}`);
  process.exitCode = 1;
});
