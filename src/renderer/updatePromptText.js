const UPDATE_PROMPT_DEFAULT_NOTES = 'desktop-cat 有新版本可用。';

function decodeHtmlEntities(value) {
  return String(value).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    const namedEntities = {
      amp: '&',
      apos: "'",
      gt: '>',
      lt: '<',
      nbsp: ' ',
      quot: '"'
    };
    return namedEntities[entity] || match;
  });
}

function htmlToPlainText(value) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(?:h[1-6]|p|div|section|article|ul|ol|li|br)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatUpdatePromptNotes(notes) {
  return htmlToPlainText(notes) || UPDATE_PROMPT_DEFAULT_NOTES;
}

const updatePromptText = {
  UPDATE_PROMPT_DEFAULT_NOTES,
  decodeHtmlEntities,
  formatUpdatePromptNotes,
  htmlToPlainText
};

if (typeof window !== 'undefined') {
  window.updatePromptText = updatePromptText;
}

if (typeof module !== 'undefined') {
  module.exports = updatePromptText;
}
