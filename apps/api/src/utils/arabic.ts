/*
 * Minimal Arabic shaping for PDF output.
 *
 * pdfkit draws glyphs left-to-right and does not reorder right-to-left
 * text, so Arabic words are converted to their joined "presentation
 * forms" and then reversed into visual order. Latin text, digits and
 * punctuation outside Arabic words are left exactly as they are.
 */

// [isolated, final, initial, medial]; 0 = form does not exist
const FORMS: Record<number, [number, number, number, number]> = {
  0x0621: [0xfe80, 0, 0, 0],
  0x0622: [0xfe81, 0xfe82, 0, 0],
  0x0623: [0xfe83, 0xfe84, 0, 0],
  0x0624: [0xfe85, 0xfe86, 0, 0],
  0x0625: [0xfe87, 0xfe88, 0, 0],
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c],
  0x0627: [0xfe8d, 0xfe8e, 0, 0],
  0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92],
  0x0629: [0xfe93, 0xfe94, 0, 0],
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98],
  0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c],
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4],
  0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8],
  0x062f: [0xfea9, 0xfeaa, 0, 0],
  0x0630: [0xfeab, 0xfeac, 0, 0],
  0x0631: [0xfead, 0xfeae, 0, 0],
  0x0632: [0xfeaf, 0xfeb0, 0, 0],
  0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4],
  0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc],
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0],
  0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4],
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8],
  0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc],
  0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0],
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4],
  0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8],
  0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc],
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0],
  0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4],
  0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec],
  0x0648: [0xfeed, 0xfeee, 0, 0],
  0x0649: [0xfeef, 0xfef0, 0, 0],
  0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4]
};

// lam + alef variants: [isolated, final]
const LAM_ALEF: Record<number, [number, number]> = {
  0x0622: [0xfef5, 0xfef6],
  0x0623: [0xfef7, 0xfef8],
  0x0625: [0xfef9, 0xfefa],
  0x0627: [0xfefb, 0xfefc]
};

const LAM = 0x0644;

function isMark(c: number) {
  return (c >= 0x064b && c <= 0x065f) || c === 0x0670;
}

function isArabicLetter(c: number) {
  return FORMS[c] !== undefined;
}

function canJoinNext(c: number) {
  const f = FORMS[c];
  return !!f && f[2] !== 0; // has an initial form => joins to the left
}

function hasArabic(s: string) {
  return /[؀-ۿ]/.test(s);
}

interface Cluster {
  base: number;
  marks: number[];
}

function shapeWord(word: string): string {
  const cps = Array.from(word).map((ch) => ch.codePointAt(0) as number);

  // group each base character with its following marks
  const clusters: Cluster[] = [];
  for (const cp of cps) {
    if (isMark(cp) && clusters.length) {
      clusters[clusters.length - 1].marks.push(cp);
    } else {
      clusters.push({ base: cp, marks: [] });
    }
  }

  const out: Cluster[] = [];
  let prevJoins = false; // previous output letter connects to the next one

  for (let i = 0; i < clusters.length; i++) {
    const cl = clusters[i];
    const c = cl.base;
    const next = clusters[i + 1];

    if (!isArabicLetter(c)) {
      out.push(cl);
      prevJoins = false;
      continue;
    }

    // lam + alef ligature
    if (c === LAM && next && LAM_ALEF[next.base] && cl.marks.length === 0) {
      const lig = LAM_ALEF[next.base];
      out.push({
        base: prevJoins ? lig[1] : lig[0],
        marks: next.marks
      });
      prevJoins = false;
      i++;
      continue;
    }

    const f = FORMS[c];
    const nextJoins = !!next && isArabicLetter(next.base) && canJoinNext(c);

    let glyph: number;
    if (prevJoins && nextJoins) glyph = f[3] || f[1] || f[0];
    else if (prevJoins) glyph = f[1] || f[0];
    else if (nextJoins) glyph = f[2] || f[0];
    else glyph = f[0];

    out.push({ base: glyph, marks: cl.marks });
    prevJoins = canJoinNext(c) && nextJoins ? true : false;
  }

  // reverse into visual order, keeping marks after their base letter
  return out
    .reverse()
    .map((cl) => String.fromCodePoint(cl.base, ...cl.marks))
    .join("");
}

export function shapeArabic(text: string): string {
  if (!text || !hasArabic(text)) return text;

  // split into words, keeping the whitespace
  const parts = text.split(/(\s+)/);
  const result: string[] = [];

  let i = 0;
  while (i < parts.length) {
    if (hasArabic(parts[i])) {
      // gather a run of Arabic words (and the spaces between them)
      let j = i;
      let last = i;
      while (j < parts.length) {
        if (hasArabic(parts[j])) {
          last = j;
          j++;
        } else if (/^\s+$/.test(parts[j])) {
          j++;
        } else {
          break;
        }
      }
      const run = parts.slice(i, last + 1).map((p) =>
        hasArabic(p) ? shapeWord(p) : p
      );
      result.push(run.reverse().join(""));
      i = last + 1;
    } else {
      result.push(parts[i]);
      i++;
    }
  }

  return result.join("");
}
