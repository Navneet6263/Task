const { randomUUID } = require('node:crypto');
module.exports = (req, res, next) => {
  const started = process.hrtime.bigint();
  const requestId = randomUUID();
  res.setHeader('X-Request-ID', requestId);
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    // No tokens, query values, request bodies or client names in logs.
    if (durationMs >= Number(process.env.SLOW_API_MS || 500) || res.statusCode >= 400) {
      console.warn(JSON.stringify({ event: 'api_response', requestId, method: req.method,
        route: req.route?.path || req.path, status: res.statusCode, durationMs: Math.round(durationMs) }));
    }
  });
  next();
};
