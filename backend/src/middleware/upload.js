import multer from "multer";
import { env } from "../config/env.js";

const storage = multer.memoryStorage();

export const pdfUploadMiddleware = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    const isPdfMime = file.mimetype === "application/pdf";
    const isPdfExt = file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdfMime && !isPdfExt) {
      return cb(new Error("Only PDF files are allowed."));
    }
    cb(null, true);
  },
});

export function verifyPdfMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return false;
  return buffer.subarray(0, 4).toString("ascii") === "%PDF";
}
