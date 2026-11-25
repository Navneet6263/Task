const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Express marks request problems (bad JSON, body too large) with a 4xx status. Anything else is
  // ours: its text stays in the server log and the browser gets a plain message.
  const status = err.status || err.statusCode || 500;
  const clientError = status >= 400 && status < 500;
  res.status(status).json({
    error: clientError ? (err.expose === false ? 'The request could not be read.' : err.message) : 'Something went wrong. Please try again.',
    code: clientError && typeof err.code === 'string' ? err.code : 'INTERNAL_ERROR',
    status
  });
};

const notFound = (req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND', status: 404 });
};

module.exports = { errorHandler, notFound };
