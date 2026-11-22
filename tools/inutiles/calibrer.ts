/**
 * Calibrage des photos « inutiles », sous Node (lancé par `node tools/inutiles/calibrer.mjs`) :
 *
 * - `--phrases` : calcule les vecteurs des phrases (`prompts.ts`) avec la partie « texte » de MobileCLIP et les écrit
 *   dans `src/lib/junkPrompts.json` (livré avec l'appli) ;
 * - `[dossier] [nombre]` : mesure les photos d'un dossier comme l'appli (qualité, MobileCLIP fp32 sur le processeur) et
 *   écrit `test-results/calibrage.json` (mesures et probabilités de chaque photo) ; affiche les répartitions et les
 *   photos retenues par chaque raison, pour choisir les seuils (`JUNK_DEFAULTS`).
 */
import { AutoProcessor, AutoTokenizer, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage, env } from '@huggingface/transformers';
import exifr from 'exifr';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { analysisSize, grayFromRGBA, SHARPNESS_SIZE } from '../../src/lib/imagehash';
import { measureQuality } from '../../src/lib/quality';
import { CLIP_MODEL, clipScores, junkReasons, JUNK_DEFAULTS, type JunkPrompts } from '../../src/lib/junk';
import { PROMPTS } from './prompts';

env.allowLocalModels = false;
const ROOT = join(import.meta.dirname, '..', '..');
const PROMPTS_FILE = join(ROOT, 'src', 'lib', 'junkPrompts.json');

function normalize(v: ArrayLike<number>): number[] {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  return Array.from(v, (x) => x / n);
}

async function phrases() {
  const tokenizer = await AutoTokenizer.from_pretrained(CLIP_MODEL);
  const model = await CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: 'fp32' });
  const inputs = tokenizer(PROMPTS.map(([, t]) => t), { padding: 'max_length', truncation: true });
  const { text_embeds } = await model(inputs);
  const dim = text_embeds.dims[1];
  const data = text_embeds.data as Float32Array;
  const out: JunkPrompts = {
    model: CLIP_MODEL,
    categories: PROMPTS.map(([c]) => c),
    texts: PROMPTS.map(([, t]) => t),
    vectors: PROMPTS.map((_, i) => normalize(data.subarray(i * dim, (i + 1) * dim)).map((x) => Math.round(x * 1e5) / 1e5)),
  };
  writeFileSync(PROMPTS_FILE, JSON.stringify(out));
  console.log(`${PROMPTS.length} phrases → ${relative(ROOT, PROMPTS_FILE)}`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jpe?g|png|webp)$/i.test(name)) out.push(p);
  }
  return out;
}

const pct = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

async function measure(dir: string, limit: number) {
  const prompts = JSON.parse(readFileSync(PROMPTS_FILE, 'utf8')) as JunkPrompts;
  const processor = await AutoProcessor.from_pretrained(CLIP_MODEL);
  const vision = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: 'fp32', device: 'cpu' });
  let files = walk(dir);
  if (limit && files.length > limit) {
    const step = files.length / limit;
    files = Array.from({ length: limit }, (_, i) => files[Math.floor(i * step)]);
  }
  const rows = [];
  const t0 = Date.now();
  for (const [i, f] of files.entries()) {
    const buf = readFileSync(f);
    const meta = await sharp(buf)
      .metadata()
      .catch(() => null);
    if (!meta?.width) continue; // Photo illisible.
    const w0 = meta.autoOrient?.width ?? meta.width!;
    const h0 = meta.autoOrient?.height ?? meta.height!;
    const big = analysisSize(w0, h0, SHARPNESS_SIZE);
    const raw = await sharp(buf).rotate().resize(big.width, big.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    const q = measureQuality(grayFromRGBA(raw, big.width, big.height), big.width, big.height);
    const scale = 256 / Math.min(w0, h0);
    const sw = Math.round(w0 * scale);
    const sh = Math.round(h0 * scale);
    const small = await sharp(buf).rotate().resize(sw, sh, { fit: 'fill' }).removeAlpha().raw().toBuffer();
    const { image_embeds } = await vision(await processor(new RawImage(new Uint8ClampedArray(small), sw, sh, 3)));
    const clip = new Float32Array(normalize(image_embeds.data as Float32Array));
    const scores = clipScores(clip, prompts);
    let camera: string | undefined;
    try {
      const tags = await exifr.parse(buf, { pick: ['Make', 'Model'] });
      camera = [tags?.Make, tags?.Model].filter(Boolean).join(' ') || undefined;
    } catch {
      camera = undefined;
    }
    const path = relative(dir, f).split('\\').join('/');
    const reasons = junkReasons({ path, width: w0, height: h0, camera, quality: q, scores }, JUNK_DEFAULTS);
    rows.push({ path, w: w0, h: h0, camera, q, scores, reasons });
    if (i % 50 === 0) console.log(`${i} / ${files.length} (${((Date.now() - t0) / (i + 1)).toFixed(0)} ms par photo)`);
  }
  mkdirSync(join(ROOT, 'test-results'), { recursive: true });
  writeFileSync(join(ROOT, 'test-results', 'calibrage.json'), JSON.stringify(rows, null, 1));

  const show = (label: string, xs: number[]) =>
    console.log(`${label.padEnd(10)} p1 ${pct(xs, 0.01).toFixed(1)}  p5 ${pct(xs, 0.05).toFixed(1)}  p10 ${pct(xs, 0.1).toFixed(1)}  p50 ${pct(xs, 0.5).toFixed(1)}  p90 ${pct(xs, 0.9).toFixed(1)}`);
  show('netteté', rows.map((r) => r.q.sharp));
  show('lumière', rows.map((r) => r.q.lum));
  show('contraste', rows.map((r) => r.q.contrast));
  for (const cat of ['document', 'receipt', 'screenshot', 'meme', 'accident'] as const) show(cat, rows.map((r) => r.scores[cat] * 100));
  const counts: Record<string, string[]> = {};
  for (const r of rows) for (const reason of r.reasons) (counts[reason] ??= []).push(r.path);
  for (const [reason, paths] of Object.entries(counts)) console.log(`\n${reason} : ${paths.length}\n  ${paths.slice(0, 15).join('\n  ')}`);
  console.log(`\n${rows.filter((r) => r.reasons.length).length} photos inutiles sur ${rows.length}`);
}

const args = process.argv.slice(2);
if (args[0] === '--phrases') await phrases();
else await measure(args[0] ?? join(ROOT, 'photos test'), Number(args[1] ?? 0));
