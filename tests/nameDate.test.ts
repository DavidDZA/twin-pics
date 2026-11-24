import { describe, expect, it } from 'vitest';
import { nameTime } from '../src/lib/nameDate';

const local = (y: number, mo: number, d: number, h: number, mi: number, s: number) => new Date(y, mo - 1, d, h, mi, s).getTime();

describe('date lue dans le nom du fichier', () => {
  it('noms donnés par les appareils', () => {
    const t = local(2021, 5, 5, 17, 20, 47);
    for (const name of [
      'IMG_20210505_172047.jpg',
      '20210505_172047.jpg',
      'IMG20210505172047.jpg',
      'IMG_20210505_172047_1.jpg',
      'IMG_20210505_172047_1_BURST001_COVER.jpg',
      'IMG_20210505_172047123.jpg',
      'MVIMG_20210505_172047.jpg',
      'IMG_20210505_172047 (1).JPG',
      'IMG_20210505_172047 - Copie.jpeg',
      'IMG_20210505_172047~2.jpg',
      '2021-05-05 17.20.47.jpg',
    ])
      expect(nameTime(`F:/Photos/Croatie/${name}`), name).toBe(t);
  });

  it('Pixel : heure universelle', () => {
    expect(nameTime('PXL_20230714_101112123.jpg')).toBe(Date.UTC(2023, 6, 14, 10, 11, 12));
  });

  it('date sans heure, numéro, capture d’écran ou nom sans date : rien', () => {
    for (const name of ['IMG-20240714-WA0001.jpg', 'IMG_0001.jpg', 'DSC_1234.jpg', 'plage.jpg', '1620221234567.jpg', 'Screenshot_20240714-101112.png', 'Screenshot_20240714-101112.jpg', '20240714_101112.png', 'FB_IMG_1620221234567.jpg', 'received_20210505172047.jpg'])
      expect(nameTime(name), name).toBeUndefined();
  });

  it('dates impossibles ou à venir : rien', () => {
    for (const name of ['IMG_20211305_172047.jpg', 'IMG_20210532_172047.jpg', 'IMG_20210230_172047.jpg', 'IMG_20210505_252047.jpg', 'IMG_20210505_176047.jpg', 'IMG_20990505_172047.jpg', '202105051720471234567.jpg'])
      expect(nameTime(name), name).toBeUndefined();
  });

  it('messageries : le nom porte la date de l’envoi, rien', () => {
    expect(nameTime('F:/Photos/Telegram/IMG_20210505_172047_123.jpg')).toBeUndefined();
    expect(nameTime('signal-2021-05-05-17-20-47-123.jpg')).toBeUndefined();
    expect(nameTime('F:/WhatsApp Images/IMG_20210505_172047.jpg')).toBeUndefined();
  });
});
