export const log = {
  info: (msg, meta = {}) => {
    console.log(JSON.stringify({ level: "info", message: msg, ...meta }));
  },
  error: (msg, meta = {}) => {
    console.error(JSON.stringify({ level: "error", message: msg, ...meta }));
  },
  warn: (msg, meta = {}) => {
    console.warn(JSON.stringify({ level: "warn", message: msg, ...meta }));
  },
};