export const ALLOWED_ARTICLE_PREFIXES = ['CI', 'CV', 'DI', 'DV', 'PL'];
const ARTICLE_CODE_REGEX = /^(CI|CV|DI|DV|PL)[A-Z0-9-]+$/;

export function normalizeArticleCode(value) {
  return `${value || ''}`.trim().toUpperCase();
}

export function isValidArticleCode(value) {
  return ARTICLE_CODE_REGEX.test(normalizeArticleCode(value));
}
