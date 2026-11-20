import type { Dict } from './fr';

export const de: Dict = {
  app: {
    tagline: 'Finde deine doppelten Fotos und behalte das beste.',
    privacy: 'Alles passiert auf deinem Computer: Kein Foto wird hochgeladen, nichts wird gelöscht.',
    prototype: 'Prototyp: Er findet Gruppen von Duplikaten, löscht aber noch nichts.',
  },
  start: {
    pick: 'Fotoordner auswählen',
    subfolders: 'Unterordner sind eingeschlossen.',
    resume: (name) => `„${name}“ fortsetzen`,
    similar: 'Auch ähnliche Fotos suchen',
    similarHelp: (mb) => `Serienbilder, dieselbe Szene mehrmals fotografiert. Beim ersten Mal wird ein Modell mit ${mb} MB geladen; deine Fotos bleiben hier.`,
    noAccess: 'Der Zugriff auf den Ordner wurde verweigert.',
  },
  scan: {
    listing: 'Fotos werden gesucht',
    analyze: 'Fotos werden analysiert',
    model: 'Modell wird geladen',
    similar: 'Ähnliche Fotos werden gesucht',
    pairs: 'Fotos werden verglichen',
    stop: 'Stoppen',
    remaining: (time) => `noch etwa ${time}`,
    failed: (error) => `Die Analyse ist fehlgeschlagen: ${error}`,
  },
  results: {
    analyzed: 'Fotos analysiert',
    groups: 'Gruppen',
    extra: 'überzählige Fotos',
    space: 'freizugeben',
    all: 'Alle',
    kinds: {
      exact: 'Exakte Kopien',
      near: 'Fast identisch',
      similar: 'Ähnlich',
    },
    kindHelp: {
      exact: 'Dieselben Dateien, Byte für Byte.',
      near: 'Dasselbe Foto, verkleinert, neu komprimiert oder bearbeitet.',
      similar: 'Dieselbe Szene, kurz hintereinander aufgenommen.',
    },
    none: 'Mit diesen Einstellungen wurden keine Duplikate gefunden.',
    more: 'Mehr anzeigen',
    skipped: (unreadable, unsupported, videos) =>
      'Nicht analysiert: ' +
      [
        unreadable && `${unreadable} unlesbare${unreadable === 1 ? 's' : ''} Foto${unreadable === 1 ? '' : 's'}`,
        unsupported && `${unsupported} HEIC-Foto${unsupported === 1 ? '' : 's'} (iPhone), die der Browser nicht öffnen kann`,
        videos && `${videos} Video${videos === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(', ') +
      '.',
    modelError: 'Das Modell konnte nicht geladen werden: diesmal keine ähnlichen Fotos.',
    elapsed: (time, analyzed) => (analyzed ? `Analyse in ${time} fertig (${analyzed} neue${analyzed === 1 ? 's' : ''} Foto${analyzed === 1 ? '' : 's'}).` : `Analyse in ${time} fertig, nichts Neues.`),
    device: (gpu) => (gpu ? 'Ähnliche Fotos auf der Grafikkarte berechnet.' : 'Ähnliche Fotos auf dem Prozessor berechnet, langsamer: Die Grafikkarte ist in diesem Browser nicht verfügbar.'),
    another: 'Anderer Ordner',
    rescan: 'Neu starten',
    verified: (good, wrong) => `Geprüft: ${good} richtig, ${wrong} falsch`,
  },
  settings: {
    title: 'Einstellungen der Erkennung',
    help: 'Die Gruppen ändern sich sofort. Sag bei jeder Gruppe, ob sie stimmt: Das hilft, die besten Einstellungen zu wählen.',
    nearMax: 'Fast identisch: maximaler Unterschied',
    nearValue: (n) => `${n} von 64 Bits`,
    simMin: 'Ähnlich: minimale Ähnlichkeit',
    simValue: (pct) => `${pct} %`,
    windowMin: 'Ähnlich: maximaler Zeitabstand',
    windowValue: (min) => `${min} Min.`,
    reset: 'Standardeinstellungen',
  },
  group: {
    photos: (n) => `${n} Foto${n === 1 ? '' : 's'}`,
    wasted: (size) => `${size} freizugeben`,
    suggestion: 'Vorschlag',
    reasons: {
      original: 'das Original',
      resolution: 'das größte',
      sharpness: 'das schärfste',
    },
    dist: (n) => `${n} Bit${n === 1 ? '' : 's'} Unterschied`,
    sim: (pct) => `zu ${pct} % ähnlich`,
    identical: 'identisch',
    noDate: 'ohne Datum',
    verdict: 'Diese Gruppe:',
    good: 'Stimmt',
    wrong: 'Keine Duplikate',
  },
  viewer: {
    close: 'Schließen',
    prev: 'Vorheriges',
    next: 'Nächstes',
  },
  language: 'Sprache',
};
