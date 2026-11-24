/**
 * Des empreintes aux groupes de photos en double.
 *
 * Trois niveaux de ressemblance :
 * - **exact** : fichiers identiques octet par octet (même SHA-256), cherchés partout ;
 * - **near** (quasi identiques) : même photo redimensionnée, recompressée, un peu retouchée (dHash proches), cherchées
 *   partout, quelle que soit leur date ;
 * - **similar** (similaires) : même scène, rafale (vecteurs du modèle proches), seulement entre photos prises à peu
 *   de temps d'écart (date EXIF) : deux couchers de soleil pris à des années d'écart ne sont pas des doublons.
 *
 * Le calcul se fait en deux temps :
 * 1. `findPairs`, une fois après l'analyse : toutes les paires candidates avec les seuils les plus larges (`LIMITS`).
 *    C'est la partie longue (comparaison de toutes les empreintes).
 * 2. `buildGroups`, à chaque changement des réglages : on garde les paires qui passent les seuils choisis et on forme
 *    les groupes. Instantané, d'où les curseurs de réglage qui regroupent en direct.
 */
import { cosine, hamming, hashWords, isUniformHash, popcount32 } from './imagehash';
import type { JunkReason } from './junk';
import type { Quality } from './quality';

/** Nature d'un groupe : trois niveaux de doublons, et les photos inutiles (`junk.ts`). */
export type Kind = 'exact' | 'near' | 'similar' | 'junk';

/** Les trois niveaux de doublons. */
export type DupKind = Exclude<Kind, 'junk'>;

/** Ce que le regroupement sait d'une photo. */
export interface PhotoInfo {
  key: string;
  path: string;
  name: string;
  size: number;
  lastModified: number;
  /** SHA-256 du fichier : calculé seulement si un autre fichier a la même taille. */
  sha?: string;
  dhash?: string;
  /** Prise de vue (date EXIF), en millisecondes. */
  time?: number;
  /** Vecteur du modèle, normalisé. */
  emb?: Float32Array;
  sharpness?: number;
  width?: number;
  height?: number;
  /** Appareil photo (EXIF) : une capture d'écran n'en a pas. */
  camera?: string;
  /** Mesures de qualité (photos inutiles). */
  quality?: Quality;
  /** Vecteur MobileCLIP, normalisé (photos inutiles). */
  clip?: Float32Array;
  /** Rang de son dossier parmi les dossiers analysés (0 : le plus haut, dont on garde les copies). */
  rank?: number;
}

export interface Pair {
  a: number;
  b: number;
  kind: DupKind;
  /** Distance de Hamming des dHash (quasi identiques). */
  dist?: number;
  /** Similarité cosinus des vecteurs (similaires). */
  sim?: number;
  /** Écart entre les prises de vue, en millisecondes (similaires). */
  dt?: number;
}

export interface Params {
  /** Bits différents au plus entre deux photos « quasi identiques ». */
  nearMax: number;
  /** Similarité minimale entre deux photos « similaires ». */
  simMin: number;
  /** Écart maximal entre deux photos « similaires », en minutes. */
  windowMin: number;
}

/** Seuils les plus larges que proposent les réglages : `findPairs` garde toutes les paires qui les passent. */
export const LIMITS: Params = { nearMax: 16, simMin: 0.75, windowMin: 30 };

/** Réglages par défaut (à ajuster sur de vraies photos : ROADMAP). */
export const DEFAULTS: Params = { nearMax: 8, simMin: 0.9, windowMin: 10 };

/**
 * Marge du garde-fou contre les chaînes : deux groupes « similaires » ne fusionnent que si **toutes** leurs photos
 * se ressemblent au moins à `simMin − CHAIN_SLACK`. Sans lui, A ressemble à B, B à C… et le groupe finit par réunir
 * des photos qui n'ont rien à voir.
 */
export const CHAIN_SLACK = 0.05;

const MINUTE = 60_000;

/** Contraste (écart type des niveaux de gris) en dessous duquel une photo est presque vide (`junk.ts`). */
export const EMPTY_CONTRAST = 10;

/**
 * Photo presque vide : noire (prise dans la poche), blanche, unie. Jamais « quasi identique » ni « similaire » : le
 * bruit d'une photo noire donne une empreinte au hasard (31 bits sur 64, à 6 bits d'un ciel bleu sur les photos de
 * l'utilisateur), que seul le contraste trahit.
 */
export function isFlat(p: { dhash?: string; quality?: Quality }): boolean {
  return (!!p.dhash && isUniformHash(p.dhash)) || (!!p.quality && p.quality.contrast < EMPTY_CONTRAST);
}

/** Toutes les paires candidates, avec les seuils les plus larges (`LIMITS`). */
export function findPairs(photos: PhotoInfo[], limits: Params = LIMITS): Pair[] {
  const pairs: Pair[] = [];

  // Copies exactes : chaque copie reliée à la première de son empreinte.
  const bySha = new Map<string, number>();
  photos.forEach((p, i) => {
    if (!p.sha) return;
    const first = bySha.get(p.sha);
    if (first === undefined) bySha.set(p.sha, i);
    else pairs.push({ a: first, b: i, kind: 'exact' });
  });
  const sameFile = (i: number, j: number) => !!photos[i].sha && photos[i].sha === photos[j].sha;

  // Quasi identiques : toutes les empreintes comparées deux à deux (64 bits, très rapide).
  const idx: number[] = [];
  photos.forEach((p, i) => {
    if (p.dhash && !isFlat(p)) idx.push(i);
  });
  const hi = new Uint32Array(idx.length);
  const lo = new Uint32Array(idx.length);
  idx.forEach((i, k) => {
    [hi[k], lo[k]] = hashWords(photos[i].dhash!);
  });
  for (let k = 0; k < idx.length; k++) {
    for (let m = k + 1; m < idx.length; m++) {
      const dist = popcount32(hi[k] ^ hi[m]) + popcount32(lo[k] ^ lo[m]);
      if (dist <= limits.nearMax && !sameFile(idx[k], idx[m])) pairs.push({ a: idx[k], b: idx[m], kind: 'near', dist });
    }
  }

  // Similaires : seulement entre photos datées et proches dans le temps. Pas les images presque uniformes (photos
  // noires prises dans la poche) : le modèle les juge pareilles, mais ce ne sont pas des doublons à départager ;
  // elles vont dans les photos inutiles.
  const timed = photos
    .map((_, i) => i)
    .filter((i) => photos[i].time !== undefined && photos[i].emb && !isFlat(photos[i]))
    .sort((i, j) => photos[i].time! - photos[j].time!);
  const window = limits.windowMin * MINUTE;
  for (let k = 0; k < timed.length; k++) {
    const a = timed[k];
    for (let m = k + 1; m < timed.length; m++) {
      const b = timed[m];
      const dt = photos[b].time! - photos[a].time!;
      if (dt > window) break;
      if (sameFile(a, b)) continue;
      const sim = cosine(photos[a].emb!, photos[b].emb!);
      if (sim >= limits.simMin) pairs.push({ a, b, kind: 'similar', sim, dt });
    }
  }
  return pairs;
}

/** Pourquoi la photo suggérée est proposée. */
export type BestReason = 'original' | 'folder' | 'resolution' | 'sharpness';

export interface Group {
  /** Identifiant stable : dépend seulement des photos du groupe. */
  id: string;
  kind: Kind;
  /** Indices des photos, la suggestion d'abord, puis par date. */
  members: number[];
  /** La suggestion (−1 : pas de suggestion, photos inutiles). */
  best: number;
  reason: BestReason;
  /** Place libérée si l'on ne garde que la suggestion (octets). */
  wasted: number;
  /** Date du groupe (première prise de vue, sinon modification du fichier). */
  time: number;
  /** Photos inutiles : les raisons de chaque photo (indice → raisons) et la plus fréquente. */
  junk?: { reasons: Record<number, JunkReason[]>; main: JunkReason };
}

/** Dossiers et noms qui trahissent une copie (messageries, téléchargements, « (1) », « - Copie »). */
const COPY_HINTS = /whatsapp|telegram|messenger|signal|snapchat|download|t[ée]l[ée]charg|copie|copy|\(\d+\)|-\d+\.\w+$/i;

const rankOf = (p: PhotoInfo) => p.rank ?? 0;

function copyPenalty(p: PhotoInfo): number {
  return COPY_HINTS.test(p.path) ? 1 : 0;
}

/**
 * Comparaison « laquelle est l'originale ? » : dans le dossier le plus haut (l'ordre choisi par l'utilisateur), pas dans un
 * dossier de messagerie, la plus ancienne, le chemin le plus court.
 */
function compareOriginal(a: PhotoInfo, b: PhotoInfo): number {
  return rankOf(a) - rankOf(b) || copyPenalty(a) - copyPenalty(b) || a.lastModified - b.lastModified || a.path.length - b.path.length || a.path.localeCompare(b.path);
}

/** Dossiers (leurs rangs) d'où viennent ces photos, dans l'ordre. */
export function usedRanks(photos: PhotoInfo[]): number[] {
  return [...new Set(photos.map(rankOf))].sort((a, b) => a - b);
}

const pixels = (p: PhotoInfo) => (p.width ?? 0) * (p.height ?? 0);

/**
 * La photo à garder, proposée (l'utilisateur décide) :
 * - copies exactes : celle du dossier le plus haut, sinon l'originale (pas celle de WhatsApp, la plus ancienne) ;
 * - quasi identiques : la plus grande (définition), puis le plus gros fichier (moins compressé) ;
 * - similaires : la plus nette.
 */
export function suggestBest(photos: PhotoInfo[], members: number[], kind: DupKind): { best: number; reason: BestReason } {
  const sorted = [...members].sort((i, j) => {
    const a = photos[i];
    const b = photos[j];
    if (kind === 'near') return pixels(b) - pixels(a) || b.size - a.size || compareOriginal(a, b);
    if (kind === 'similar') return (b.sharpness ?? 0) - (a.sharpness ?? 0) || pixels(b) - pixels(a) || compareOriginal(a, b);
    return compareOriginal(a, b);
  });
  const best = sorted[0];
  // Copies de plusieurs dossiers : c'est l'ordre des dossiers qui a choisi.
  const original = members.some((i) => rankOf(photos[i]) !== rankOf(photos[best])) ? 'folder' : 'original';
  if (kind === 'exact') return { best, reason: original };
  if (kind === 'near') {
    const tie = members.every((i) => pixels(photos[i]) === pixels(photos[best]));
    return { best, reason: tie ? original : 'resolution' };
  }
  return { best, reason: 'sharpness' };
}

/** Empreinte courte (FNV-1a) d'un texte : identifiant de groupe. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Identifiant d'un groupe : les clés de ses photos, triées. */
export function groupId(photos: PhotoInfo[], members: number[]): string {
  return shortHash(members.map((i) => photos[i].key).sort().join('\n'));
}

/** Les groupes, pour les réglages choisis. */
export function buildGroups(photos: PhotoInfo[], pairs: Pair[], params: Params): Group[] {
  const parent = photos.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const members = new Map<number, number[]>();
  const usedSimilar = new Set<number>();
  const membersOf = (r: number) => members.get(r) ?? [r];
  const union = (a: number, b: number, similar: boolean) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    parent[rb] = ra;
    members.set(ra, [...membersOf(ra), ...membersOf(rb)]);
    members.delete(rb);
    if (similar || usedSimilar.has(rb)) usedSimilar.add(ra);
    usedSimilar.delete(rb);
  };

  // 1. Copies exactes et quasi identiques : reliées directement.
  for (const p of pairs) {
    if (p.kind === 'exact' || (p.kind === 'near' && p.dist! <= params.nearMax)) union(p.a, p.b, false);
  }

  // 2. Similaires : des plus ressemblantes aux moins ressemblantes, avec le garde-fou contre les chaînes.
  const window = params.windowMin * MINUTE;
  const similar = pairs
    .filter((p) => p.kind === 'similar' && p.sim! >= params.simMin && p.dt! <= window)
    .sort((x, y) => y.sim! - x.sim!);
  const floor = params.simMin - CHAIN_SLACK;
  for (const p of similar) {
    const ra = find(p.a);
    const rb = find(p.b);
    if (ra === rb) continue;
    const A = membersOf(ra);
    const B = membersOf(rb);
    let ok = true;
    for (const x of A) {
      for (const y of B) {
        const ex = photos[x].emb;
        const ey = photos[y].emb;
        if (!ex || !ey) continue;
        if (cosine(ex, ey) < floor) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (ok) union(p.a, p.b, true);
  }

  const groups: Group[] = [];
  for (const [root, list] of members) {
    if (list.length < 2) continue;
    const allSame = list.every((i) => photos[i].sha && photos[i].sha === photos[list[0]].sha);
    const kind: DupKind = allSame ? 'exact' : usedSimilar.has(root) ? 'similar' : 'near';
    const { best, reason } = suggestBest(photos, list, kind);
    const when = (i: number) => photos[i].time ?? photos[i].lastModified;
    const rest = list.filter((i) => i !== best).sort((i, j) => when(i) - when(j) || photos[i].path.localeCompare(photos[j].path));
    groups.push({
      id: groupId(photos, list),
      kind,
      members: [best, ...rest],
      best,
      reason,
      wasted: rest.reduce((s, i) => s + photos[i].size, 0),
      time: Math.min(...list.map(when)),
    });
  }
  return groups.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

/** Ressemblance d'une photo avec la suggestion de son groupe, pour l'afficher (et régler les seuils). */
export function likeness(photos: PhotoInfo[], best: number, other: number): { dist?: number; sim?: number } {
  const a = photos[best];
  const b = photos[other];
  const out: { dist?: number; sim?: number } = {};
  if (a.dhash && b.dhash) out.dist = hamming(a.dhash, b.dhash);
  if (a.emb && b.emb) out.sim = cosine(a.emb, b.emb);
  return out;
}
