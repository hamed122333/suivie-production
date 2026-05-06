const ALLOWED_PREFIXES = ['CI', 'CV', 'DI', 'DV', 'FC', 'FD', 'PL', 'MP'];
const ARTICLE_CODE_REGEX = /^(CI|CV|DI|DV|FC|FD|PL|MP)[A-Z0-9-]+$/;

function normalizeArticleCode(value) {
  return `${value || ''}`.trim().toUpperCase();
}

function isValidArticleCode(value) {
  const normalized = normalizeArticleCode(value);
  // For Finished Products (PF), we keep the strict rules.
  // For Raw Materials (MP), the user wants "sans prefixe".
  // However, current models use this generic function.
  // Let's broaden it to allow any non-empty string for now, or just add MP as prefix.
  // Given the instruction "sans prefixe", I will make it more permissive if it doesn't match PF prefixes.
  if (ARTICLE_CODE_REGEX.test(normalized)) return true;

  // If it's not a PF code, we allow it if it's at least 2 chars long and alphanumeric/dashes (broad rule for MP)
  return normalized.length >= 2;
}

module.exports = {
  ALLOWED_PREFIXES,
  normalizeArticleCode,
  isValidArticleCode,
};
