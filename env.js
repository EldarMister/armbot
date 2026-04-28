function stripWrappingQuotes(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).trim();
  }
  return text;
}

function getEnv(name) {
  return stripWrappingQuotes(process.env[name]);
}

function getMultilineEnv(name) {
  return getEnv(name).replace(/\\n/g, '\n');
}

function normalizeContainerKey(value) {
  return stripWrappingQuotes(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeFolderName(value) {
  return stripWrappingQuotes(value)
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractContainerNumber(value) {
  const match = normalizeContainerKey(value).match(/[A-Z]{4}\d{6,8}/);
  return match ? match[0] : '';
}

function containerInputMatchesFolder(input, folderName) {
  const inputContainer = extractContainerNumber(input);
  const folderContainer = extractContainerNumber(folderName);

  if (inputContainer && folderContainer && inputContainer === folderContainer) {
    return true;
  }
  return !!normalizeFolderName(input) && normalizeFolderName(input) === normalizeFolderName(folderName);
}

module.exports = {
  containerInputMatchesFolder,
  extractContainerNumber,
  getEnv,
  getMultilineEnv,
  normalizeContainerKey,
  normalizeFolderName,
  stripWrappingQuotes,
};
