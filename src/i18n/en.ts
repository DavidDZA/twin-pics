import type { Dict } from './fr';

const s = (n: number) => (n === 1 ? '' : 's');

export const en: Dict = {
  app: {
    tagline: 'Find your duplicate photos and keep the best one.',
    privacy: 'Everything happens on your computer: no photo is uploaded, nothing is deleted.',
    prototype: 'Prototype: it finds groups of duplicates, it doesn’t delete anything yet.',
  },
  start: {
    pick: 'Choose a photo folder',
    subfolders: 'Subfolders are included.',
    resume: (name) => `Resume “${name}”`,
    similar: 'Also look for similar photos',
    similarHelp: (mb) => `Bursts, the same scene shot several times. A ${mb} MB model is downloaded the first time; your photos stay here.`,
    noAccess: 'Access to the folder was denied.',
  },
  scan: {
    listing: 'Looking for photos',
    analyze: 'Analyzing photos',
    model: 'Downloading the model',
    similar: 'Looking for similar photos',
    pairs: 'Comparing photos',
    stop: 'Stop',
    remaining: (time) => `about ${time} left`,
    failed: (error) => `The analysis failed: ${error}`,
  },
  results: {
    analyzed: 'photos analyzed',
    groups: 'groups',
    extra: 'extra photos',
    space: 'to free up',
    all: 'All',
    kinds: {
      exact: 'Exact copies',
      near: 'Near-identical',
      similar: 'Similar',
    },
    kindHelp: {
      exact: 'The same files, byte for byte.',
      near: 'The same photo, resized, recompressed or edited.',
      similar: 'The same scene, shot moments apart.',
    },
    none: 'No duplicates found with these settings.',
    more: 'Show more',
    skipped: (unreadable, unsupported, videos) =>
      'Not analyzed: ' +
      [
        unreadable && `${unreadable} unreadable photo${s(unreadable)}`,
        unsupported && `${unsupported} HEIC photo${s(unsupported)} (iPhone) the browser can’t open`,
        videos && `${videos} video${s(videos)}`,
      ]
        .filter(Boolean)
        .join(', ') +
      '.',
    modelError: 'The model couldn’t be downloaded: no similar photos this time.',
    elapsed: (time, analyzed) => (analyzed ? `Analysis done in ${time} (${analyzed} new photo${s(analyzed)}).` : `Analysis done in ${time}, nothing new.`),
    another: 'Other folder',
    rescan: 'Run again',
    verified: (good, wrong) => `Checked: ${good} correct, ${wrong} wrong`,
  },
  settings: {
    title: 'Detection settings',
    help: 'Groups update live. Tell us for each group whether it’s right: it will help pick the best settings.',
    nearMax: 'Near-identical: maximum difference',
    nearValue: (n) => `${n} bit${s(n)} out of 64`,
    simMin: 'Similar: minimum likeness',
    simValue: (pct) => `${pct}%`,
    windowMin: 'Similar: maximum time gap',
    windowValue: (min) => `${min} min`,
    reset: 'Default settings',
  },
  group: {
    photos: (n) => `${n} photo${s(n)}`,
    wasted: (size) => `${size} to free up`,
    suggestion: 'Suggestion',
    reasons: {
      original: 'the original',
      resolution: 'the largest',
      sharpness: 'the sharpest',
    },
    dist: (n) => `${n} bit${s(n)} apart`,
    sim: (pct) => `${pct}% alike`,
    identical: 'identical',
    noDate: 'no date',
    verdict: 'This group:',
    good: 'Correct',
    wrong: 'Not duplicates',
  },
  viewer: {
    close: 'Close',
    prev: 'Previous',
    next: 'Next',
  },
  language: 'Language',
};
