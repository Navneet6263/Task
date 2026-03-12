const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';

  res.status(status).json({
    error: err.message || 'Internal server error',
    code,
    status
  });
};

const notFound = (req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND', status: 404 });
};

module.exports = { errorHandler, notFound };
