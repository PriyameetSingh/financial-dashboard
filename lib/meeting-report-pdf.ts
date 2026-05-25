/** @deprecated PDF generation has moved server-side. Use GET /api/v1/reports/meeting/:meetingId/pdf?download=1 instead. */
/**
 * html2canvas only understands a subset of CSS color syntax. Tailwind v4 (and browser
 * `getComputedStyle` serialization) can emit `lab()`, `oklch()`, etc., which triggers
 * “Attempting to parse an unsupported color function …”.
 *
 * Assigning paint values through a 2D canvas `fillStyle` forces the UA to normalize colors
 * to strings html2canvas can parse (`#rgb`, `#rrggbb`, `rgba(…)`, and common gradients).
 */
function createColorNormalizationContext(win: Window): CanvasRenderingContext2D {
  const c = win.document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Could not prepare canvas color normalization.");
  return ctx;
}

/** Returns a string suitable for html2canvas, or the original value if coercion fails. */
function normalizePaintValueForHtml2canvas(value: string, ctx: CanvasRenderingContext2D): string {
  const v = value.trim();
  if (!v || v === "none") return v;
  const sentinel = "__h2c_color_probe__";
  try {
    ctx.fillStyle = sentinel;
    ctx.fillStyle = v;
    const out = ctx.fillStyle;
    if (typeof out === "string" && out !== sentinel) return out;
  } catch {
    /* keep original */
  }
  return value;
}

const PAINT_PROPERTIES_TO_NORMALIZE = [
  "color",
  "background-color",
  "background-image",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "column-rule-color",
  "caret-color",
  "box-shadow",
  "text-shadow",
  "fill",
  "stroke",
  "stop-color",
  "-webkit-text-stroke-color",
] as const;

/**
 * Regex that matches the CSS color functions html2canvas 1.x cannot parse.
 * Handles simple single-level calls like `oklch(0.97 0.013 17.38)` and
 * `lab(50% 20 -10)`. Nested functions (e.g. color-mix) are matched greedily
 * up to the first closing paren which is sufficient for Tailwind v4 palette values.
 */
const UNSUPPORTED_COLOR_RE = /\b(?:oklch|oklab|lab|lch|color)\([^)]*\)/g;

/**
 * Walk every <style> and <link rel="stylesheet"> element in the cloned document
 * and replace unsupported CSS color functions with canvas-normalized equivalents.
 *
 * This is necessary because html2canvas parses raw stylesheet text in addition to
 * reading computed inline styles — so even after applyNormalizedPaintStylesToClone
 * the parser still fails on Tailwind v4's oklch() palette definitions that appear
 * in both inline <style> tags (dev) and external <link> files (production builds).
 *
 * html2canvas awaits the Promise returned by onclone, so this can be async.
 */
async function patchStylesheetsInClone(clonedDoc: Document, win: Window): Promise<void> {
  const ctx = createColorNormalizationContext(win);

  const patchText = (css: string) =>
    css.replace(UNSUPPORTED_COLOR_RE, (match) => normalizePaintValueForHtml2canvas(match, ctx));

  // Patch inline <style> elements
  clonedDoc.querySelectorAll("style").forEach((styleEl) => {
    if (!styleEl.textContent) return;
    styleEl.textContent = patchText(styleEl.textContent);
  });

  // Fetch, patch, and replace <link rel="stylesheet"> with inline <style> elements.
  // Next.js production builds deliver all CSS as external files; html2canvas fetches
  // and parses them, hitting oklch() before our inline-style overrides take effect.
  const linkEls = Array.from(
    clonedDoc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  );
  await Promise.all(
    linkEls.map(async (linkEl) => {
      try {
        const res = await win.fetch(linkEl.href);
        if (!res.ok) return;
        const css = await res.text();
        const styleEl = clonedDoc.createElement("style");
        styleEl.textContent = patchText(css);
        linkEl.parentNode?.replaceChild(styleEl, linkEl);
      } catch {
        // If the file can't be fetched (e.g. cross-origin), remove the link so
        // html2canvas doesn't try to parse it and throw on unsupported colors.
        linkEl.remove();
      }
    }),
  );
}

function applyNormalizedPaintStylesToClone(origin: HTMLElement, clone: HTMLElement, win: Window): void {
  const ctx = createColorNormalizationContext(win);
  const stack: [HTMLElement, HTMLElement][] = [[origin, clone]];

  while (stack.length > 0) {
    const [src, dst] = stack.pop()!;
    const computed = win.getComputedStyle(src);
    for (const prop of PAINT_PROPERTIES_TO_NORMALIZE) {
      const raw = computed.getPropertyValue(prop).trim();
      if (!raw || raw === "none") continue;
      const normalized = normalizePaintValueForHtml2canvas(raw, ctx);
      dst.style.setProperty(prop, normalized);
    }
    const oc = src.children;
    const cc = clone.children;
    const n = Math.min(oc.length, cc.length);
    for (let i = n - 1; i >= 0; i--) {
      stack.push([oc[i] as HTMLElement, cc[i] as HTMLElement]);
    }
  }
}

/**
 * Rasterizes a DOM node to a multi-page A4 PDF (same visual as the report markup).
 */
export async function downloadMeetingReportPdf(root: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const win = root.ownerDocument.defaultView ?? window;

  const canvas = await html2canvas(root, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: "#ffffff",
    async onclone(clonedDoc, clonedRoot) {
      await patchStylesheetsInClone(clonedDoc, win);
      applyNormalizedPaintStylesToClone(root, clonedRoot, win);
    },
  });

  const imgData = canvas.toDataURL("image/png", 1.0);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  let offsetY = 0;
  while (offsetY < imgHeight) {
    if (offsetY > 0) {
      pdf.addPage();
    }
    pdf.addImage(imgData, "PNG", 0, -offsetY, imgWidth, imgHeight);
    offsetY += pageHeight;
  }

  pdf.save(filename);
}
