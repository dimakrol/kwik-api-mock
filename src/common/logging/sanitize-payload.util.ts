const SENSITIVE_KEY_PATTERN =
  /(authorization|password|secret|token|api[_-]?key|access[_-]?key|access[_-]?secret|credential|hmac)/i;

const MAX_STRING_LENGTH = 8_192;
const MAX_DEPTH = 8;

export function sanitizeHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!headers) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : value;
  }
  return out;
}

export function sanitizePayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return '[TRUNCATED_DEPTH]';

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`
      : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item, depth + 1));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? '[REDACTED]'
        : sanitizePayload(nested, depth + 1);
    }
    return out;
  }

  return value;
}

export function resolveInboundRequestBody(req: {
  body?: unknown;
  rawBody?: string;
}): unknown {
  if (typeof req.rawBody === 'string' && req.rawBody.trim() !== '') {
    try {
      return sanitizePayload(JSON.parse(req.rawBody));
    } catch {
      return sanitizePayload(req.rawBody);
    }
  }
  if (req.body !== undefined) {
    return sanitizePayload(req.body);
  }
  return null;
}
