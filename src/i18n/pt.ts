import type { Dict } from './fr';

const s = (n: number) => (n === 1 ? '' : 's');

export const pt: Dict = {
  app: {
    tagline: 'Encontre suas fotos duplicadas e fique com a melhor.',
    privacy: 'Tudo acontece no seu computador: nenhuma foto é enviada, nada é apagado.',
    prototype: 'Protótipo: ele encontra os grupos de duplicadas, por enquanto não apaga nada.',
  },
  start: {
    pick: 'Escolher uma pasta de fotos',
    subfolders: 'As subpastas estão incluídas.',
    resume: (name) => `Retomar “${name}”`,
    similar: 'Procurar também fotos parecidas',
    similarHelp: (mb) => `Sequências, a mesma cena fotografada várias vezes. Um modelo de ${mb} MB é baixado na primeira vez; suas fotos ficam aqui.`,
    noAccess: 'O acesso à pasta foi negado.',
  },
  scan: {
    listing: 'Procurando fotos',
    analyze: 'Analisando fotos',
    model: 'Baixando o modelo',
    similar: 'Procurando fotos parecidas',
    pairs: 'Comparando fotos',
    stop: 'Parar',
    remaining: (time) => `faltam uns ${time}`,
    failed: (error) => `A análise falhou: ${error}`,
  },
  results: {
    analyzed: 'fotos analisadas',
    groups: 'grupos',
    extra: 'fotos sobrando',
    space: 'a liberar',
    all: 'Todos',
    kinds: {
      exact: 'Cópias exatas',
      near: 'Quase idênticas',
      similar: 'Parecidas',
    },
    kindHelp: {
      exact: 'Os mesmos arquivos, byte a byte.',
      near: 'A mesma foto, redimensionada, recomprimida ou retocada.',
      similar: 'A mesma cena, tirada com instantes de diferença.',
    },
    none: 'Nenhuma duplicada encontrada com estas configurações.',
    more: 'Ver mais',
    skipped: (unreadable, unsupported, videos) =>
      'Não analisados: ' +
      [
        unreadable && `${unreadable} foto${s(unreadable)} ilegíve${unreadable === 1 ? 'l' : 'is'}`,
        unsupported && `${unsupported} foto${s(unsupported)} HEIC (iPhone) que o navegador não consegue abrir`,
        videos && `${videos} vídeo${s(videos)}`,
      ]
        .filter(Boolean)
        .join(', ') +
      '.',
    modelError: 'Não foi possível baixar o modelo: sem fotos parecidas desta vez.',
    elapsed: (time, analyzed) => (analyzed ? `Análise feita em ${time} (${analyzed} foto${s(analyzed)} nova${s(analyzed)}).` : `Análise feita em ${time}, nada de novo.`),
    another: 'Outra pasta',
    rescan: 'Analisar de novo',
    verified: (good, wrong) => `Conferidos: ${good} certo${s(good)}, ${wrong} erro${s(wrong)}`,
  },
  settings: {
    title: 'Configurações da detecção',
    help: 'Os grupos mudam na hora. Diga para cada grupo se está certo: isso vai ajudar a escolher as melhores configurações.',
    nearMax: 'Quase idênticas: diferença máxima',
    nearValue: (n) => `${n} bit${s(n)} de 64`,
    simMin: 'Parecidas: semelhança mínima',
    simValue: (pct) => `${pct}%`,
    windowMin: 'Parecidas: intervalo de tempo máximo',
    windowValue: (min) => `${min} min`,
    reset: 'Configurações padrão',
  },
  group: {
    photos: (n) => `${n} foto${s(n)}`,
    wasted: (size) => `${size} a liberar`,
    suggestion: 'Sugestão',
    reasons: {
      original: 'a original',
      resolution: 'a maior',
      sharpness: 'a mais nítida',
    },
    dist: (n) => `${n} bit${s(n)} de diferença`,
    sim: (pct) => `${pct}% parecida`,
    identical: 'idêntica',
    noDate: 'sem data',
    verdict: 'Este grupo:',
    good: 'Certo',
    wrong: 'Não são duplicadas',
  },
  viewer: {
    close: 'Fechar',
    prev: 'Anterior',
    next: 'Próxima',
  },
  language: 'Idioma',
};
