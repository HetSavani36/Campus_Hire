import csv from "csv-parser";
import streamifier from "streamifier";

export const parseCSVBuffer = (buffer) => {
  return new Promise((resolve, reject) => {
    const results = [];

    streamifier
      .createReadStream(buffer)
      .pipe(csv())
      .on("data", (row) => results.push(row))
      .on("end", () => resolve(results))
      .on("error", reject);
  });
};
