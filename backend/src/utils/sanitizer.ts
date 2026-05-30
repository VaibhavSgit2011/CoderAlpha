/**
 * @file sanitizer.ts
 * @description Text sanitization utilities for the AlphaStream AI backend.
 *
 * Provides defensive text processing functions that clean, normalise, and
 * validate content before it enters the AI pipeline.  These utilities
 * prevent injection attacks (HTML/script tags), ensure consistent encoding,
 * and enforce size constraints required by downstream embedding / LLM APIs.
 *
 * All functions are pure (no side-effects) and safe to call from any context.
 *
 * Usage:
 *   import { sanitizeHtml, sanitizeText, truncateToTokenLimit, validatePayloadSize } from '../utils/sanitizer';
 *   const clean = sanitizeHtml(rawScrapedContent);
 *   const ready = truncateToTokenLimit(sanitizeText(clean), 8000);
 */

// ---------------------------------------------------------------------------
// HTML entity decode map
// ---------------------------------------------------------------------------

/**
 * Common named HTML entities mapped to their Unicode character equivalents.
 * This covers the most frequently encountered entities in web-scraped content.
 * Numeric entities (&#NNN; / &#xHHHH;) are handled separately via regex.
 */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&ldquo;': '\u201C',
  '&rdquo;': '\u201D',
  '&bull;': '•',
  '&hellip;': '…',
  '&trade;': '™',
  '&copy;': '©',
  '&reg;': '®',
  '&deg;': '°',
  '&plusmn;': '±',
  '&times;': '×',
  '&divide;': '÷',
  '&euro;': '€',
  '&pound;': '£',
  '&yen;': '¥',
  '&cent;': '¢',
  '&frac12;': '½',
  '&frac14;': '¼',
  '&frac34;': '¾',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Decodes both named and numeric HTML entities in a string.
 *
 * Processing order:
 *   1. Named entities (e.g. &amp; → &)
 *   2. Decimal numeric entities (e.g. &#169; → ©)
 *   3. Hexadecimal numeric entities (e.g. &#xA9; → ©)
 *
 * @param text - String potentially containing HTML entities.
 * @returns The decoded string.
 */
const decodeHtmlEntities = (text: string): string => {
  let decoded = text;

  // 1. Replace known named entities.
  for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
    // Use a global, case-insensitive regex so we catch &AMP; etc.
    decoded = decoded.replace(new RegExp(escapeRegex(entity), 'gi'), replacement);
  }

  // 2. Decimal numeric entities: &#123;
  decoded = decoded.replace(/&#(\d+);/g, (_match, dec: string) => {
    const codePoint = parseInt(dec, 10);
    // Guard against invalid / unprintable code points.
    return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : '';
  });

  // 3. Hexadecimal numeric entities: &#x1F600;
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => {
    const codePoint = parseInt(hex, 16);
    return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : '';
  });

  return decoded;
};

/**
 * Escapes special regex characters in a string so it can be used as a
 * literal pattern inside `new RegExp(...)`.
 */
const escapeRegex = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Returns `true` if the given Unicode code point is valid and printable.
 * Rejects surrogates (0xD800–0xDFFF) and values above the Unicode max.
 */
const isValidCodePoint = (cp: number): boolean =>
  cp >= 0 && cp <= 0x10FFFF && !(cp >= 0xD800 && cp <= 0xDFFF);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Strips **all** HTML tags from a raw HTML string, decodes HTML entities,
 * and collapses excessive whitespace into single spaces.
 *
 * This is intentionally aggressive — it produces plain text suitable for
 * embedding / LLM consumption, NOT for safe rendering in a browser.
 *
 * @param rawHtml - Raw HTML string (e.g. scraped web page content).
 * @returns Plain text with no HTML markup.
 *
 * @example
 * ```ts
 * sanitizeHtml('<p>Hello &amp; <b>world</b></p>');
 * // => 'Hello & world'
 * ```
 */
export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml || rawHtml.length === 0) {
    return '';
  }

  let text = rawHtml;

  // 1. Remove <script> and <style> blocks entirely (including their content).
  //    These are never useful as plain text and may contain executable code.
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');

  // 2. Replace <br>, <br/>, <br />, </p>, </div>, </li> with newlines so
  //    paragraph structure is loosely preserved.
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote)>/gi, '\n');

  // 3. Strip all remaining HTML tags.
  text = text.replace(/<[^>]*>/g, '');

  // 4. Decode HTML entities (named + numeric).
  text = decodeHtmlEntities(text);

  // 5. Collapse runs of whitespace (spaces, tabs) into a single space,
  //    but preserve intentional line breaks (max 2 consecutive newlines).
  text = text.replace(/[ \t]+/g, ' ');             // horizontal whitespace → single space
  text = text.replace(/\n{3,}/g, '\n\n');           // 3+ newlines → 2
  text = text.replace(/[ \t]*\n[ \t]*/g, '\n');     // trim whitespace around newlines

  // 6. Final trim.
  return text.trim();
}

/**
 * Sanitises arbitrary text by removing null bytes, control characters,
 * and normalising Unicode to NFC form.
 *
 * This is the go-to function for cleaning user-supplied or LLM-generated
 * text that shouldn't contain formatting but may have encoding artefacts.
 *
 * @param text - Raw text string.
 * @returns Cleaned, NFC-normalised text.
 *
 * @example
 * ```ts
 * sanitizeText('Hello\x00 World\x01');
 * // => 'Hello World'
 * ```
 */
export function sanitizeText(text: string): string {
  if (!text || text.length === 0) {
    return '';
  }

  let cleaned = text;

  // 1. Remove null bytes — these can cause truncation in C-backed string
  //    libraries and are never valid in user-facing text.
  cleaned = cleaned.replace(/\0/g, '');

  // 2. Remove ASCII control characters (0x01–0x08, 0x0E–0x1F, 0x7F)
  //    but KEEP common whitespace: tab (0x09), newline (0x0A),
  //    carriage return (0x0D).
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x01-\x08\x0E-\x1F\x7F]/g, '');

  // 3. Remove Unicode "Other" control characters (C0/C1 supplement) that
  //    occasionally appear in scraped content.  We keep zero-width joiners
  //    (U+200D) as they are valid in emoji sequences.
  // eslint-disable-next-line no-control-regex
  cleaned = cleaned.replace(/[\x80-\x9F]/g, '');

  // 4. Remove directional formatting characters that can cause display
  //    anomalies (BiDi override, embedding marks, etc.).
  cleaned = cleaned.replace(/[\u200B\u200E\u200F\u202A-\u202E\u2060\uFEFF]/g, '');

  // 5. Normalise to NFC (canonical decomposition + composition).
  //    This ensures that e.g. "é" (U+00E9) and "é" (U+0065 U+0301)
  //    are represented identically.
  cleaned = cleaned.normalize('NFC');

  // 6. Collapse multiple spaces into one (preserving newlines).
  cleaned = cleaned.replace(/ {2,}/g, ' ');

  // 7. Trim leading/trailing whitespace.
  return cleaned.trim();
}

/**
 * Truncates text to an approximate token limit while preserving word boundaries.
 *
 * LLM tokenisers typically produce ~1 token per 4 characters of English text.
 * Rather than importing a full tokeniser, we use character count as a fast
 * heuristic and cut on word boundaries to avoid splitting mid-word.
 *
 * @param text     - The text to truncate.
 * @param maxChars - Maximum number of characters to keep. Defaults to 4000
 *                   (~1000 tokens with the ≈4 chars/token heuristic).
 * @returns The truncated text, with a trailing ellipsis if truncation occurred.
 *
 * @example
 * ```ts
 * const short = truncateToTokenLimit(longArticle, 8000);
 * ```
 */
export function truncateToTokenLimit(
  text: string,
  maxChars: number = 4000,
): string {
  // Guard: empty or already within budget.
  if (!text || text.length <= maxChars) {
    return text ?? '';
  }

  // Slice to maxChars, then backtrack to the last word boundary.
  const sliced = text.slice(0, maxChars);

  // Find the last whitespace character within the sliced region.
  const lastSpace = sliced.lastIndexOf(' ');

  // If we found a space, cut there; otherwise use the full slice
  // (handles the edge case of a single very long "word").
  const truncated = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;

  // Append ellipsis to signal that content was cut.
  return truncated.trimEnd() + '…';
}

/**
 * Validates that a text payload meets the minimum character threshold.
 *
 * This acts as a lightweight quality gate: content below the minimum is
 * likely too thin to produce useful embeddings or summaries and should
 * be filtered out early in the pipeline.
 *
 * The default of 200 characters aligns with the architecture doc's
 * recommended minimum payload size for the ingestion pipeline.
 *
 * @param text     - The text to validate.
 * @param minChars - Minimum number of characters required. Defaults to 200.
 * @returns `true` if the text meets or exceeds the minimum length.
 *
 * @example
 * ```ts
 * if (!validatePayloadSize(articleBody)) {
 *   logger.warn('Article too short — skipping embedding');
 * }
 * ```
 */
export function validatePayloadSize(
  text: string,
  minChars: number = 200,
): boolean {
  if (!text) {
    return false;
  }

  // We measure the trimmed length so leading/trailing whitespace
  // doesn't inflate the count.
  return text.trim().length >= minChars;
}
