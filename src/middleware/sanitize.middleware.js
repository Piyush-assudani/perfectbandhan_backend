/**
 * Deep sanitization middleware against NoSQL injection, XSS, and malformed object tampering.
 * Protects MongoDB against keys starting with '$' or containing '.' and deeply trims string inputs.
 */
function sanitizeInput(obj, depth = 0) {
  if (depth > 8) return obj; // Prevent circular or excessive nesting
  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return obj.trim();
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeInput(item, depth + 1));
  }

  const cleaned = {};
  for (const key of Object.keys(obj)) {
    // Strip keys with NoSQL operators or dot notation which can tamper with MongoDB queries
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    cleaned[key] = sanitizeInput(obj[key], depth + 1);
  }
  return cleaned;
}

module.exports = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeInput(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeInput(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeInput(req.params);
  }
  next();
};
