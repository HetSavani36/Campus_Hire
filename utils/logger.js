import fs from "fs";
import path from "path";

const logPath = path.join(process.cwd(), "app.log");
const stream = fs.createWriteStream(logPath, { flags: "a" });

// ANSI color codes (terminal only)
const colors = {
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  reset: "\x1b[0m",
};

function writeLog(entry, level) {
  // Write clean JSON to file (NO COLORS)
  stream.write(entry + "\n");

  // Colorized terminal output
  const color = colors[level] || colors.reset;
  const output = `${color}${entry}${colors.reset}`;

  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

export const log = {
  info: (msg, meta = {}) => {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      message: msg,
      ...meta,
    });
    writeLog(entry, "info");
  },

  warn: (msg, meta = {}) => {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "warn",
      message: msg,
      ...meta,
    });
    writeLog(entry, "warn");
  },

  error: (msg, meta = {}) => {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      message: msg,
      ...meta,
    });
    writeLog(entry, "error");
  },
};
