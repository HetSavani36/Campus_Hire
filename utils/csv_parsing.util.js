import path from "path";
import XLSX from "xlsx";
import csv from "csv-parser";
import streamifier from "streamifier";

export const parseFileBuffer = (buffer, originalName) => {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === ".xlsx") {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    return XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      trim: true,
    });
  }

  if (ext === ".csv") {
    return new Promise((resolve, reject) => {
      const results = [];

      streamifier
        .createReadStream(buffer)
        .pipe(csv())
        .on("data", (row) => results.push(row))
        .on("end", () => resolve(results))
        .on("error", reject);
    });
  }

  throw new Error("Unsupported file type. Upload CSV or XLSX only.");
};
