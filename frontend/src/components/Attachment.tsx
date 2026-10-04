import { useState } from "react";

type Props = {
  /** URL to fetch the file from (same-origin, so the session cookie rides along). */
  url: string;
  /** Stored filename — its extension decides image vs PDF. Null renders nothing. */
  path: string | null;
  /** Alt text for the inline image. */
  alt: string;
  /** Link text for the PDF open-in-new-tab fallback. */
  linkLabel: string;
};

/** Renders an image inline, or a PDF embed with an open link. Renders nothing
 *  when there is no file (and hides an image that fails to load). */
export function Attachment({ url, path, alt, linkLabel }: Props) {
  const [missing, setMissing] = useState(false);
  if (!path || missing) return null;
  if (path.toLowerCase().endsWith(".pdf")) {
    return (
      <>
        <object
          data={url}
          type="application/pdf"
          className="h-72 w-full rounded-card border border-border"
        >
          <p className="rounded-card border border-border p-3 text-muted-fg">
            Preview unavailable in this browser.
          </p>
        </object>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="w-fit underline hover:opacity-80"
        >
          {linkLabel}
        </a>
      </>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className="max-h-72 rounded-card border border-border object-contain"
      onError={() => setMissing(true)}
    />
  );
}
