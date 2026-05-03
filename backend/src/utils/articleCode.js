const ALLOWED_PREFIXES = ['CI', 'CV', 'DI', 'DV', 'FC', 'FD', 'PL'];
const ARTICLE_CODE_REGEX = /^(CI|CV|DI|DV|FC|FD|PL)[A-Z0-9-]+$/;

function normalizeArticleCode(value) {
  return `${value || ''}`.trim().toUpperCase();
}

function isValidArticleCode(value) {
  const normalized = normalizeArticleCode(value);
  return ARTICLE_CODE_REGEX.test(normalized);
}

module.exports = {
  ALLOWED_PREFIXES,
  normalizeArticleCode,
  isValidArticleCode,
};
