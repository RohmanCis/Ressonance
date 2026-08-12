import { describe, expect, it } from "vitest";

import {
  ffprobeFormatToMime,
  validateVoiceNoteFile,
  VOICE_DURATION_MAX,
  VOICE_DURATION_MIN,
  voiceNoteExtension,
} from "@/lib/audio-file";

const config = { maxSizeBytes: 1000 };

describe("validateVoiceNoteFile", () => {
  it("returns empty for a zero-length buffer", () => {
    expect(validateVoiceNoteFile(new Uint8Array(0), config).status).toBe("empty");
  });

  it("returns too_large above the configured size limit", () => {
    expect(validateVoiceNoteFile(new Uint8Array(1001), config).status).toBe("too_large");
  });

  it("returns ok for a non-empty buffer within the limit (no magic-byte check)", () => {
    expect(validateVoiceNoteFile(new Uint8Array(20).fill(0x41), config).status).toBe("ok");
  });
});

describe("ffprobeFormatToMime", () => {
  it("maps webm containers to audio/webm", () => {
    expect(ffprobeFormatToMime("webm")).toBe("audio/webm");
    expect(ffprobeFormatToMime("matroska,webm")).toBe("audio/webm");
  });

  it("maps ogg containers to audio/ogg", () => {
    expect(ffprobeFormatToMime("ogg")).toBe("audio/ogg");
    expect(ffprobeFormatToMime("Ogg")).toBe("audio/ogg");
  });

  it("maps mp4/mov containers to audio/mp4", () => {
    expect(ffprobeFormatToMime("mov,mp4,m4a,3gp,3g2,mj2")).toBe("audio/mp4");
    expect(ffprobeFormatToMime("mp4")).toBe("audio/mp4");
    expect(ffprobeFormatToMime("mov")).toBe("audio/mp4");
  });

  it("returns null for an unknown/unparseable format", () => {
    expect(ffprobeFormatToMime("flac")).toBeNull();
    expect(ffprobeFormatToMime("wav")).toBeNull();
    expect(ffprobeFormatToMime("")).toBeNull();
  });
});

describe("voiceNoteExtension", () => {
  it("maps each approved MIME to a storage extension", () => {
    expect(voiceNoteExtension("audio/webm")).toBe("webm");
    expect(voiceNoteExtension("audio/ogg")).toBe("ogg");
    expect(voiceNoteExtension("audio/mp4")).toBe("m4a");
  });
});

describe("duration bounds", () => {
  it("exposes the inclusive 5–30 range", () => {
    expect(VOICE_DURATION_MIN).toBe(5);
    expect(VOICE_DURATION_MAX).toBe(30);
  });
});