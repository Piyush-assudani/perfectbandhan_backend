const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const redisService = require('./services/redis.service');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const notificationRoutes = require('./routes/notification.routes');
const storyRoutes = require('./routes/story.routes');
const postRoutes = require('./routes/post.routes');
const sanitizeMiddleware = require('./middleware/sanitize.middleware');
const { abuseProtectionMiddleware } = require('./middleware/abuse_protection.middleware');

const app = express();
app.set('trust proxy', 1); // Fixes express-rate-limit error behind Nginx/Proxy

// ─── Global 10-Second Request Timeout Middleware ──────────────────────────────
app.use((req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(504).json({
        status: 'error',
        message: 'Gateway Timeout: Request took longer than 30 seconds.'
      });
    }
  }, 30000);
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  next();
});

// ─── Redis-based Rate Limiters (distributed across instances) ───────────────────
const createRedisLimiter = (windowMs, max, message, keyPrefix) => {
  if (!redisService.isReady) {
    // Fallback to memory store if Redis not ready
    return rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { status: 'error', message },
    });
  }
  
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      sendCommand: (...args) => redisService.client.sendCommand(args),
      prefix: `rl:${keyPrefix}:`,
    }),
    keyGenerator: (req) => req.ip,
    handler: (req, res) => {
      res.status(429).json({ status: 'error', message });
    },
  });
};

// OTP Rate Limiter: 5 per IP per minute
const otpRateLimiter = createRedisLimiter(
  60 * 1000, 5,
  'Too many OTP requests from this IP. Please wait 1 minute before trying again.',
  'otp'
);

// Login Rate Limiter: 10 per IP per 15 minutes
const loginRateLimiter = createRedisLimiter(
  15 * 60 * 1000, 10,
  'Too many login attempts. Please try again after 15 minutes.',
  'login'
);

// Profile write Rate Limiter: 30 per IP per minute (create/update profile)
const profileWriteLimiter = createRedisLimiter(
  60 * 1000, 30,
  'Too many profile updates. Please wait a moment.',
  'profile-write'
);

// Chat/send message Rate Limiter: 20 per IP per minute
const chatLimiter = createRedisLimiter(
  60 * 1000, 20,
  'Too many messages. Please slow down.',
  'chat'
);

// Search Rate Limiter: 60 per IP per minute
const searchLimiter = createRedisLimiter(
  60 * 1000, 60,
  'Too many search requests. Please wait a moment.',
  'search'
);

// Story Rate Limiter: 30 per IP per minute
const storyLimiter = createRedisLimiter(
  60 * 1000, 30,
  'Too many story actions. Please slow down.',
  'story'
);

// Global Rate Limiter: 500 per IP per 10 minutes
const globalRateLimiter = createRedisLimiter(
  10 * 60 * 1000, 500,
  'Too many requests from this IP. Please try again after 10 minutes.',
  'global'
);

// Standard Apple-minimal server middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false
})); // Secure HTTP headers with safe cross-origin resource policy
// Completely open and permissive CORS (never blocks Flutter web, mobile, or external clients)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(cors());
app.use(compression({
  level: 6,
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(sanitizeMiddleware); // Deep input sanitization against NoSQL injection, XSS, and object tampering

// ETag support for conditional requests (304 Not Modified)
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    // Generate simple ETag for JSON responses
    if (data && typeof data === 'object' && req.method === 'GET') {
      const etag = require('crypto')
        .createHash('md5')
        .update(JSON.stringify(data))
        .digest('hex')
        .substring(0, 16);
      res.set('ETag', `W/"${etag}"`);
      
      // Check If-None-Match header
      const clientETag = req.headers['if-none-match'];
      if (clientETag && clientETag === `W/"${etag}"`) {
        return res.status(304).end();
      }
    }
    return originalJson(data);
  };
  next();
});

app.use(abuseProtectionMiddleware); // Block abusive IPs / scanning attacks
app.use('/api', globalRateLimiter); // Apply global limit to API routes

// Apply specific rate limiters to routes
app.use('/api/v1/auth/send-otp', otpRateLimiter);
app.use('/api/v1/auth/verify-otp', otpRateLimiter);
app.use('/api/v1/auth/login-pass', loginRateLimiter);
app.use('/api/v1/auth/google-login', loginRateLimiter);
app.use('/api/v1/auth/set-password', loginRateLimiter);
app.use('/api/v1/auth/reset-password-with-email', loginRateLimiter);
app.use('/api/v1/user/profile', profileWriteLimiter);
app.use('/api/v1/user/chat/send', chatLimiter);
app.use('/api/v1/user/profiles', searchLimiter);
app.use('/api/v1/user/profile/', searchLimiter); // profile by ID
app.use('/api/v1/user/interests', searchLimiter);
app.use('/api/v1/user/stories', storyLimiter);
app.use('/api/v1/stories', storyLimiter);

// Root simple health check
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Perfect Bandhan Premium API Server is fully operational.'
  });
});

// Privacy Policy page
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/privacy.html'));
});

// Public Profile Web Share Route
app.get('/p/:pbId', async (req, res) => {
  try {
    const User = require('./models/user.model');
    const { pbId } = req.params;
    const user = await User.findOne({ pbId });

    if (!user) {
      return res.status(404).send('<h1>Profile Not Found</h1><p>The profile you are looking for does not exist or the link is invalid.</p>');
    }

    // Server-Side Rendering (SSR) HTML for WhatsApp/Social Media OpenGraph previews
    const photoUrl = (user.uploadedPhotos && user.uploadedPhotos.length > 0) ? user.uploadedPhotos[0] : 'https://perfectbandhan.com/default_avatar.png';
    const fullName = `${user.firstName} ${user.lastName}`;
    const location = `${user.city}, ${user.state}`;
    const details = `${user.age || 25} yrs • ${user.height} • ${user.profession} • ${location}`;
    const hostUrl = `${req.protocol}://${req.get('host')}/p/${pbId}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fullName} - Perfect Bandhan Profile</title>
  
  <!-- OpenGraph Meta Tags for WhatsApp/Instagram Previews -->
  <meta property="og:title" content="${fullName} on Perfect Bandhan" />
  <meta property="og:description" content="${details}. Tap to view full profile!" />
  <meta property="og:image" content="${photoUrl}" />
  <meta property="og:url" content="${hostUrl}" />
  <meta property="og:type" content="profile" />
  
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; margin: 0; padding: 20px; display: flex; justify-content: center; }
    .card { background: white; max-width: 400px; width: 100%; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); padding-bottom: 20px; }
    .photo { width: 100%; height: 400px; object-fit: cover; }
    .info { padding: 20px; text-align: center; }
    h1 { margin: 0 0 10px 0; font-size: 24px; color: #333; }
    p { margin: 5px 0; color: #666; font-size: 16px; }
    .pb-id { display: inline-block; background: #FFD700; color: #000; padding: 5px 15px; border-radius: 20px; font-weight: bold; margin-top: 10px; font-size: 14px; }
    .cta { display: block; background: #C89933; color: white; text-align: center; padding: 15px; margin: 20px; border-radius: 12px; text-decoration: none; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <img src="${photoUrl}" class="photo" alt="${fullName}">
    <div class="info">
      <h1>${fullName}</h1>
      <p>${details}</p>
      <div class="pb-id">ID: ${pbId}</div>
    </div>
    <a href="https://play.google.com/store/apps/details?id=com.perfectbandhan.app" class="cta">Download App to Connect</a>
  </div>
</body>
</html>
    `;
    res.send(html);
  } catch (error) {
    console.error('[Web Share Route Error]:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Endpoint prefixes mapping
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/user/stories', storyRoutes);
app.use('/api/v1/stories', storyRoutes);
app.use('/api/v1/posts', postRoutes);
app.use('/api/v1/user/posts', postRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// Catch JSON parsing/limit errors gracefully
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ status: 'error', message: 'Invalid JSON payload format.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ status: 'error', message: 'Payload size limit exceeded. Please upload smaller images.' });
  }
  return res.status(500).json({ status: 'error', message: err.message || 'Internal server error.' });
});

// Catch-all route not found handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'API route not found.'
  });
});

module.exports = app;
