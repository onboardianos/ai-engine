// Universal file extractor for Supabase Edge Functions (Deno runtime)
// Extracts text from PDF, DOCX, XLSX/CSV, images, audio/video, JSON, Markdown, plain text

import { toBase64DataUri } from "./b64.ts";

// npm imports work in Supabase Edge (Deno with npm specifiers)
import JSZip from "npm:jszip@3.10.1";
import * as XLSX from "npm:xlsx@0.18.5";
// pdf.js legacy build works in browser-like runtimes
import * as pdfjsLib from "npm:pdfjs-dist@3.11.174/legacy/build/pdf.mjs";

export type ExtractResult = {
  text: string;
  warnings?: string[];
  meta?: Record<string, unknown>
};

function sniffType(file: File): string {
  const ct = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return ct || (name.endsWith(".pdf") ? "application/pdf" :
                name.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
                name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :
                name.endsWith(".csv") ? "text/csv" :
                name.endsWith(".json") ? "application/json" :
                name.endsWith(".md") ? "text/markdown" :
                name.endsWith(".txt") ? "text/plain" : "");
}

function stripHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "")
             .replace(/<style[\s\S]*?<\/style>/gi, "")
             .replace(/<\/?[^>]+(>|$)/g, " ")
             .replace(/\s+/g, " ")
             .trim();
}

async function extractPDF(bytes: Uint8Array): Promise<ExtractResult> {
  const loadingTask = (pdfjsLib as any).getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const maxPages = Math.min(pdf.numPages, 30);
  let out = "";
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const pageText = tc.items.map((it: any) => it.str).join(" ");
    out += `\n\n--- Page ${i} ---\n${pageText}`;
  }
  return {
    text: out.trim(),
    warnings: pdf.numPages > maxPages ? ["Truncated after 30 pages"] : [],
    meta: { totalPages: pdf.numPages, extractedPages: maxPages }
  };
}

async function extractDOCX(bytes: Uint8Array): Promise<ExtractResult> {
  const zip = await JSZip.loadAsync(bytes);
  const doc = zip.file("word/document.xml");
  if (!doc) return { text: "", warnings: ["No document.xml in DOCX (corrupt?)"] };
  const xml = await doc.async("string");
  const text = xml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { text };
}

async function extractXLSX(bytes: Uint8Array): Promise<ExtractResult> {
  const wb = XLSX.read(bytes, { type: "array" });
  const sheets = wb.SheetNames;
  let out = "";
  sheets.forEach((s) => {
    const ws = wb.Sheets[s];
    const csv = XLSX.utils.sheet_to_csv(ws);
    out += `\n\n--- Sheet: ${s} ---\n${csv}`;
  });
  return { text: out.trim() || "", meta: { sheets } };
}

async function extractCSV(bytes: Uint8Array): Promise<ExtractResult> {
  const text = new TextDecoder().decode(bytes);
  return { text };
}

async function extractJSON(bytes: Uint8Array): Promise<ExtractResult> {
  const raw = new TextDecoder().decode(bytes);
  try {
    const obj = JSON.parse(raw);
    return { text: JSON.stringify(obj, null, 2) };
  } catch {
    return { text: raw, warnings: ["Invalid JSON, returned raw text"] };
  }
}

async function extractPlain(bytes: Uint8Array): Promise<ExtractResult> {
  return { text: new TextDecoder().decode(bytes) };
}

async function extractHTML(bytes: Uint8Array): Promise<ExtractResult> {
  const html = new TextDecoder().decode(bytes);
  return { text: stripHtml(html) };
}

async function extractImage(file: File, apiKey: string): Promise<ExtractResult> {
  // Vision OCR via GPT-4o-mini; base64 embed as data URI
  const ab = new Uint8Array(await file.arrayBuffer());
  const dataUri = toBase64DataUri(ab, file.type || "image/png");

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.0,
        messages: [
          {
            role: "system",
            content: "Extract all visible text from the image. Return only the text content in reading order."
          },
          {
            role: "user",
            content: [
              { type: "text", text: "OCR this image. If handwriting, transcribe as best-effort." },
              { type: "image_url", image_url: { url: dataUri } }
            ]
          }
        ]
      })
    });

    if (!resp.ok) {
      const error = await resp.text();
      return { text: "", warnings: [`Vision OCR failed: ${resp.status} - ${error}`] };
    }

    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return { text, meta: { method: "vision-ocr" } };
  } catch (e: any) {
    return { text: "", warnings: [`Vision OCR error: ${e.message}`] };
  }
}

async function extractAudioVideo(file: File, apiKey: string): Promise<ExtractResult> {
  // Whisper transcription via OpenAI
  try {
    const fd = new FormData();
    fd.append("file", file, file.name);
    fd.append("model", "whisper-1");
    fd.append("response_format", "verbose_json");

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}` },
      body: fd
    });

    if (!resp.ok) {
      const error = await resp.text();
      return { text: "", warnings: [`Transcription failed: ${resp.status} - ${error}`] };
    }

    const json = await resp.json();
    return {
      text: (json.text ?? "").trim(),
      meta: { duration: json.duration, method: "whisper" }
    };
  } catch (e: any) {
    return { text: "", warnings: [`Transcription error: ${e.message}`] };
  }
}

export async function extractTextFromFile(file: File, apiKey: string): Promise<ExtractResult> {
  const type = sniffType(file);
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    if (!type) return extractPlain(bytes);

    if (type === "application/pdf") return await extractPDF(bytes);
    if (type.includes("wordprocessingml.document")) return await extractDOCX(bytes);
    if (type.includes("spreadsheetml.sheet")) return await extractXLSX(bytes);
    if (type === "text/csv" || file.name.toLowerCase().endsWith(".csv")) return await extractCSV(bytes);
    if (type === "application/json" || file.name.toLowerCase().endsWith(".json")) return await extractJSON(bytes);
    if (type.startsWith("text/")) return await extractPlain(bytes);
    if (type === "text/markdown" || file.name.toLowerCase().endsWith(".md")) return await extractPlain(bytes);
    if (type === "text/html" || file.name.toLowerCase().endsWith(".html")) return await extractHTML(bytes);
    if (type.startsWith("image/")) return await extractImage(file, apiKey);
    if (type.startsWith("audio/") || type.startsWith("video/")) return await extractAudioVideo(file, apiKey);

    // Fallback: treat as text
    return await extractPlain(bytes);
  } catch (e: any) {
    return { text: "", warnings: ["Extractor error: " + (e?.message ?? String(e))] };
  }
}
