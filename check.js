#!/usr/bin/env node
'use strict';

/**
 * typing-bot / check.js
 * ---------------------------------------------------------------------------
 * 识别检查脚本：截取指定区域，把识别到的文字直接打印出来。
 * 不发任何按键，纯读取，随便跑。
 *
 * 用法:
 *   node check.js --region x,y,w,h
 *   node check.js --pick                # 先拖框选（有 5 秒准备时间）
 *   node check.js --window "游戏标题"
 *
 * 可选:
 *   --scale 3          放大倍数，默认 2
 *   --whitelist "..."  限定字符集
 *   --once             只跑一种 OCR 模式（默认会试 4 种并挑最准的）
 *   --loop             连续识别，每 2 秒一次
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorker, PSM } = require('tesseract.js');
const { runPs, normalize, DEFAULTS } = require('./index.js');

const OUTDIR = path.join(os.tmpdir(), 'typing-bot-check');

// 依次尝试的 OCR 分页模式，行文本最常用 SINGLE_LINE
const MODES = [
  ['SINGLE_LINE', PSM.SINGLE_LINE],
  ['SINGLE_BLOCK', PSM.SINGLE_BLOCK],
  ['SPARSE_TEXT', PSM.SPARSE_TEXT],
  ['AUTO', PSM.AUTO],
];

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
  const n = String(s).split(',').map((v) => parseInt(v.trim(), 10));
  if (n.length !== 4 || n.some((v) => Number.isNaN(v))) {
    throw new Error(`--region 格式应为 x,y,w,h，收到：${s}`);
  }
  return { x: n[0], y: n[1], w: n[2], h: n[3] };
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const raw = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUTDIR, { recursive: true });

  let rect = raw.region ? parseRect(raw.region) : null;
  const windowTarget = raw.window || null;

  if (raw.pick && !rect) {
    const delay = raw['pick-delay'] !== undefined && raw['pick-delay'] !== true
      ? parseInt(raw['pick-delay'], 10) || 0 : 5000;
    if (delay > 0) {
      console.log(`\n${delay / 1000} 秒后弹出遮罩，先切到游戏窗口…`);
      for (let i = delay / 1000; i > 0; i--) {
        process.stdout.write(`  ${i}…  `);
        await sleep(1000);
      }
      process.stdout.write('\r' + ' '.repeat(40) + '\r');
    }
    console.log('拖拽框选要识别的区域…');
    const r = await runPs(['pick-region']);
    rect = r.region;
    console.log(`已选区域: ${rect.x},${rect.y} ${rect.w}x${rect.h}\n`);
  }

  if (!rect && !windowTarget) {
    console.log('\n请指定区域，三种方式：');
    console.log('  node check.js --pick                 拖拽框选（推荐，有 5 秒准备时间）');
    console.log('  node check.js --region x,y,w,h       直接给坐标');
    console.log('  node check.js --window "游戏标题"     按窗口截图\n');
    return;
  }

  const scale = raw.scale ? parseInt(raw.scale, 10) : DEFAULTS.scale;
  const whitelist = raw.whitelist || '';

  for (;;) {
    await runOnce({ rect, windowTarget, scale, whitelist, once: !!raw.once });
    if (!raw.loop) break;
    console.log('\n(2 秒后再来一次，Ctrl+C 退出)\n');
    await sleep(2000);
  }
}

async function runOnce(opts) {
  const outFile = path.join(OUTDIR, `shot-${Date.now()}.png`);

  const args = ['capture', '-Out', outFile, '-Scale', opts.scale];
  if (opts.windowTarget) args.push('-Window', opts.windowTarget);
  if (opts.rect) args.push('-X', opts.rect.x, '-Y', opts.rect.y, '-W', opts.rect.w, '-H', opts.rect.h);

  const shot = await runPs(args);
  console.log(`截图 ${shot.width}x${shot.height}  来源=${shot.source}`);
  console.log(`文件 ${outFile}\n`);

  console.log('正在识别…');
  const worker = await createWorker('eng', 1, { logger: () => {} });

  const modes = opts.once ? MODES.slice(0, 1) : MODES;
  const results = [];

  for (const [name, psm] of modes) {
    const params = { tessedit_pageseg_mode: String(psm) };
    if (opts.whitelist) params.tessedit_char_whitelist = opts.whitelist;
    await worker.setParameters(params);
    const { data } = await worker.recognize(outFile);
    const text = normalize(data.text || '', []);
    results.push({ name, psm, text, confidence: data.confidence || 0 });
  }
  await worker.terminate();

  // 只看置信度会选出"高置信度的垃圾"（比如 5 个字符的碎片）。
  // 所以在置信度接近的结果里，优先取更长的那条。
  const usable = results.filter((r) => r.text.length > 0);
  let best = null;
  if (usable.length) {
    const topConfidence = Math.max(...usable.map((r) => r.confidence));
    best = usable
      .filter((r) => r.confidence >= topConfidence - 10)
      .sort((a, b) => b.text.length - a.text.length)[0];
  }

  for (const r of results) {
    const mark = (best && r.name === best.name) ? '  <- 最准' : '';
    const shown = r.text.length > 120 ? `${r.text.slice(0, 120)}…` : r.text;
    console.log(`  [${r.name}] 置信度 ${r.confidence.toFixed(1).padStart(5)}%  ${r.text.length} 字符  「${shown}」${mark}`);
  }

  console.log('');
  if (!best) {
    console.log('✗ 几个模式都没识别出文字。');
    console.log(`  打开这张图看一眼框里拍到了什么：${shot.file}`);
    console.log('  常见原因：区域框偏了 / 框到空白 / 游戏窗口被别的窗口挡住 / 字号太小');
    return;
  }

  console.log('✓ 识别到的文字：');
  console.log('\n    ' + best.text + '\n');
  console.log(`  模式 ${best.name}，置信度 ${best.confidence.toFixed(1)}%，共 ${best.text.length} 字符`);
  if (best.name !== 'SINGLE_LINE') {
    console.log(`  提示：这个区域用 --psm ${best.name} 更准，正式运行时带上这个参数。`);
  }
  if (opts.rect) {
    console.log(`  下一步: node index.js --region ${opts.rect.x},${opts.rect.y},${opts.rect.w},${opts.rect.h} --dry-run`);
  }
}

main().catch((e) => {
  console.error(`\n错误：${e.message}`);
  process.exitCode = 1;
});
