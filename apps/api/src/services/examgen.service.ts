import zlib from "zlib";

export type GenQuestion = {
  text: string;
  type: "MCQ" | "TRUE_FALSE";
  explanation?: string;
  options: { text: string; isCorrect: boolean }[];
};

/* ------------------------------------------------------------------
   Reading notes from uploaded files (.txt, .md, .csv, .docx)
------------------------------------------------------------------ */
function readZipEntry(buf: Buffer, wanted: string): Buffer | null {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const ln = buf.readUInt16LE(localOff + 26);
      const le = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + ln + le;
      const data = buf.subarray(start, start + compSize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

export function docxToText(buf: Buffer): string {
  const xml = readZipEntry(buf, "word/document.xml");
  if (!xml) return "";
  return xml
    .toString("utf8")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function fileToText(name: string, mime: string | null | undefined, data: Buffer): string | null {
  const n = (name || "").toLowerCase();
  try {
    if (/\.(txt|md|csv)$/.test(n) || (mime || "").startsWith("text/")) return data.toString("utf8");
    if (n.endsWith(".docx")) return docxToText(data);
  } catch {
    return null;
  }
  return null;
}

/* ------------------------------------------------------------------
   Built-in generator (no external service): turns sentences from the
   notes into fill-in-the-blank and true/false questions.
------------------------------------------------------------------ */
const STOP = new Set(
  ("about above after again against all also and any are because been before being below between both but can could did does doing down during each " +
    "few for from further had has have having her here hers him his how into its itself just more mostname not now off once only other our ours out over own " +
    "same she should some such than that the their theirs them then there these they this those through too under until upon very was were what when where " +
    "which while who whom why will with would you your yours said says may might must shall one two three first second").split(" ")
);

function clean(w: string) {
  return w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}
function shape(w: string) {
  if (/^\d+$/.test(w)) return "num";
  if (/[؀-ۿ]/.test(w)) return "ar";
  return /^\p{Lu}/u.test(w) ? "cap" : "low";
}
function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function splitSentences(text: string): string[] {
  const seen = new Set<string>();
  return text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.replace(/\s+/g, " ").trim().split(/(?<=[.!?؟۔])\s+/))
    .map((s) => s.trim())
    .filter((s) => {
      const n = s.split(" ").length;
      if (n < 6 || n > 40 || seen.has(s)) return false;
      seen.add(s);
      return true;
    });
}

export function generateBuiltIn(text: string, count: number, kind: "MCQ" | "TRUE_FALSE" | "MIXED"): GenQuestion[] {
  const sentences = shuffle(splitSentences(text));
  const pool = new Map<string, string>(); // lower -> original
  for (const s of sentences) {
    for (const raw of s.split(" ")) {
      const w = clean(raw);
      if (w.length >= 4 && !STOP.has(w.toLowerCase())) pool.set(w.toLowerCase(), w);
    }
  }
  const all = [...pool.values()];
  const out: GenQuestion[] = [];

  for (const s of sentences) {
    if (out.length >= count) break;
    const words = s.split(" ");
    const cands = words
      .map((raw, i) => ({ i, w: clean(raw) }))
      .filter((c) => c.i > 0 && c.w.length >= 4 && !STOP.has(c.w.toLowerCase()));
    if (!cands.length) continue;
    const pref = cands.filter((c) => shape(c.w) === "cap" || shape(c.w) === "num" || shape(c.w) === "ar");
    const pick = (pref.length ? pref : cands.sort((a, b) => b.w.length - a.w.length).slice(0, 3))[
      Math.floor(Math.random() * (pref.length ? pref.length : Math.min(3, cands.length)))
    ];
    const answer = pick.w;
    const sh = shape(answer);
    const distract = shuffle(all.filter((w) => w.toLowerCase() !== answer.toLowerCase() && shape(w) === sh)).slice(0, 3);
    const swap = (rep: string) => words.map((w, i) => (i === pick.i ? w.replace(answer, rep) : w)).join(" ");

    const wantTF = kind === "TRUE_FALSE" || (kind === "MIXED" && out.length % 2 === 1);
    if (wantTF) {
      if (!distract.length) continue;
      const makeTrue = Math.random() < 0.5;
      out.push({
        text: "True or False: " + (makeTrue ? s : swap(distract[0])),
        type: "TRUE_FALSE",
        explanation: makeTrue ? undefined : `The correct word is "${answer}".`,
        options: [
          { text: "True", isCorrect: makeTrue },
          { text: "False", isCorrect: !makeTrue }
        ]
      });
    } else {
      if (distract.length < 3) continue;
      const opts = shuffle([answer, ...distract]).map((t) => ({ text: t, isCorrect: t === answer }));
      out.push({ text: "Fill in the blank: " + swap("_____"), type: "MCQ", options: opts });
    }
  }
  return out;
}

/* ------------------------------------------------------------------
   Optional AI generator (used when ANTHROPIC_API_KEY is set in Render)
------------------------------------------------------------------ */
export async function generateWithAI(text: string, count: number, kind: "MCQ" | "TRUE_FALSE" | "MIXED"): Promise<GenQuestion[] | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const kindText =
    kind === "MCQ" ? "all multiple-choice (exactly 4 options)" :
    kind === "TRUE_FALSE" ? "all True/False" :
    "a mix of multiple-choice (exactly 4 options) and True/False";
  const prompt =
    `Write ${count} exam questions (${kindText}) based ONLY on the study notes below, in the same language as the notes. ` +
    `Each MCQ has exactly one correct option; True/False questions have options "True" and "False". Add a one-sentence explanation. ` +
    `Reply with ONLY a JSON array, no other text, in this shape: ` +
    `[{"type":"MCQ","text":"...","options":[{"text":"...","isCorrect":true},{"text":"...","isCorrect":false}],"explanation":"..."}]\n\nNOTES:\n${text.slice(0, 24000)}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.EXAM_AI_MODEL || "claude-sonnet-5-5",
        max_tokens: 6000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!r.ok) return null;
    const data: any = await r.json();
    const raw: string = (data.content || []).map((c: any) => c.text || "").join("");
    const a = raw.indexOf("["), b = raw.lastIndexOf("]");
    if (a < 0 || b < a) return null;
    const arr = JSON.parse(raw.slice(a, b + 1));
    const good: GenQuestion[] = [];
    for (const q of arr) {
      const type = q.type === "TRUE_FALSE" ? "TRUE_FALSE" : "MCQ";
      const options = Array.isArray(q.options)
        ? q.options.map((o: any) => ({ text: String(o.text || "").trim(), isCorrect: Boolean(o.isCorrect) })).filter((o: any) => o.text)
        : [];
      if (!q.text || options.length < 2 || options.filter((o: any) => o.isCorrect).length !== 1) continue;
      good.push({ text: String(q.text).trim(), type, explanation: q.explanation ? String(q.explanation) : undefined, options });
    }
    return good.length ? good.slice(0, count) : null;
  } catch {
    return null;
  }
}
