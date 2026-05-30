import {
  sanitizeHtml,
  sanitizeText,
  truncateToTokenLimit,
  validatePayloadSize,
} from '../../utils/sanitizer';

describe('Sanitizer Utilities', () => {
  describe('sanitizeHtml', () => {
    it('should strip simple HTML tags', () => {
      const input = '<p>Hello <b>world</b>!</p>';
      const expected = 'Hello world!';
      expect(sanitizeHtml(input)).toBe(expected);
    });

    it('should strip script and style tags entirely along with content', () => {
      const input = '<div>Text<script>console.log("danger");</script><style>body { color: red; }</style> More Text</div>';
      const expected = 'Text More Text';
      expect(sanitizeHtml(input)).toBe(expected);
    });

    it('should replace line-breaking tags with newlines', () => {
      const input = 'Paragraph 1<p>Paragraph 2</p>Line 1<br/>Line 2';
      const result = sanitizeHtml(input);
      expect(result).toContain('Paragraph 1');
      expect(result).toContain('Paragraph 2');
      expect(result).toContain('Line 1\nLine 2');
    });

    it('should decode HTML entities', () => {
      const input = 'Hello &amp; welcome &mdash; user &quot;Guest&#39;s&quot;';
      const expected = 'Hello & welcome — user "Guest\'s"';
      expect(sanitizeHtml(input)).toBe(expected);
    });

    it('should collapse excessive whitespace but preserve newlines', () => {
      const input = '  Hello    \t  world  \n\n\n\n  new line  ';
      const expected = 'Hello world\n\nnew line';
      expect(sanitizeHtml(input)).toBe(expected);
    });

    it('should return empty string for null/undefined/empty input', () => {
      expect(sanitizeHtml('')).toBe('');
      expect(sanitizeHtml(null as any)).toBe('');
    });
  });

  describe('sanitizeText', () => {
    it('should remove null bytes', () => {
      const input = 'Hello\0world';
      const expected = 'Helloworld';
      expect(sanitizeText(input)).toBe(expected);
    });

    it('should remove control characters except tab and newline', () => {
      const input = 'Line 1\nLine 2\t\x01\x02With Control Characters\x7F';
      const expected = 'Line 1\nLine 2\tWith Control Characters';
      expect(sanitizeText(input)).toBe(expected);
    });

    it('should normalize unicode to NFC form', () => {
      // "é" in decomposed form: "e" + combining acute accent
      const decomposed = 'e\u0301';
      // "é" in composed form
      const composed = '\u00E9';
      
      const sanitized = sanitizeText(decomposed);
      expect(sanitized).toBe(composed);
      expect(sanitized.normalize('NFC')).toBe(composed);
    });

    it('should collapse multiple spaces but preserve newlines', () => {
      const input = 'Hello    world   with  spaces';
      const expected = 'Hello world with spaces';
      expect(sanitizeText(input)).toBe(expected);
    });
  });

  describe('truncateToTokenLimit', () => {
    it('should not truncate if within limit', () => {
      const input = 'A short sentence.';
      expect(truncateToTokenLimit(input, 50)).toBe(input);
    });

    it('should truncate at a word boundary and append an ellipsis', () => {
      const input = 'The quick brown fox jumps over the lazy dog';
      // "The quick brown fox" is 19 characters. Cut at 20.
      const result = truncateToTokenLimit(input, 20);
      expect(result).toBe('The quick brown fox…');
    });

    it('should handle single long word truncation', () => {
      const input = 'Supercalifragilisticexpialidocious';
      const result = truncateToTokenLimit(input, 10);
      expect(result).toBe('Supercalif…');
    });
  });

  describe('validatePayloadSize', () => {
    it('should return true for sufficiently long text', () => {
      const input = 'a'.repeat(250);
      expect(validatePayloadSize(input, 200)).toBe(true);
    });

    it('should return false for short text', () => {
      const input = 'a'.repeat(50);
      expect(validatePayloadSize(input, 200)).toBe(false);
    });

    it('should measure trimmed length to avoid padding cheats', () => {
      const input = '   ' + 'a'.repeat(50) + '   ';
      expect(validatePayloadSize(input, 100)).toBe(false);
    });

    it('should return false for empty/null input', () => {
      expect(validatePayloadSize('')).toBe(false);
      expect(validatePayloadSize(null as any)).toBe(false);
    });
  });
});
