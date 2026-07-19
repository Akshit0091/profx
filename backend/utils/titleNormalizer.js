// ── Title normalization ───────────────────────────────────────────────
// Rewrites series titles into a canonical order per publisher:
//     MTG      -> "Olympiad <SeriesType> <Subject>"
//     Educart  -> "[CBSE] <SeriesType> <Subject> [qualifier]"
//     Golden   -> "<SeriesType> <Subject> [qualifier]"
//
// Only fires when the publisher has a rule set AND the title matches one of
// that publisher's series types. Everything else passes through UNCHANGED.
//
// Subject qualifiers (Basic / Standard / A / B / Core / Lit / Curiosity ...)
// are PRESERVED, because they distinguish genuinely different books.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, phrase) =>
  new RegExp('\\b' + escapeRe(phrase) + '\\b', 'i').test(text);

// ── Shared subject vocabulary ────────────────────────────────────────
const SUBJECT_ALIASES = {
  'social-studies': 'Social Science',
  'social studies': 'Social Science',
  'social science': 'Social Science',
  'general knowledge': 'GK',
  'computer science': 'Computer',
  'political science': 'Political Science',
  'home science': 'Home Science',
  'mathematics': 'Mathematics',
  'mathamtics': 'Mathematics',
  'mathmatics': 'Mathematics',
  'maths': 'Mathematics',
  'math': 'Mathematics',
  'ganit': 'Mathematics',
  'science': 'Science',
  'english': 'English',
  'hindi': 'Hindi',
  'sanskrit': 'Sanskrit',
  'reasoning': 'Reasoning',
  'biology': 'Biology',
  'physics': 'Physics',
  'chemistry': 'Chemistry',
  'sociology': 'Sociology',
  'history': 'History',
  'geography': 'Geography',
  'gk': 'GK',
  'computer': 'Computer',
  'cyber': 'Computer',
  'evs': 'EVS',
};

// Qualifiers that distinguish different books of the same subject.
// Order matters: longest / most specific first.
const QUALIFIERS = [
  { match: 'basic', out: 'Basic' },
  { match: 'standard', out: 'Standard' },
  { match: 'std', out: 'Standard' },
  { match: 'core', out: 'Core' },
  { match: 'literature', out: 'Literature' },
  { match: 'lit', out: 'Literature' },
  { match: 'communicative', out: 'Communicative' },
  { match: 'curiosity', out: 'Curiosity' },
  { match: 'aadhar', out: 'Aadhar' },
  { match: 'part-1', out: 'Part-1' },
  { match: 'part 1', out: 'Part-1' },
  { match: 'part-2', out: 'Part-2' },
  { match: 'part 2', out: 'Part-2' },
];

// "Hindi A" / "Hindi B" style single-letter course codes.
function courseLetter(text) {
  const m = text.match(/\b(?:hindi|english)\s+([ab])\b/i);
  return m ? m[1].toUpperCase() : '';
}

function findSubject(text) {
  const keys = Object.keys(SUBJECT_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) if (hasWord(text, k)) return SUBJECT_ALIASES[k];
  return '';
}

function findQualifier(text, allowed) {
  for (const q of QUALIFIERS) {
    if (allowed && !allowed.includes(q.out)) continue;
    if (hasWord(text, q.match)) return q.out;
  }
  return '';
}

// ── Publisher rule sets ──────────────────────────────────────────────
// prefixes: publisher-name prefixes this rule set applies to
// series:   canonical series name + the variants that map to it
const PUBLISHER_RULES = [
  {
    name: 'MTG',
    prefixes: ['mtg', 'mth'],
    olympiad: true, // prepend "Olympiad", treat any series as an Olympiad book
    keepCbse: false,
    keepQualifier: false,
    series: [
      { canonical: 'PrepGuide', variants: ['prep-guide', 'prep guide', 'prepguide', 'preparation guide'] },
      { canonical: 'Workbook',  variants: ['work book', 'work-book', 'workbook'] },
      { canonical: 'PYQs',      variants: ['pyqs', 'pyq', 'previous year', 'previou year', 'prev year'] },
    ],
  },
  {
    name: 'Educart',
    prefixes: ['educart'],
    olympiad: false,
    keepCbse: true,
    keepQualifier: true,
    series: [
      { canonical: 'Question Bank', variants: ['question bank', 'questionbank', 'qb'] },
      { canonical: 'One Shot',      variants: ['one-shot', 'one shot', 'oneshot'] },
    ],
  },
  {
    name: 'Golden',
    prefixes: ['golden', 'goldeb'],
    olympiad: false,
    keepCbse: false,
    keepQualifier: true,
    series: [
      // Guides are Textbooks for Golden — both map to "Textbook".
      { canonical: 'Textbook', variants: ['textbook', 'text book', 'guide'] },
      { canonical: 'Workbook', variants: ['workbook', 'work book', 'work-book'] },
    ],
  },
  {
    name: 'Arihant',
    prefixes: ['arihant', 'arhant'],
    olympiad: false,
    keepCbse: false,
    keepQualifier: true,
    keepLeftover: true, // preserve descriptors like "Sharda", "Lit and Lang"
    // Only these count as qualifiers for Arihant; other words stay as leftover
    // text so titles like "English Lit and Lang" aren't rewritten.
    qualifiers: ['Core', 'Communicative'],
    series: [
      // Longest variants first so "ncert solutions" beats "ncert solution".
      { canonical: 'NCERT Solutions', variants: ['ncert solutions', 'ncert solution', 'ncert sol'] },
      { canonical: 'NCERT Exemplar', variants: ['ncert exemplar'] },
      { canonical: 'Lab Manual',     variants: ['lab manual'] },
      { canonical: 'All in One',     variants: ['all in one', 'all-in-one', 'allinone'] },
    ],
  },
];

// Words removed when collecting leftover descriptors — filler that adds nothing.
const LEFTOVER_STOPWORDS = [
  'the', 'of', 'for', 'with', 'in', 'ncert', 'cbse', 'class',
  'book', 'books', 'edition', 'medium',
];

// Competitive-exam markers — never rewrite these (e.g. "NEET PYQ 39 years biology").
const NON_OLYMPIAD_EXAMS = ['neet', 'jee', 'aiims', 'ntse', 'kvpy', 'cuet', 'net', 'gate'];

// Olympiad exam codes -> subject (MTG only).
const EXAM_CODES = {
  imo: 'Mathematics', ieo: 'English', iso: 'Science', nso: 'Science',
  igko: 'GK', icso: 'Computer', isso: 'Social Science', nco: 'Computer',
};

// Collect descriptor words left over after stripping series / subject / qualifier.
// e.g. "All in One Sanskrit (Sharda)" -> "Sharda"
function leftoverWords(cleaned, matchedVariant, subject, qualifier, courseLtr) {
  // Preserve part ranges like "Part 1 & 2" / "(Part 1 and 2)" as a single token.
  let partRange = '';
  const pr = cleaned.match(/part\s*\d+\s*(?:&|and|-|to)\s*\d+/i);
  if (pr) partRange = pr[0].replace(/\s+/g, ' ').replace(/\band\b/i, '&').trim();

  let rest = cleaned;
  if (partRange) rest = rest.replace(new RegExp(escapeRe(pr[0]), 'i'), ' ');
  const strip = (text, phrase) => {
    if (!phrase) return text;
    return text.replace(new RegExp(escapeRe(phrase), 'ig'), ' ');
  };
  rest = strip(rest, matchedVariant);
  if (subject) {
    // Strip every alias that maps to this subject (e.g. "maths" for Mathematics).
    for (const [alias, canon] of Object.entries(SUBJECT_ALIASES)) {
      if (canon === subject) rest = strip(rest, alias);
    }
    rest = strip(rest, subject);
  }
  if (qualifier) {
    for (const q of QUALIFIERS) if (q.out === qualifier) rest = strip(rest, q.match);
    rest = strip(rest, qualifier);
  }
  // Remove bracket punctuation and stray symbols, keep words.
  rest = rest.replace(/[()\[\]{}|,&:;.\-–—?]/g, ' ');
  const words = rest.split(/\s+/).filter(Boolean).filter((w) => {
    const lw = w.toLowerCase();
    if (LEFTOVER_STOPWORDS.includes(lw)) return false;
    if (courseLtr && lw === courseLtr.toLowerCase()) return false;
    if (/^\d+$/.test(lw)) return false;           // bare numbers
    if (/^\d+(st|nd|rd|th)$/.test(lw)) return false; // 1st, 2nd...
    return true;
  });
  // De-duplicate while preserving order.
  const seen = new Set();
  const kept = words.filter((w) => {
    const lw = w.toLowerCase();
    if (seen.has(lw)) return false;
    seen.add(lw);
    return true;
  });
  if (partRange) kept.push('(' + partRange + ')');
  return kept.join(' ');
}

function rulesFor(publisher) {
  const pub = String(publisher || '').trim().toLowerCase();
  if (!pub) return null;
  return PUBLISHER_RULES.find((r) => r.prefixes.some((p) => pub.startsWith(p))) || null;
}

// Returns { normalized, seriesType }.
// normalized === original when nothing matched.
function normalizeTitle(rawTitle, publisher) {
  const original = String(rawTitle || '').trim();
  if (!original) return { normalized: '', seriesType: '' };

  const rules = rulesFor(publisher);
  if (!rules) return { normalized: original, seriesType: '' };

  const cleaned = original.replace(/^[|\s-]+/, '').trim();
  const lower = cleaned.toLowerCase();

  // Competitive-exam book -> never rewrite.
  if (NON_OLYMPIAD_EXAMS.some((e) => hasWord(cleaned, e))) {
    return { normalized: original, seriesType: '' };
  }

  // 1. Series type (longest matching variant wins).
  let seriesType = '';
  let matchedVariant = '';
  for (const st of rules.series) {
    for (const v of st.variants) {
      if (lower.includes(v) && v.length > matchedVariant.length) {
        seriesType = st.canonical;
        matchedVariant = v;
      }
    }
  }
  if (!seriesType) return { normalized: original, seriesType: '' };

  // 2. Subject — for MTG, fall back to the Olympiad exam code.
  let subject = findSubject(cleaned);
  if (!subject && rules.olympiad) {
    for (const [code, subj] of Object.entries(EXAM_CODES)) {
      if (hasWord(cleaned, code)) { subject = subj; break; }
    }
  }

  // 3. Build canonical title.
  const parts = [];
  if (rules.keepCbse && hasWord(cleaned, 'cbse')) parts.push('CBSE');
  if (rules.olympiad) parts.push('Olympiad');
  parts.push(seriesType);
  if (subject) parts.push(subject);

  let letter = '';
  let qual = '';
  if (rules.keepQualifier) {
    letter = courseLetter(cleaned);
    if (letter) parts.push(letter);
    qual = findQualifier(cleaned, rules.qualifiers);
    if (qual) parts.push(qual);
  }

  if (rules.keepLeftover) {
    const extra = leftoverWords(cleaned, matchedVariant, subject, qual, letter);
    if (extra) parts.push(extra);
  }

  return { normalized: parts.join(' ').replace(/\s+/g, ' ').trim(), seriesType };
}

// Series type used for sheet sorting; '' sorts last within a publisher.
function seriesTypeOf(title, publisher) {
  const rules = rulesFor(publisher);
  const lower = String(title || '').toLowerCase();
  const list = rules ? rules.series : PUBLISHER_RULES.flatMap((r) => r.series);
  for (const st of list) {
    for (const v of st.variants) if (lower.includes(v)) return st.canonical;
  }
  return '';
}

module.exports = {
  normalizeTitle, seriesTypeOf,
  PUBLISHER_RULES, SUBJECT_ALIASES, QUALIFIERS, EXAM_CODES, NON_OLYMPIAD_EXAMS,
};
