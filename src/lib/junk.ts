/**
 * Photos « inutiles » : floues, ratées, captures d'écran, documents, tickets, mèmes… Code pur, testé sous Node.
 *
 * Deux sources, chaque photo garde ses raisons :
 * 1. **Règles** sur les mesures de l'analyse (`quality.ts`), sans modèle : floue (aucune zone nette), trop sombre,
 *    trop claire, presque vide (poche, objectif caché), capture d'écran (nom du fichier, ou image PNG sans appareil
 *    photo aux proportions d'un écran) ;
 * 2. **MobileCLIP** (option, modèle téléchargé) : la photo est comparée à des phrases (« a photo of a receipt »…,
 *    `junkPrompts.json`) ; une catégorie est retenue si sa probabilité dépasse `clipMin`.
 *
 * Les photos inutiles qui se ressemblent forment des **groupes** (MobileCLIP, ou dHash sans le modèle ; toutes les
 * photos presque vides ensemble), **sans limite de temps** : dix captures de la même appli, des tickets, des photos du sol se trient d'un coup. Une photo déjà dans
 * un groupe de doublons n'est pas proposée ici (le tri des doublons s'en occupe).
 */
import type { Group, PhotoInfo } from './groups';
import { groupId } from './groups';
import { cosine, hamming, isUniformHash } from './imagehash';
import type { Quality } from './quality';

/** Le modèle qui reconnaît documents, tickets, captures et mèmes (partie « image » seulement : 43 Mo sur la carte
 * graphique, 86 Mo sur le processeur). */
export const CLIP_MODEL = 'Xenova/mobileclip_s1';
export const CLIP_SIZE_MB = 43;
/** Le plus gros téléchargement possible (version processeur, `fp32`), annoncé avant l'analyse (Mo). */
export const CLIP_CPU_MB = 86;
export const clipId = (dtype: string) => `${CLIP_MODEL}@${dtype}`;

export type PromptCategory = 'photo' | 'document' | 'receipt' | 'screenshot' | 'meme' | 'accident';
export type Scores = Record<PromptCategory, number>;

/** Les phrases et leurs vecteurs (calculés par `tools/inutiles/calibrer.mjs --phrases`). */
export interface JunkPrompts {
  model: string;
  categories: PromptCategory[];
  texts: string[];
  vectors: number[][];
}

/** Échelle des ressemblances avant le softmax (celle de CLIP). */
const LOGIT_SCALE = 100;

/** Probabilité de chaque catégorie pour une photo (vecteur MobileCLIP normalisé). */
export function clipScores(vector: ArrayLike<number>, prompts: JunkPrompts): Scores {
  const logits = prompts.vectors.map((v) => LOGIT_SCALE * cosine(vector, v));
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const total = exps.reduce((a, b) => a + b, 0);
  const s: Scores = { photo: 0, document: 0, receipt: 0, screenshot: 0, meme: 0, accident: 0 };
  prompts.categories.forEach((c, i) => (s[c] += exps[i] / total));
  return s;
}

export type JunkReason = 'blurry' | 'dark' | 'bright' | 'empty' | 'screenshot' | 'document' | 'receipt' | 'meme' | 'accident';

/** Ordre d'affichage des raisons. */
export const JUNK_REASONS: JunkReason[] = ['blurry', 'dark', 'bright', 'empty', 'accident', 'screenshot', 'document', 'receipt', 'meme'];

/** Raisons qui viennent du modèle (les autres marchent sans). */
export const CLIP_REASONS: JunkReason[] = ['accident', 'document', 'receipt', 'meme'];

export interface JunkParams {
  /** Floue : netteté de la zone la plus nette en dessous de ce seuil. */
  blurMax: number;
  /** Modèle : probabilité minimale d'une catégorie. */
  clipMin: number;
  /** Regroupement : ressemblance minimale (MobileCLIP) entre deux photos inutiles. */
  groupMin: number;
  /** Raisons que l'utilisateur ne veut pas voir. */
  off: JunkReason[];
}

/** Bornes des curseurs. */
export const JUNK_LIMITS = { blurMax: [5, 120], clipMin: [0.3, 0.95], groupMin: [0.6, 0.98] } as const;

/** Réglages par défaut : calibrés le 22/11/2026 sur 1 508 photos de l'utilisateur (ARCHITECTURE § 4.3). */
export const JUNK_DEFAULTS: JunkParams = { blurMax: 30, clipMin: 0.7, groupMin: 0.85, off: [] };

/** Seuils fixes des règles d'exposition (luminosité 0 à 255, parts de pixels). */
const EMPTY_CONTRAST = 10;
const DARK_LUM = 35;
const DARK_SHARE = 0.55;
const BRIGHT_LUM = 228;
const BRIGHT_SHARE = 0.5;

/** Faible qualité, pour confirmer « prise par erreur ». */
const WEAK_SHARP = 300;
const WEAK_LUM = 50;
const WEAK_CONTRAST = 25;

const SCREENSHOT_NAME = /screenshot|screen[ _-]?shot|capture[ _-]?d.?[ée]cran|bildschirmfoto|captura de pantalla|schermata|^scr[_-]/i;

/** Proportions d'un écran (téléphone en hauteur, ordinateur en largeur) sans appareil photo dans l'EXIF. */
function screenLike(p: JunkInput): boolean {
  if (p.camera || !p.width || !p.height) return false;
  if (!/\.png$/i.test(p.path)) return false;
  const r = Math.max(p.width, p.height) / Math.min(p.width, p.height);
  return r >= 1.6;
}

export interface JunkInput {
  path: string;
  width?: number;
  height?: number;
  camera?: string;
  quality?: Quality;
  scores?: Scores;
}

/** Pourquoi une photo est proposée comme inutile (aucune raison : elle ne l'est pas). */
export function junkReasons(p: JunkInput, params: JunkParams): JunkReason[] {
  const out: JunkReason[] = [];
  const q = p.quality;
  const name = p.path.slice(p.path.lastIndexOf('/') + 1);
  if (q) {
    const empty = q.contrast < EMPTY_CONTRAST;
    if (empty) out.push('empty');
    else {
      if (q.lum < DARK_LUM && q.dark > DARK_SHARE) out.push('dark');
      if (q.lum > BRIGHT_LUM && q.bright > BRIGHT_SHARE) out.push('bright');
      if (q.sharp < params.blurMax) out.push('blurry');
    }
  }
  const s = p.scores;
  if (SCREENSHOT_NAME.test(name) || screenLike(p) || (s && s.screenshot >= params.clipMin)) out.push('screenshot');
  if (s) {
    for (const c of ['document', 'receipt', 'meme'] as const) if (s[c] >= params.clipMin) out.push(c);
    // « Prise par erreur » : le modèle seul se trompe sur les grottes, le sol d'une place… ; il faut aussi une photo
    // de faible qualité (peu nette, sombre ou sans contraste).
    if (s.accident >= params.clipMin && (!q || q.sharp < WEAK_SHARP || q.lum < WEAK_LUM || q.contrast < WEAK_CONTRAST)) out.push('accident');
  }
  // Une capture d'écran est nette et souvent claire : seules ses autres raisons venues du modèle comptent.
  const filtered = out.includes('screenshot') ? out.filter((r) => r !== 'blurry' && r !== 'bright') : out;
  return filtered.filter((r) => !params.off.includes(r));
}

/** La raison la plus fréquente d'un groupe (l'ordre de `JUNK_REASONS` départage). */
function mainReason(lists: JunkReason[][]): JunkReason {
  const count = new Map<JunkReason, number>();
  for (const l of lists) for (const r of l) count.set(r, (count.get(r) ?? 0) + 1);
  return JUNK_REASONS.filter((r) => count.has(r)).sort((a, b) => count.get(b)! - count.get(a)!)[0];
}

/** Au-delà, pas de regroupement par MobileCLIP (comparaison de toutes les paires trop longue dans l'interface). */
const GROUP_MAX = 4000;
/** Deux photos inutiles « quasi identiques » (dHash) sont regroupées même sans le modèle. */
const NEAR_BITS = 6;

/**
 * Les groupes de photos inutiles. `reasons[i]` : raisons de la photo `i` (vide : pas inutile) ; `exclude` : photos
 * déjà dans un groupe de doublons. Les plus gros groupes d'abord (on en trie beaucoup d'un coup), puis par date.
 */
export function buildJunkGroups(photos: PhotoInfo[], reasons: JunkReason[][], params: JunkParams, exclude: Set<number>): Group[] {
  const idx = photos.map((_, i) => i).filter((i) => reasons[i]?.length && !exclude.has(i));
  const parent = new Map(idx.map((i) => [i, i]));
  const find = (i: number): number => {
    while (parent.get(i) !== i) {
      parent.set(i, parent.get(parent.get(i)!)!);
      i = parent.get(i)!;
    }
    return i;
  };
  const members = new Map<number, number[]>(idx.map((i) => [i, [i]]));

  if (idx.length <= GROUP_MAX) {
    const pairs: { a: number; b: number; sim: number }[] = [];
    for (let x = 0; x < idx.length; x++) {
      const a = idx[x];
      const pa = photos[a];
      for (let y = x + 1; y < idx.length; y++) {
        const b = idx[y];
        const pb = photos[b];
        if (!reasons[a].some((r) => reasons[b].includes(r))) continue;
        let sim = -1;
        if (pa.clip && pb.clip) sim = cosine(pa.clip, pb.clip);
        // Deux photos presque vides (noires, prises dans la poche) vont ensemble, même sans le modèle.
        if (reasons[a].includes('empty') && reasons[b].includes('empty')) sim = 1;
        if (sim < params.groupMin && pa.dhash && pb.dhash && !isUniformHash(pa.dhash) && hamming(pa.dhash, pb.dhash) <= NEAR_BITS) sim = 1;
        if (sim >= params.groupMin) pairs.push({ a, b, sim });
      }
    }
    pairs.sort((p, q) => q.sim - p.sim);
    const floor = params.groupMin - 0.05;
    for (const { a, b } of pairs) {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) continue;
      const A = members.get(ra)!;
      const B = members.get(rb)!;
      // Garde-fou contre les chaînes : toutes les photos des deux groupes doivent se ressembler un peu.
      const ok = A.every((i) => B.every((j) => !photos[i].clip || !photos[j].clip || cosine(photos[i].clip!, photos[j].clip!) >= floor));
      if (!ok) continue;
      parent.set(rb, ra);
      members.set(ra, [...A, ...B]);
      members.delete(rb);
    }
  }

  const when = (i: number) => photos[i].time ?? photos[i].lastModified;
  const groups: Group[] = [];
  for (const list of members.values()) {
    const sorted = [...list].sort((i, j) => when(i) - when(j) || photos[i].path.localeCompare(photos[j].path));
    const byPhoto: Record<number, JunkReason[]> = {};
    for (const i of sorted) byPhoto[i] = reasons[i];
    groups.push({
      id: `j${groupId(photos, sorted)}`,
      kind: 'junk',
      members: sorted,
      best: -1,
      reason: 'original',
      wasted: sorted.reduce((s, i) => s + photos[i].size, 0),
      time: Math.min(...sorted.map(when)),
      junk: { reasons: byPhoto, main: mainReason(sorted.map((i) => reasons[i])) },
    });
  }
  return groups.sort((a, b) => b.members.length - a.members.length || a.time - b.time || a.id.localeCompare(b.id));
}
