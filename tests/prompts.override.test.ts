import { describe, expect, it } from "vitest";
import {
  buildFileTextSummaryPrompt,
  buildLinkSummaryPrompt,
  buildPathSummaryPrompt,
} from "../packages/core/src/prompts/index.js";
import { parseOutputLanguage } from "../src/language.js";

describe("prompt overrides", () => {
  it("replaces link instructions but keeps context/content tags", () => {
    const prompt = buildLinkSummaryPrompt({
      url: "https://example.com",
      title: "Hello",
      siteName: "Example",
      description: null,
      content: "Body",
      truncated: false,
      hasTranscript: false,
      outputLanguage: parseOutputLanguage("en"),
      summaryLength: { maxCharacters: 120 },
      shares: [],
      promptOverride: "Custom instruction.",
      lengthInstruction: "Output is 120 characters.",
      languageInstruction: "Output should be English.",
    });

    expect(prompt).toContain("<instructions>");
    expect(prompt).toContain("Custom instruction.");
    expect(prompt).toContain("Output is 120 characters.");
    expect(prompt).toContain("Output should be English.");
    expect(prompt).toContain("<context>");
    expect(prompt).toContain("Source URL: https://example.com");
    expect(prompt).toContain("<content>");
    expect(prompt).toContain("Body");
    expect(prompt).not.toContain("You summarize online articles");
  });

  it("replaces file-text instructions and keeps inline content", () => {
    const prompt = buildFileTextSummaryPrompt({
      filename: "notes.txt",
      originalMediaType: "text/plain",
      contentMediaType: "text/plain",
      summaryLength: "short",
      contentLength: 12,
      outputLanguage: parseOutputLanguage("en"),
      content: "Hello world!",
      promptOverride: "Summarize in two bullets.",
      lengthInstruction: null,
      languageInstruction: "Output should be English.",
    });

    expect(prompt).toContain("<instructions>");
    expect(prompt).toContain("Summarize in two bullets.");
    expect(prompt).toContain("Output should be English.");
    expect(prompt).toContain("<content>");
    expect(prompt).toContain("Hello world!");
    expect(prompt).not.toContain("You summarize files");
  });

  it("replaces path prompt instructions for CLI attachments", () => {
    const prompt = buildPathSummaryPrompt({
      kindLabel: "file",
      filePath: "/tmp/sample.pdf",
      filename: "sample.pdf",
      mediaType: "application/pdf",
      summaryLength: { maxCharacters: 500 },
      outputLanguage: parseOutputLanguage("en"),
      promptOverride: "Custom file instructions.",
      lengthInstruction: "Output is 500 characters.",
      languageInstruction: "Output should be English.",
    });

    expect(prompt).toContain("<instructions>");
    expect(prompt).toContain("Custom file instructions.");
    expect(prompt).toContain("Output is 500 characters.");
    expect(prompt).toContain("<context>");
    expect(prompt).toContain("Path: /tmp/sample.pdf");
    expect(prompt).not.toContain("You summarize files");
  });

  it("does not add length/language lines when instructions are null", () => {
    const prompt = buildLinkSummaryPrompt({
      url: "https://example.com/none",
      title: "None",
      siteName: "Example",
      description: null,
      content: "Body",
      truncated: false,
      hasTranscript: false,
      outputLanguage: parseOutputLanguage("en"),
      summaryLength: { maxCharacters: 200 },
      shares: [],
      promptOverride: "Custom prompt only.",
      lengthInstruction: null,
      languageInstruction: null,
    });

    expect(prompt).toContain("Custom prompt only.");
    expect(prompt).not.toContain("Output is");
    expect(prompt).not.toContain("Output should be");
  });

  it("keeps file metadata in context with custom instructions", () => {
    const prompt = buildPathSummaryPrompt({
      kindLabel: "attachment",
      filePath: "/Users/peter/Docs/report.md",
      filename: "report.md",
      mediaType: "text/markdown",
      summaryLength: "short",
      outputLanguage: parseOutputLanguage("en"),
      promptOverride: "Summarize in one sentence.",
      lengthInstruction: null,
      languageInstruction: null,
    });

    expect(prompt).toContain("<context>");
    expect(prompt).toContain("Path: /Users/peter/Docs/report.md");
    expect(prompt).toContain("Filename: report.md");
    expect(prompt).toContain("Media type: text/markdown");
  });
});
