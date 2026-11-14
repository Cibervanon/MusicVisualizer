/**
 * Parser de importación de letras (SRT, LRC y texto plano).
 *
 * Espeja `backend/app/lyrics/parser.py` para que la vista previa del editor
 * muestre exactamente lo que el backend guardará al importar.
 */

export type LyricsImportKind = "srt" | "lrc" | "text";

export interface ParsedLyricLine {
  start: number;
  end: number;
  text: string;
}

const SRT_TIME =
  /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

const LRC_TIME = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function seconds(hours: string, minutes: string, secs: string, fraction: string): number {
  const frac = fraction ? Number(`0.${fraction}`) : 0;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(secs) + frac;
}

function normalize(lines: ParsedLyricLine[], duration: number): ParsedLyricLine[] {
  const safeDuration = Math.max(0, duration);
  const cleaned: ParsedLyricLine[] = [];
  for (const line of lines) {
    const text = (line.text ?? "").trim();
    if (!text) continue;
    const start = clamp(Number(line.start) || 0, 0, Math.max(0, safeDuration - 0.1));
    const end = clamp(
      Number(line.end) || start + 2,
      start + 0.08,
      Math.max(start + 0.08, safeDuration),
    );
    cleaned.push({
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
      text,
    });
  }
  cleaned.sort((a, b) => a.start - b.start);
  // Recorta solapamientos evidentes, igual que el backend.
  for (let i = 1; i < cleaned.length; i += 1) {
    const previous = cleaned[i - 1];
    const current = cleaned[i];
    if (current.start < previous.end - 0.02) {
      previous.end = Math.round(Math.max(previous.start + 0.1, current.start - 0.02) * 1000) / 1000;
    }
  }
  return cleaned;
}

export function parseSrt(content: string, duration: number): ParsedLyricLine[] {
  const blocks = content.replace(/\r\n/g, "\n").trim().split(/\n\s*\n/);
  const lines: ParsedLyricLine[] = [];
  for (const block of blocks) {
    const match = SRT_TIME.exec(block);
    if (!match) continue;
    const start = seconds(match[1], match[2], match[3], match[4]);
    const end = seconds(match[5], match[6], match[7], match[8]);
    const text = block
      .slice(match.index + match[0].length)
      .replace(/<[^>]+>/g, "")
      .replace(/\s*\n\s*/g, " ")
      .trim();
    if (text) {
      lines.push({ start, end: Math.max(start + 0.1, end), text });
    }
  }
  return normalize(lines, duration);
}

export function parseLrc(content: string, duration: number): ParsedLyricLine[] {
  const entries: Array<{ start: number; text: string }> = [];
  for (const raw of content.replace(/\r\n/g, "\n").split(/\r?\n/)) {
    const matches = [...raw.matchAll(LRC_TIME)];
    if (!matches.length) continue;
    const text = raw.replace(LRC_TIME, "").trim();
    if (!text) continue;
    for (const match of matches) {
      const minutes = Number(match[1]);
      const secs = Number(match[2]);
      const frac = match[3] ? Number(`0.${match[3]}`) : 0;
      entries.push({ start: minutes * 60 + secs + frac, text });
    }
  }
  entries.sort((a, b) => a.start - b.start);
  const lines: ParsedLyricLine[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const next = entries[index + 1];
    const end = next ? next.start : Math.min(duration, entry.start + 4);
    lines.push({ start: entry.start, end: Math.max(entry.start + 0.15, end), text: entry.text });
  }
  return normalize(lines, duration);
}

export function splitTextIntoLines(text: string, maxChars = 42): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const result: string[] = [];
  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.length <= maxChars) {
      result.push(line);
      continue;
    }
    for (const sentence of line.split(/(?<=[.!?;])\s+/)) {
      let current = "";
      for (const word of sentence.split(/\s+/).filter(Boolean)) {
        const candidate = `${current} ${word}`.trim();
        if (candidate.length > maxChars && current) {
          result.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) result.push(current);
    }
  }
  return result;
}

export function parsePlainText(content: string, duration: number): ParsedLyricLine[] {
  const texts = splitTextIntoLines(content);
  if (!texts.length) return [];
  const slot = duration / texts.length;
  const lines = texts.map((text, index) => ({
    start: index * slot,
    end: index === texts.length - 1 ? duration : (index + 1) * slot,
    text,
  }));
  return normalize(lines, duration);
}

export function parseLyricsImport(
  content: string,
  kind: LyricsImportKind,
  duration: number,
): ParsedLyricLine[] {
  if (kind === "srt") return parseSrt(content, duration);
  if (kind === "lrc") return parseLrc(content, duration);
  return parsePlainText(content, duration);
}
