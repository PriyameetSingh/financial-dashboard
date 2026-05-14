/** MIME types allowed for meeting presentations (PDF, PPTX, legacy PPT, DOC, DOCX, XLS, XLSX). */
export const MEETING_MATERIAL_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const MEETING_MATERIAL_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/** When `File.type` is missing (common for some signed PDFs) or `application/octet-stream`, infer from extension. */
function inferMeetingMaterialMimeFromFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".pptx"))
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (lower.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  return null;
}

export function sanitizeMeetingFileName(name: string): string {
  const base = name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "file";
  return base.length > 200 ? base.slice(0, 200) : base;
}

export function assertAllowedMeetingMaterial(file: File): void {
  let mime = file.type || "";
  if (!MEETING_MATERIAL_ALLOWED_MIME.has(mime)) {
    const inferred = inferMeetingMaterialMimeFromFileName(file.name);
    const canInfer =
      inferred &&
      (!mime || mime === "application/octet-stream") &&
      MEETING_MATERIAL_ALLOWED_MIME.has(inferred);
    if (canInfer) mime = inferred;
  }
  if (!MEETING_MATERIAL_ALLOWED_MIME.has(mime)) {
    throw new Error("Only PDF, PowerPoint, Word, and Excel files (.pdf, .ppt, .pptx, .doc, .docx, .xls, .xlsx) are allowed.");
  }
  if (file.size > MEETING_MATERIAL_MAX_BYTES) {
    throw new Error(`File is too large (max ${MEETING_MATERIAL_MAX_BYTES / (1024 * 1024)} MB).`);
  }
}
