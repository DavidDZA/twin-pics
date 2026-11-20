import type { Dict } from './fr';

const s = (n: number) => (n === 1 ? '' : 's');

export const es: Dict = {
  app: {
    tagline: 'Encuentra tus fotos duplicadas y quédate con la mejor.',
    privacy: 'Todo ocurre en tu ordenador: no se envía ninguna foto y no se borra nada.',
    prototype: 'Prototipo: encuentra los grupos de duplicados, de momento no borra nada.',
  },
  start: {
    pick: 'Elegir una carpeta de fotos',
    subfolders: 'Las subcarpetas están incluidas.',
    resume: (name) => `Retomar «${name}»`,
    similar: 'Buscar también fotos parecidas',
    similarHelp: (mb) => `Ráfagas, la misma escena fotografiada varias veces. Se descarga un modelo de ${mb} MB la primera vez; tus fotos se quedan aquí.`,
    noAccess: 'Se denegó el acceso a la carpeta.',
  },
  scan: {
    listing: 'Buscando fotos',
    analyze: 'Analizando fotos',
    model: 'Descargando el modelo',
    similar: 'Buscando fotos parecidas',
    pairs: 'Comparando fotos',
    stop: 'Detener',
    remaining: (time) => `quedan unos ${time}`,
    failed: (error) => `El análisis ha fallado: ${error}`,
  },
  results: {
    analyzed: 'fotos analizadas',
    groups: 'grupos',
    extra: 'fotos de sobra',
    space: 'recuperables',
    all: 'Todos',
    kinds: {
      exact: 'Copias exactas',
      near: 'Casi idénticas',
      similar: 'Parecidas',
    },
    kindHelp: {
      exact: 'Los mismos archivos, byte a byte.',
      near: 'La misma foto, redimensionada, recomprimida o retocada.',
      similar: 'La misma escena, tomada con instantes de diferencia.',
    },
    none: 'No se han encontrado duplicados con estos ajustes.',
    more: 'Ver más',
    skipped: (unreadable, unsupported, videos) =>
      'Sin analizar: ' +
      [
        unreadable && `${unreadable} foto${s(unreadable)} ilegible${unreadable === 1 ? '' : 's'}`,
        unsupported && `${unsupported} foto${s(unsupported)} HEIC (iPhone) que el navegador no sabe abrir`,
        videos && `${videos} vídeo${s(videos)}`,
      ]
        .filter(Boolean)
        .join(', ') +
      '.',
    modelError: 'No se ha podido descargar el modelo: esta vez no hay fotos parecidas.',
    elapsed: (time, analyzed) =>
      analyzed ? `Análisis hecho en ${time} (${analyzed} foto${s(analyzed)} nueva${s(analyzed)}).` : `Análisis hecho en ${time}, nada nuevo.`,
    another: 'Otra carpeta',
    rescan: 'Volver a analizar',
    verified: (good, wrong) => `Revisados: ${good} correcto${s(good)}, ${wrong} error${wrong === 1 ? '' : 'es'}`,
  },
  settings: {
    title: 'Ajustes de la detección',
    help: 'Los grupos cambian en directo. Indica para cada grupo si es correcto: servirá para elegir los mejores ajustes.',
    nearMax: 'Casi idénticas: diferencia máxima',
    nearValue: (n) => `${n} bit${s(n)} de 64`,
    simMin: 'Parecidas: parecido mínimo',
    simValue: (pct) => `${pct} %`,
    windowMin: 'Parecidas: diferencia de tiempo máxima',
    windowValue: (min) => `${min} min`,
    reset: 'Ajustes por defecto',
  },
  group: {
    photos: (n) => `${n} foto${s(n)}`,
    wasted: (size) => `${size} recuperables`,
    suggestion: 'Sugerencia',
    reasons: {
      original: 'la original',
      resolution: 'la más grande',
      sharpness: 'la más nítida',
    },
    dist: (n) => `${n} bit${s(n)} de diferencia`,
    sim: (pct) => `parecida al ${pct} %`,
    identical: 'idéntica',
    noDate: 'sin fecha',
    verdict: 'Este grupo:',
    good: 'Correcto',
    wrong: 'No son duplicados',
  },
  viewer: {
    close: 'Cerrar',
    prev: 'Anterior',
    next: 'Siguiente',
  },
  language: 'Idioma',
};
