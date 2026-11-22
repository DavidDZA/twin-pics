import { useEffect, useState } from 'react';
import type { FoundFile } from '../lib/files';

interface Props {
  file?: FoundFile;
  /** Miniature (affichée tout de suite, en attendant la photo). */
  thumb?: string;
  /** Afficher le fichier d'origine (sinon la miniature seule). */
  full: boolean;
  alt?: string;
}

/** Une photo en grand : la miniature d'abord, puis le fichier d'origine. */
export function PhotoImage({ file, thumb, full, alt = '' }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!full || !file) return;
    const opened = file.open();
    setUrl(opened.url);
    return () => opened.release();
  }, [file, full]);

  const src = url ?? thumb;
  return src ? <img src={src} alt={alt} decoding="async" draggable={false} /> : <span className="placeholder" />;
}
