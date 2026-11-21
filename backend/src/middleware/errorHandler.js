export function errorHandler(err, _req, res, _next) {
  console.error("[Error]", err);

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "File too large. Check MAX_FILE_SIZE_MB limit.",
    });
  }

  const status = err.statusCode || 400;
  res.status(status).json({
    error: err.message || "Internal server error",
  });
}
