const redisService = require('../services/redis.service');

// Fast in-memory jail cache for sub-millisecond rejection
const jailedIPs = new Map(); // ip -> unbanTimestamp
const ipViolationCounts = new Map(); // ip -> { count: number, windowStart: number }

const BAN_DURATION_MS = 15 * 60 * 1000; // 15 minutes ban
const VIOLATION_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_VIOLATIONS_BEFORE_BAN = 35; // 35 bad requests within 1 min = auto ban

// Clean up expired entries every 2 minutes to keep memory ultra-low
setInterval(() => {
  const now = Date.now();
  for (const [ip, unbanTime] of jailedIPs.entries()) {
    if (now > unbanTime) jailedIPs.delete(ip);
  }
  for (const [ip, record] of ipViolationCounts.entries()) {
    if (now - record.windowStart > VIOLATION_WINDOW_MS) ipViolationCounts.delete(ip);
  }
}, 2 * 60 * 1000);

/**
 * Check if an IP is currently banned
 */
async function isIpBanned(ip) {
  const now = Date.now();
  // 1. Check local fast memory cache
  const localBan = jailedIPs.get(ip);
  if (localBan) {
    if (now < localBan) return true;
    jailedIPs.delete(ip);
  }

  // 2. Check Redis if available
  if (redisService.isReady) {
    try {
      const banned = await redisService.get(`banned_ip:${ip}`);
      if (banned) {
        jailedIPs.set(ip, now + BAN_DURATION_MS); // cache locally too
        return true;
      }
    } catch (_) {}
  }

  return false;
}

/**
 * Ban an IP for abusive behavior
 */
async function banIp(ip, reason = 'Abnormal traffic or repeated violations') {
  const unbanAt = Date.now() + BAN_DURATION_MS;
  jailedIPs.set(ip, unbanAt);
  ipViolationCounts.delete(ip);

  console.warn(`[SECURITY] 🚨 Jailed IP ${ip} for 15 minutes. Reason: ${reason}`);

  if (redisService.isReady) {
    try {
      await redisService.set(`banned_ip:${ip}`, '1', Math.ceil(BAN_DURATION_MS / 1000));
    } catch (_) {}
  }
}

/**
 * Record a violation (4xx error, malformed input, rate limit hit)
 */
function recordViolation(ip) {
  // Never ban loopback during local testing unless explicitly desired
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.includes('127.0.0.1') || ip === 'localhost') return;

  const now = Date.now();
  let record = ipViolationCounts.get(ip);

  if (!record || now - record.windowStart > VIOLATION_WINDOW_MS) {
    record = { count: 1, windowStart: now };
  } else {
    record.count++;
  }

  ipViolationCounts.set(ip, record);

  if (record.count >= MAX_VIOLATIONS_BEFORE_BAN) {
    banIp(ip, `Exceeded ${MAX_VIOLATIONS_BEFORE_BAN} suspicious/faulty requests within 1 minute.`);
  }
}

/**
 * Abuse Protection Middleware
 * Runs at the very top of the Express pipeline
 */
const abuseProtectionMiddleware = async (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

  // 1. Instantly reject if already banned
  if (await isIpBanned(clientIp)) {
    return res.status(403).json({
      status: 'error',
      message: 'Access denied: Your IP has been temporarily suspended due to suspicious security violations. Please try again after 15 minutes.'
    });
  }

  // 2. Monitor response status when finished
  res.on('finish', () => {
    // Treat 400 (bad input), 401 (auth failure), 403 (forbidden), 404 (scanning routes), 429 (rate-limit hit) as violation indicators
    if ([400, 401, 403, 404, 429].includes(res.statusCode)) {
      recordViolation(clientIp);
    }
  });

  next();
};

module.exports = {
  abuseProtectionMiddleware,
  isIpBanned,
  banIp,
  recordViolation
};
