import { extractText, getDocumentProxy } from "unpdf";

export type PdfExtractResult = {
  text: string;
  pages: number;
};

/**
 * Pull plain text out of a PDF buffer using unpdf. Throws if the PDF is
 * corrupt or contains no extractable text (i.e. image-only scans).
 */
export async function extractPdfText(
  bytes: Uint8Array,
): Promise<PdfExtractResult> {
  const pdf = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n") : text;
  if (!merged.trim()) {
    throw new Error(
      "No extractable text in this PDF. It may be image-only — try a text-based PDF or paste the text.",
    );
  }
  return { text: merged, pages: totalPages };
}
