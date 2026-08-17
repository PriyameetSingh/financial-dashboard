/**
 * PDF text extraction for assertions.
 *
 * The implementation lives in `scripts/lib/pdf-text.mjs` so the golden's HTTP
 * smoke leg (plain Node, no TS loader) uses exactly the same extractor as these
 * tests. Two copies would be two chances to disagree about whether a header
 * line is really in a rendered document.
 */
import { extractPdfText as extract } from "../../scripts/lib/pdf-text.mjs";

export function extractPdfText(buffer: Buffer): string {
  return extract(buffer) as string;
}
