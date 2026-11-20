/** Textes de l'interface, en français (référence : les autres langues sont typées sur ce dictionnaire). */
const s = (n: number) => (n > 1 ? 's' : '');

export const fr = {
  app: {
    tagline: 'Retrouve tes photos en double et garde la meilleure.',
    privacy: 'Tout se passe sur ton ordinateur : aucune photo n’est envoyée, rien n’est supprimé.',
    prototype: 'Prototype : il trouve les groupes de doublons, il ne supprime rien pour l’instant.',
  },
  start: {
    pick: 'Choisir un dossier de photos',
    subfolders: 'Les sous-dossiers sont compris.',
    resume: (name: string) => `Reprendre « ${name} »`,
    similar: 'Chercher aussi les photos similaires',
    similarHelp: (mb: number) =>
      `Rafales, même scène prise plusieurs fois. Un modèle de ${mb} Mo est téléchargé la première fois ; tes photos, elles, restent ici.`,
    noAccess: 'L’accès au dossier a été refusé.',
  },
  scan: {
    listing: 'Recherche des photos',
    analyze: 'Analyse des photos',
    model: 'Téléchargement du modèle',
    similar: 'Recherche des photos similaires',
    pairs: 'Comparaison des photos',
    stop: 'Arrêter',
    remaining: (time: string) => `encore ${time} environ`,
    failed: (error: string) => `L’analyse a échoué : ${error}`,
  },
  results: {
    analyzed: 'photos analysées',
    groups: 'groupes',
    extra: 'photos en trop',
    space: 'récupérables',
    all: 'Tous',
    kinds: {
      exact: 'Copies exactes',
      near: 'Quasi identiques',
      similar: 'Similaires',
    },
    kindHelp: {
      exact: 'Les mêmes fichiers, octet pour octet.',
      near: 'La même photo, redimensionnée, recompressée ou retouchée.',
      similar: 'La même scène, prise à quelques instants d’écart.',
    },
    none: 'Aucun doublon trouvé avec ces réglages.',
    more: 'Voir plus',
    skipped: (unreadable: number, unsupported: number, videos: number) =>
      'Non analysés : ' +
      [
        unreadable && `${unreadable} photo${s(unreadable)} illisible${s(unreadable)}`,
        unsupported && `${unsupported} photo${s(unsupported)} HEIC (iPhone), que le navigateur ne sait pas ouvrir`,
        videos && `${videos} vidéo${s(videos)}`,
      ]
        .filter(Boolean)
        .join(', ') +
      '.',
    modelError: 'Le modèle n’a pas pu être téléchargé : pas de photos similaires cette fois.',
    elapsed: (time: string, analyzed: number) =>
      analyzed ? `Analyse faite en ${time} (${analyzed} photo${s(analyzed)} nouvelle${s(analyzed)}).` : `Analyse faite en ${time}, rien de nouveau.`,
    device: (gpu: boolean): string =>
      gpu ? 'Photos similaires calculées par la carte graphique.' : 'Photos similaires calculées par le processeur, plus lent : la carte graphique n’est pas disponible dans ce navigateur.',
    another: 'Autre dossier',
    rescan: 'Relancer',
    verified: (good: number, wrong: number) => `Vérifiés : ${good} bien trouvé${s(good)}, ${wrong} erreur${s(wrong)}`,
  },
  settings: {
    title: 'Réglages de la détection',
    help: 'Les groupes changent en direct. Dis pour chaque groupe s’il est bien trouvé : ça servira à choisir les meilleurs réglages.',
    nearMax: 'Quasi identiques : écart maximal',
    nearValue: (n: number) => `${n} bit${s(n)} sur 64`,
    simMin: 'Similaires : ressemblance minimale',
    simValue: (pct: number) => `${pct} %`,
    windowMin: 'Similaires : écart de temps maximal',
    windowValue: (min: number) => `${min} min`,
    reset: 'Réglages par défaut',
  },
  group: {
    photos: (n: number) => `${n} photo${s(n)}`,
    wasted: (size: string) => `${size} récupérables`,
    suggestion: 'Suggestion',
    reasons: {
      original: 'l’originale',
      resolution: 'la plus grande',
      sharpness: 'la plus nette',
    },
    dist: (n: number) => `${n} bit${s(n)} d’écart`,
    sim: (pct: number) => `ressemble à ${pct} %`,
    identical: 'identique',
    noDate: 'sans date',
    verdict: 'Ce groupe :',
    good: 'Bien trouvé',
    wrong: 'Pas des doublons',
  },
  viewer: {
    close: 'Fermer',
    prev: 'Précédente',
    next: 'Suivante',
  },
  language: 'Langue',
};

export type Dict = typeof fr;
