import { constants, inflateSync } from "node:zlib";

/**
 * Extract visible text from a rendered PDF buffer.
 *
 * Streams are located by their `stream` marker and inflated from that offset to
 * the END of the buffer with `Z_SYNC_FLUSH`, so zlib stops at the stream's own
 * terminator and trailing bytes are ignored. The earlier approach — regex
 * matching `stream … endstream` — silently dropped any stream whose compressed
 * bytes happened to contain the literal `endstream` sequence (common in font
 * subsets), which made assertions content-dependent: the same code could render
 * a correct header and still "prove" it missing.
 *
 * react-pdf writes text as hex byte strings with kerning numbers between them
 * (`[<476f> 20 <7665726e…>] TJ`), so both hex `<…>` and literal `(…)` operands
 * are decoded.
 */
export function extractPdfText(buffer: Buffer): string {
  const latin = buffer.toString("latin1");
  const decoded: string[] = [];

  const marker = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = marker.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    try {
      decoded.push(
        inflateSync(buffer.subarray(start), { finishFlush: constants.Z_SYNC_FLUSH }).toString("latin1"),
      );
    } catch {
      // Not a flate stream (or not decodable) — skip it.
    }
  }

  let out = "";
  const textOps =
    /\[((?:\s*(?:<[0-9A-Fa-f]*>|\((?:\\.|[^)])*\)|-?[\d.]+)\s*)+)\]\s*TJ|(<[0-9A-Fa-f]*>|\((?:\\.|[^)])*\))\s*Tj/g;
  for (const chunk of decoded) {
    let t: RegExpExecArray | null;
    while ((t = textOps.exec(chunk)) !== null) {
      const body = t[1] ?? t[2] ?? "";
      for (const piece of body.match(/<[0-9A-Fa-f]*>|\((?:\\.|[^)])*\)/g) ?? []) {
        if (piece.startsWith("<")) {
          const hex = piece.slice(1, -1);
          for (let i = 0; i + 1 < hex.length; i += 2) {
            out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
          }
        } else {
          out += piece.slice(1, -1).replace(/\\([()\\])/g, "$1");
        }
      }
      out += " ";
    }
    textOps.lastIndex = 0;
  }
  // Runs are joined with a space, so a heading split across runs
  // (`{label} Exp.`) yields "S.O.  Exp." where the rendered page shows
  // "S.O. Exp.". Collapse whitespace: this extractor can attest to the text
  // content and its order, not to exact inter-run spacing.
  return out.replace(/\s+/g, " ").trim();
}
