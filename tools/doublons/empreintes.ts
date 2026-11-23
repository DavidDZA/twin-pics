/**
 * Empreintes (dHash) et contraste de toutes les photos d'un dossier, sous Node, pour vérifier les « quasi
 * identiques » : `node tools/doublons/empreintes.mjs [dossier]` → test-results/empreintes.json, puis les paires
 * rapprochées par l'empreinte, retenues ou refusées (photo presque vide : `isFlat`), avec le contraste de chacune.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import sharp from 'sharp';
import { analysisSize, dHash, grayFromRGBA, hamming, SHARPNESS_SIZE } from '../../src/lib/imagehash';
import { measureQuality, type Quality } from '../../src/lib/quality';
import { isFlat } from '../../src/lib/groups';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'test-results', 'empreintes.json');
const dir = process.argv[2] ?? join(ROOT, 'photos test');
type Row = { path: string; dhash: string; quality: Quality };

function walk(d: string, out: string[] = []): string[] {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jpe?g|png|webp)$/i.test(name)) out.push(p);
  }
  return out;
}

async function gray(f: string, w: number, h: number) {
  const raw = await sharp(f).rotate().resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
  return grayFromRGBA(raw, w, h);
}

async function measure(): Promise<Row[]> {
  if (existsSync(OUT)) return JSON.parse(readFileSync(OUT, 'utf8')) as Row[];
  const rows: Row[] = [];
  const files = walk(dir);
  const work = async (f: string) => {
    const meta = await sharp(f).metadata().catch(() => null);
    if (!meta?.width) return;
    const w = meta.autoOrient?.width ?? meta.width;
    const h = meta.autoOrient?.height ?? meta.height!;
    const s = analysisSize(w, h);
    const b = analysisSize(w, h, SHARPNESS_SIZE);
    rows.push({ path: relative(dir, f).split('\\').join('/'), dhash: dHash(await gray(f, s.width, s.height), s.width, s.height), quality: measureQuality(await gray(f, b.width, b.height), b.width, b.height) });
  };
  for (let i = 0; i < files.length; i += 8) await Promise.all(files.slice(i, i + 8).map(work));
  mkdirSync(join(ROOT, 'test-results'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(rows));
  return rows;
}

const rows = await measure();
console.log(`${rows.length} photos`);
let kept = 0;
const refused: string[] = [];
for (let i = 0; i < rows.length; i++)
  for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i];
    const b = rows[j];
    const dist = hamming(a.dhash, b.dhash);
    if (dist > 8) continue;
    const line = `${dist} bits, contraste ${a.quality.contrast.toFixed(0)}/${b.quality.contrast.toFixed(0)} : ${a.path} | ${b.path}`;
    if (!isFlat(a) && !isFlat(b)) {
      kept++;
      console.log(`gardée   ${line}`);
    } else refused.push(line);
  }
console.log(`${kept} paires gardées, ${refused.length} refusées`);
for (const l of refused) console.log(`refusée  ${l}`);
