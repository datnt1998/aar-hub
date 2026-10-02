import type { Readable } from 'node:stream';
import { type FileInput, type FileUpload, MAX_FILE_BYTES, MAX_FILES, SIGNATURE_BYTES } from './partner-applications.js';

interface IncomingFile {
  fieldname: string;
  stream: Readable;
}

type Done = (error: Error | null, info?: Pick<FileUpload, 'buffer' | 'size'>) => void;

/**
 * Multer storage engine for the files of an application. Every file is read to the end so its real size is known and
 * every error of the submission can be reported together (BR-PARTNER-ONBOARDING-054), but memory stays bounded:
 * - a file that could be stored (within the count of its input) keeps at most MAX_FILE_BYTES + 1 bytes, which is its
 *   whole content when it is not too large;
 * - any other file (over the count, or under an input that takes no file) keeps only the bytes that tell its type.
 * Such a file always fails the request (too many files or unknown input), so its content is never needed.
 */
export function attachmentStorage() {
  const filesSeen = new WeakMap<object, Map<string, number>>();
  return {
    _handleFile(req: object, file: IncomingFile, done: Done): void {
      const seen = filesSeen.get(req) ?? new Map<string, number>();
      filesSeen.set(req, seen);
      const index = seen.get(file.fieldname) ?? 0;
      seen.set(file.fieldname, index + 1);
      const limit = Object.hasOwn(MAX_FILES, file.fieldname) ? MAX_FILES[file.fieldname as FileInput] : 0;
      const keep = index < limit ? MAX_FILE_BYTES + 1 : SIGNATURE_BYTES;

      const chunks: Buffer[] = [];
      let kept = 0;
      let size = 0;
      file.stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (kept < keep) {
          const part = chunk.subarray(0, keep - kept);
          chunks.push(part);
          kept += part.length;
        }
      });
      file.stream.on('end', () => done(null, { buffer: Buffer.concat(chunks), size }));
    },

    _removeFile(_req: object, file: Partial<FileUpload>, done: (error: Error | null) => void): void {
      delete file.buffer;
      done(null);
    },
  };
}
