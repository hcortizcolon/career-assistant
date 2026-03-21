import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFile, mkdir, rm, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateFilePath } from "../../src/loaders/validate.js";
import { DocumentError } from "../../src/errors/index.js";

// ---------------------------------------------------------------------------
// Test fixtures — temp directory with real files
// ---------------------------------------------------------------------------

const TEST_DIR = join(tmpdir(), `career-assistant-test-${Date.now()}`);
const VALID_TXT = join(TEST_DIR, "resume.txt");
const VALID_PDF = join(TEST_DIR, "resume.pdf");
const VALID_MD = join(TEST_DIR, "notes.md");
const UNSUPPORTED = join(TEST_DIR, "data.xlsx");

beforeAll(async () => {
  await mkdir(TEST_DIR, { recursive: true });
  await writeFile(VALID_TXT, "sample resume content");
  await writeFile(VALID_PDF, "fake pdf content");
  await writeFile(VALID_MD, "# Heading\nsome markdown");
  await writeFile(UNSUPPORTED, "spreadsheet data");
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateFilePath", () => {
  describe("happy path", () => {
    it("returns absolute path for a valid .txt file", async () => {
      const result = await validateFilePath(VALID_TXT, [".txt", ".md"]);
      expect(result).toBe(VALID_TXT);
    });

    it("returns absolute path for a valid .pdf file", async () => {
      const result = await validateFilePath(VALID_PDF, [".pdf"]);
      expect(result).toBe(VALID_PDF);
    });

    it("returns absolute path for a valid .md file", async () => {
      const result = await validateFilePath(VALID_MD, [".txt", ".md"]);
      expect(result).toBe(VALID_MD);
    });

    it("uses default allowed extensions when none provided", async () => {
      // Default supports .pdf, .txt, .md
      const result = await validateFilePath(VALID_TXT);
      expect(result).toBe(VALID_TXT);
    });
  });

  describe("file not found", () => {
    it("throws DocumentError with DOCUMENT_NOT_FOUND code", async () => {
      const missingPath = join(TEST_DIR, "nonexistent.txt");

      try {
        await validateFilePath(missingPath, [".txt"]);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(DocumentError);
        const docError = error as DocumentError;
        expect(docError.code).toBe("DOCUMENT_NOT_FOUND");
        expect(docError.filePath).toBe(missingPath);
        expect(docError.message).toContain("File not found");
        expect(docError.message).toContain("nonexistent.txt");
      }
    });
  });

  describe("unsupported file type", () => {
    it("throws DocumentError with DOCUMENT_UNSUPPORTED_TYPE code", async () => {
      try {
        await validateFilePath(UNSUPPORTED, [".pdf", ".txt", ".md"]);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(DocumentError);
        const docError = error as DocumentError;
        expect(docError.code).toBe("DOCUMENT_UNSUPPORTED_TYPE");
        expect(docError.message).toContain(".xlsx");
        expect(docError.message).toContain(".pdf, .txt, .md");
      }
    });

    it("rejects files with no extension", async () => {
      const noExtPath = join(TEST_DIR, "Makefile");

      try {
        await validateFilePath(noExtPath, [".pdf", ".txt"]);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(DocumentError);
        const docError = error as DocumentError;
        expect(docError.code).toBe("DOCUMENT_UNSUPPORTED_TYPE");
        expect(docError.message).toContain("(none)");
      }
    });

    it("checks extension before checking file existence", async () => {
      // File doesn't exist AND has wrong extension — should get unsupported type, not not found
      const badPath = join(TEST_DIR, "missing.xlsx");

      try {
        await validateFilePath(badPath, [".pdf", ".txt"]);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(DocumentError);
        expect((error as DocumentError).code).toBe("DOCUMENT_UNSUPPORTED_TYPE");
      }
    });
  });

  describe("permission denied", () => {
    const UNREADABLE = join(TEST_DIR, "locked.txt");

    beforeAll(async () => {
      await writeFile(UNREADABLE, "secret");
      await chmod(UNREADABLE, 0o000);
    });

    afterAll(async () => {
      // Restore permissions so cleanup can delete it
      await chmod(UNREADABLE, 0o644);
    });

    it("throws DocumentError with DOCUMENT_READ_FAILED code", async () => {
      // Skip on CI / root user where permission checks don't apply
      if (process.getuid?.() === 0) return;

      try {
        await validateFilePath(UNREADABLE, [".txt"]);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(DocumentError);
        const docError = error as DocumentError;
        expect(docError.code).toBe("DOCUMENT_READ_FAILED");
        expect(docError.filePath).toBe(UNREADABLE);
      }
    });
  });

  describe("extension case insensitivity", () => {
    it("accepts uppercase extensions", async () => {
      const upperPath = join(TEST_DIR, "RESUME.TXT");
      await writeFile(upperPath, "content");

      const result = await validateFilePath(upperPath, [".txt"]);
      expect(result).toBe(upperPath);
    });
  });
});
