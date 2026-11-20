/**
 * Banc de mesure (outil de développement, lancé par mesure.mjs) : où part le temps des photos similaires ?
 * - décodage d'une photo entière puis réduction, contre décodage directement réduit ;
 * - modèle en WebAssembly (1 ou plusieurs workers) contre WebGPU.
 * Résultats dans window.__resultats.
 */
const out = document.getElementById('out')!;
const log = (s: string) => (out.textContent += s + '\n');

async function decodeFull(file: File): Promise<ImageData> {
  const full = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = 256 / Math.min(full.width, full.height);
  const w = Math.round(full.width * scale);
  const h = Math.round(full.height * scale);
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(full, 0, 0, w, h);
  full.close();
  return ctx.getImageData(0, 0, w, h);
}

async function decodeResized(file: File, width: number, height: number): Promise<ImageData> {
  const scale = 256 / Math.min(width, height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, w, h);
}

function runWorkers(n: number, device: string, dtype: string, images: ImageData[]): Promise<{ load: number; perPhoto: number; error?: string; vectors?: Float32Array[] }> {
  return new Promise((resolve) => {
    const workers = Array.from({ length: n }, () => new Worker(new URL('./bench.worker.ts', import.meta.url), { type: 'module' }));
    const share = workers.map((_, k) => images.filter((_, i) => i % n === k));
    const t0 = performance.now();
    let loaded = 0;
    let loadTime = 0;
    let done = 0;
    let tStart = 0;
    const vectors: Float32Array[] = [];
    workers.forEach((w, k) => {
      w.onmessage = (e) => {
        const m = e.data;
        if (m.error) {
          workers.forEach((x) => x.terminate());
          resolve({ load: 0, perPhoto: 0, error: m.error });
        } else if (m.ready) {
          loaded++;
          if (loaded === n) {
            loadTime = performance.now() - t0;
            tStart = performance.now();
            workers.forEach((x, j) => x.postMessage({ images: share[j] }));
          }
        } else if (m.done) {
          (m.vectors as Float32Array[]).forEach((v, j) => (vectors[j * n + k] = v));
          done++;
          if (done === n) {
            const total = performance.now() - tStart;
            workers.forEach((x) => x.terminate());
            resolve({ load: loadTime, perPhoto: total / images.length, vectors });
          }
        }
      };
      w.postMessage({ load: true, device, dtype, k });
    });
  });
}

(document.getElementById('files') as HTMLInputElement).onchange = async (e) => {
  const files = Array.from((e.target as HTMLInputElement).files!);
  const res: Record<string, unknown> = { photos: files.length, cores: navigator.hardwareConcurrency };
  const adapter = 'gpu' in navigator ? await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter() : null;
  res.webgpu = !!adapter;
  log(`photos ${files.length}, WebGPU ${!!adapter}`);

  let t = performance.now();
  const images: ImageData[] = [];
  for (const f of files) images.push(await decodeFull(f));
  res.decodeFullMs = (performance.now() - t) / files.length;
  log(`décodage entier + réduction : ${(res.decodeFullMs as number).toFixed(0)} ms/photo`);

  t = performance.now();
  for (const f of files) await decodeResized(f, 4000, 3000);
  res.decodeResizedMs = (performance.now() - t) / files.length;
  log(`décodage directement réduit : ${(res.decodeResizedMs as number).toFixed(0)} ms/photo`);

  for (const [n, device, dtype] of [
    [1, 'wasm', 'q8'],
    [4, 'wasm', 'q8'],
    [1, 'webgpu', 'fp32'],
    [1, 'webgpu', 'fp16'],
    [1, 'webgpu', 'q8'],
  ] as const) {
    if (device === 'webgpu' && !adapter) continue;
    const r = await runWorkers(n, device, dtype, images);
    const ref = (res['wasm-q8-x1'] as { vectors?: Float32Array[] } | undefined)?.vectors;
    let agree = '';
    if (ref && r.vectors) {
      // Mêmes photos : vecteurs du processeur (q8) contre ceux-ci. Et écart des ressemblances entre photos différentes.
      const cos = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);
      const same = r.vectors.map((v, i) => cos(v, ref[i]));
      let maxGap = 0;
      for (let i = 0; i < ref.length; i++) for (let j = i + 1; j < ref.length; j++) maxGap = Math.max(maxGap, Math.abs(cos(ref[i], ref[j]) - cos(r.vectors[i], r.vectors[j])));
      agree = `, accord avec q8 : min ${Math.min(...same).toFixed(4)}, écart max des ressemblances ${maxGap.toFixed(4)}`;
    }
    res[`${device}-${dtype}-x${n}`] = { ...r, vectors: undefined };
    if (device === 'wasm' && n === 1) res['wasm-q8-x1'] = r;
    log(`${device} ${dtype} ×${n} : ${r.error ?? `chargement ${r.load.toFixed(0)} ms, ${r.perPhoto.toFixed(0)} ms/photo${agree}`}`);
  }
  (window as unknown as { __resultats: unknown }).__resultats = res;
};
