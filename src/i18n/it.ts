import type { Dict } from './fr';

const pl = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const it: Dict = {
  app: {
    tagline: 'Trova le tue foto doppie e tieni la migliore.',
    privacy: 'Tutto avviene sul tuo computer: nessuna foto viene inviata, niente viene eliminato.',
    prototype: 'Prototipo: trova i gruppi di doppioni, per ora non elimina niente.',
  },
  start: {
    pick: 'Scegli una cartella di foto',
    subfolders: 'Le sottocartelle sono incluse.',
    resume: (name) => `Riprendi «${name}»`,
    similar: 'Cerca anche le foto simili',
    similarHelp: (mb) => `Raffiche, la stessa scena scattata più volte. La prima volta viene scaricato un modello di ${mb} MB; le tue foto restano qui.`,
    noAccess: 'L’accesso alla cartella è stato negato.',
  },
  scan: {
    listing: 'Ricerca delle foto',
    analyze: 'Analisi delle foto',
    model: 'Download del modello',
    similar: 'Ricerca delle foto simili',
    pairs: 'Confronto delle foto',
    stop: 'Interrompi',
    remaining: (time) => `ancora circa ${time}`,
    failed: (error) => `L’analisi non è riuscita: ${error}`,
  },
  results: {
    analyzed: 'foto analizzate',
    groups: 'gruppi',
    extra: 'foto di troppo',
    space: 'recuperabili',
    all: 'Tutti',
    kinds: {
      exact: 'Copie esatte',
      near: 'Quasi identiche',
      similar: 'Simili',
    },
    kindHelp: {
      exact: 'Gli stessi file, byte per byte.',
      near: 'La stessa foto, ridimensionata, ricompressa o ritoccata.',
      similar: 'La stessa scena, scattata a pochi istanti di distanza.',
    },
    none: 'Nessun doppione trovato con queste impostazioni.',
    more: 'Mostra altri',
    skipped: (unreadable, unsupported, videos) =>
      'Non analizzati: ' +
      [
        unreadable && `${unreadable} ${pl(unreadable, 'foto illeggibile', 'foto illeggibili')}`,
        unsupported && `${unsupported} foto HEIC (iPhone) che il browser non sa aprire`,
        videos && `${videos} ${pl(videos, 'video', 'video')}`,
      ]
        .filter(Boolean)
        .join(', ') +
      '.',
    modelError: 'Non è stato possibile scaricare il modello: niente foto simili questa volta.',
    elapsed: (time, analyzed) => (analyzed ? `Analisi completata in ${time} (${analyzed} ${pl(analyzed, 'foto nuova', 'foto nuove')}).` : `Analisi completata in ${time}, niente di nuovo.`),
    another: 'Altra cartella',
    rescan: 'Rianalizza',
    verified: (good, wrong) => `Verificati: ${good} ${pl(good, 'corretto', 'corretti')}, ${wrong} ${pl(wrong, 'errore', 'errori')}`,
  },
  settings: {
    title: 'Impostazioni del rilevamento',
    help: 'I gruppi cambiano in tempo reale. Indica per ogni gruppo se è corretto: servirà a scegliere le impostazioni migliori.',
    nearMax: 'Quasi identiche: differenza massima',
    nearValue: (n) => `${n} bit su 64`,
    simMin: 'Simili: somiglianza minima',
    simValue: (pct) => `${pct}%`,
    windowMin: 'Simili: intervallo di tempo massimo',
    windowValue: (min) => `${min} min`,
    reset: 'Impostazioni predefinite',
  },
  group: {
    photos: (n) => `${n} foto`,
    wasted: (size) => `${size} recuperabili`,
    suggestion: 'Suggerimento',
    reasons: {
      original: 'l’originale',
      resolution: 'la più grande',
      sharpness: 'la più nitida',
    },
    dist: (n) => `${n} bit di differenza`,
    sim: (pct) => `simile al ${pct}%`,
    identical: 'identica',
    noDate: 'senza data',
    verdict: 'Questo gruppo:',
    good: 'Corretto',
    wrong: 'Non sono doppioni',
  },
  viewer: {
    close: 'Chiudi',
    prev: 'Precedente',
    next: 'Successiva',
  },
  language: 'Lingua',
};
