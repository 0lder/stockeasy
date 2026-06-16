/**
 * Request logging middleware using morgan.
 * Logs: timestamp, method, url, status, response time.
 */

import morgan from "morgan";

export const requestLogger = morgan(
  ":date[iso] :method :url :status :res[content-length] - :response-time ms"
);
