/**
 * Dossier de photos d'essai pour les tests de bout en bout (`e2e/.photos/Mes photos`), refait à chaque lancement :
 * - copies exactes : chat.jpg et « chat - Copie.jpg » ;
 * - quasi identiques : plage.jpg, sa copie WhatsApp (exacte) et une version réduite et recompressée ;
 * - rafale : deux photos de la même scène, cadrage décalé, à 2 s d'écart (dates EXIF) ;
 * - une photo sans double, une photo cassée, une photo HEIC et une vidéo (non analysées) ;
 * - photos inutiles (`Ratées`) : deux photos noires (poche), une floue, une très sombre, deux captures d'écran presque
 *   d'une conversation, une page de texte (reconnue comme document par le modèle).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { photoSvg } from '../tests/images';

export const PHOTOS_DIR = path.join(import.meta.dirname, '.photos', 'Mes photos');

/** Un deuxième dossier (une clé USB) : deux copies exactes de « Mes photos », et une photo à part. */
export const KEY_DIR = path.join(import.meta.dirname, '.photos', 'Clé');

/** Site : ajoute le dossier d'essai par le champ d'envoi (la fenêtre de choix ne s'automatise pas), puis « Analyser ». */
export async function openPhotos(page: Page, analyze = 'Analyser'): Promise<void> {
  await page.getByTestId('folder-input').setInputFiles(PHOTOS_DIR);
  await page.getByRole('button', { name: analyze }).click();
}

const exif = (date: string) => ({ IFD0: { Make: 'Essai', Model: 'Appareil' }, IFD2: { DateTimeOriginal: date } });

export async function makePhotos(): Promise<void> {
  fs.rmSync(path.dirname(PHOTOS_DIR), { recursive: true, force: true });
  const dir = (p: string) => {
    fs.mkdirSync(path.join(PHOTOS_DIR, p), { recursive: true });
    return path.join(PHOTOS_DIR, p);
  };
  const vacances = dir('Vacances');
  const whatsapp = dir('WhatsApp Images');
  const animaux = dir('Animaux');

  const chat = await sharp(photoSvg(21)).withExif(exif('2023:05:02 10:00:00')).jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(animaux, 'chat.jpg'), chat);
  fs.writeFileSync(path.join(animaux, 'chat - Copie.jpg'), chat);

  const plage = await sharp(photoSvg(22, 1600, 1200)).withExif(exif('2024:07:14 15:30:00')).jpeg({ quality: 92 }).toBuffer();
  fs.writeFileSync(path.join(vacances, 'plage.jpg'), plage);
  fs.writeFileSync(path.join(whatsapp, 'IMG-20240714-WA0001.jpg'), plage);
  fs.writeFileSync(path.join(vacances, 'plage-petite.jpg'), await sharp(plage).resize(640).jpeg({ quality: 60 }).toBuffer());

  // Rafale : même scène, cadrage et lumière un peu différents, 2 s plus tard ; la seconde est floue.
  const scene = await sharp(photoSvg(23, 1600, 1200)).png().toBuffer();
  fs.writeFileSync(
    path.join(vacances, 'rafale-1.jpg'),
    await sharp(scene).extract({ left: 0, top: 0, width: 1400, height: 1050 }).withExif(exif('2024:07:15 18:00:00')).jpeg({ quality: 90 }).toBuffer(),
  );
  fs.writeFileSync(
    path.join(vacances, 'rafale-2.jpg'),
    await sharp(scene)
      .extract({ left: 200, top: 150, width: 1400, height: 1050 })
      .modulate({ brightness: 1.1 })
      .blur(2)
      .withExif(exif('2024:07:15 18:00:02'))
      .jpeg({ quality: 90 })
      .toBuffer(),
  );

  fs.writeFileSync(path.join(vacances, 'montagne.jpg'), await sharp(photoSvg(24)).withExif(exif('2024:07:16 09:00:00')).jpeg().toBuffer());
  fs.writeFileSync(path.join(vacances, 'cassee.jpg'), Buffer.from('pas une image'));
  fs.writeFileSync(path.join(vacances, 'iphone.heic'), Buffer.from('heic'));
  fs.writeFileSync(path.join(vacances, 'video.mp4'), Buffer.from('mp4'));

  // Photos inutiles.
  const ratees = dir('Ratées');
  const black = (shade: number, date: string) =>
    sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: shade, g: shade, b: shade } } })
      .withExif(exif(date))
      .jpeg()
      .toBuffer();
  fs.writeFileSync(path.join(ratees, 'noire-1.jpg'), await black(12, '2022:04:30 01:35:10'));
  fs.writeFileSync(path.join(ratees, 'noire-2.jpg'), await black(16, '2022:04:30 01:35:41'));
  fs.writeFileSync(path.join(ratees, 'floue.jpg'), await sharp(photoSvg(25, 1600, 1200)).blur(14).withExif(exif('2021:05:05 13:24:51')).jpeg().toBuffer());
  const lights = [200, 420, 700, 950, 1200, 1400].map((x, i) => `<circle cx="${x}" cy="${500 + (i % 3) * 120}" r="45" fill="#ffd27a"/>`).join('');
  const night = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="100%" height="100%" fill="#0b0b10"/>${lights}</svg>`);
  fs.writeFileSync(path.join(ratees, 'sombre.jpg'), await sharp(night).withExif(exif('2021:05:10 22:09:59')).jpeg().toBuffer());
  fs.writeFileSync(path.join(ratees, 'Screenshot_20240714-101112.png'), await sharp(screenSvg('Marie', '#075e54', ['Salut !', 'On se voit demain ?', 'Oui, où ça ?', 'Au café de la plage', 'À 15 h ?'])).png().toBuffer());
  fs.writeFileSync(path.join(ratees, 'Screenshot_20240802-184501.png'), await sharp(screenSvg('Paul', '#3b5998', ['Tu as les photos ?', 'Lesquelles ?', 'Celles du mariage', 'Je les envoie ce soir', 'Merci !', 'De rien'])).png().toBuffer());
  fs.writeFileSync(path.join(ratees, 'page.jpg'), await sharp(pageSvg()).withExif(exif('2023:02:01 09:00:00')).jpeg({ quality: 85 }).toBuffer());

  // La clé USB : copies plus anciennes (dates de fichier) que les photos du PC.
  fs.mkdirSync(path.join(KEY_DIR, 'Sauvegarde'), { recursive: true });
  for (const [from, to] of [
    ['Vacances/montagne.jpg', 'montagne.jpg'],
    ['Animaux/chat.jpg', 'chat.jpg'],
  ]) {
    const dest = path.join(KEY_DIR, 'Sauvegarde', to);
    fs.copyFileSync(path.join(PHOTOS_DIR, from), dest);
    fs.utimesSync(dest, new Date(2020, 1, 1), new Date(2020, 1, 1));
  }
  fs.writeFileSync(path.join(KEY_DIR, 'seule.jpg'), await sharp(photoSvg(31)).withExif(exif('2020:03:03 11:00:00')).jpeg().toBuffer());
}

/** Une capture d'écran de téléphone (1080 × 2400) : une conversation. */
function screenSvg(name: string, color: string, texts: string[]): Buffer {
  const bubbles = texts
    .map((t, i) => {
      const me = i % 2 === 1;
      const y = 300 + i * 220;
      return `<rect x="${me ? 380 : 60}" y="${y}" width="640" height="150" rx="40" fill="${me ? '#dcf8c6' : '#ffffff'}"/><text x="${me ? 420 : 100}" y="${y + 95}" font-size="52" font-family="Arial" fill="#111">${t}</text>`;
    })
    .join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2400"><rect width="100%" height="100%" fill="#ece5dd"/><rect width="100%" height="200" fill="${color}"/><text x="60" y="130" font-size="64" font-family="Arial" fill="#fff">${name}</text>${bubbles}<rect y="2250" width="100%" height="150" fill="#fff"/></svg>`,
  );
}

/** Une page de texte photographiée (le modèle y voit un document). */
function pageSvg(): Buffer {
  const words = 'Le présent contrat est conclu entre les parties soussignées pour une durée de douze mois à compter de la date de signature'.split(' ');
  let lines = '';
  for (let i = 0; i < 26; i++) {
    const line = Array.from({ length: 9 }, (_, k) => words[(i * 9 + k) % words.length]).join(' ');
    lines += `<text x="140" y="${260 + i * 52}" font-size="34" font-family="Times New Roman" fill="#222">${line}</text>`;
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="100%" height="100%" fill="#8a7a66"/><rect x="80" y="80" width="1040" height="1440" fill="#fbfaf6"/><text x="140" y="190" font-size="48" font-weight="bold" font-family="Times New Roman" fill="#111">CONTRAT DE LOCATION</text>${lines}</svg>`,
  );
}

export default makePhotos;
