function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isHttpError(error) {
  return Number.isInteger(error?.status);
}

module.exports = {
  createHttpError,
  isHttpError,
};
