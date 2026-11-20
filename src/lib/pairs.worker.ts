/** Paires candidates (`findPairs`) hors de l'interface : comparer des dizaines de milliers de photos prend du temps. */
import { findPairs, type PhotoInfo } from './groups';

self.onmessage = (e: MessageEvent<PhotoInfo[]>) => {
  self.postMessage(findPairs(e.data));
};
