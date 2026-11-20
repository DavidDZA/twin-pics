/**
 * Dossier de photos d'essai pour les tests de bout en bout (`e2e/.photos/Mes photos`), refait à chaque lancement :
 * - copies exactes : chat.jpg et « chat - Copie.jpg » ;
 * - quasi identiques : plage.jpg, sa copie WhatsApp (exacte) et une version réduite et recompressée ;
 * - rafale : deux photos de la même scène, cadrage décalé, à 2 s d'écart (dates EXIF) ;
 * - une photo sans double, une photo cassée, une photo HEIC et une vidéo (non analysées).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { photoSvg } from '../tests/images';

export const PHOTOS_DIR = path.join(import.meta.dirname, '.photos', 'Mes photos');

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
}

export default makePhotos;
