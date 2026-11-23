import { describe, expect, it } from "vitest";
import {
  getSpriteStyle,
  getStoryboardThumbnailAt,
  parseStoryboardVtt,
  parseTimestamp,
} from "./trickplay";

describe("trickplay engine", () => {
  describe("parseTimestamp", () => {
    it("parses hh:mm:ss.sss format", () => {
      expect(parseTimestamp("01:02:03.500")).toBe(3723.5);
    });

    it("parses mm:ss.sss format", () => {
      expect(parseTimestamp("02:15.250")).toBe(135.25);
    });

    it("parses comma-separated millisecond timestamps", () => {
      expect(parseTimestamp("00:00:10,750")).toBe(10.75);
    });

    it("handles empty or invalid strings gracefully", () => {
      expect(parseTimestamp("")).toBe(0);
      expect(parseTimestamp("invalid")).toBe(0);
    });
  });

  describe("parseStoryboardVtt", () => {
    const sampleVtt = `WEBVTT
NOTE Storyboard track for chapter thumbnails

00:00:00.000 --> 00:00:10.000
sprites.jpg#xywh=0,0,160,90

00:00:10.000 --> 00:00:20.000
sprites.jpg#xywh=160,0,160,90

00:00:20.000 --> 00:00:30.000
sprites.jpg#xywh=0,90,160,90
`;

    it("parses cues with spatial sprite crops", () => {
      const cues = parseStoryboardVtt(sampleVtt, "https://cdn.example.com/media/");
      expect(cues).toHaveLength(3);

      expect(cues[0]).toEqual({
        startSec: 0,
        endSec: 10,
        url: "https://cdn.example.com/media/sprites.jpg",
        x: 0,
        y: 0,
        w: 160,
        h: 90,
      });

      expect(cues[1]).toEqual({
        startSec: 10,
        endSec: 20,
        url: "https://cdn.example.com/media/sprites.jpg",
        x: 160,
        y: 0,
        w: 160,
        h: 90,
      });

      expect(cues[2]).toEqual({
        startSec: 20,
        endSec: 30,
        url: "https://cdn.example.com/media/sprites.jpg",
        x: 0,
        y: 90,
        w: 160,
        h: 90,
      });
    });

    it("handles absolute URLs without modifying them", () => {
      const vtt = `WEBVTT

00:00:00.000 --> 00:00:05.000
https://static.cdn.com/thumb.jpg#xywh=10,20,320,180
`;
      const cues = parseStoryboardVtt(vtt, "https://other.com/base/");
      expect(cues[0]?.url).toBe("https://static.cdn.com/thumb.jpg");
      expect(cues[0]?.x).toBe(10);
      expect(cues[0]?.y).toBe(20);
      expect(cues[0]?.w).toBe(320);
      expect(cues[0]?.h).toBe(180);
    });

    it("returns empty array on empty input", () => {
      expect(parseStoryboardVtt("")).toEqual([]);
    });
  });

  describe("getStoryboardThumbnailAt", () => {
    const cues = [
      {
        startSec: 0,
        endSec: 10,
        url: "sheet.jpg",
        x: 0,
        y: 0,
        w: 160,
        h: 90,
      },
      {
        startSec: 10,
        endSec: 20,
        url: "sheet.jpg",
        x: 160,
        y: 0,
        w: 160,
        h: 90,
      },
      {
        startSec: 20,
        endSec: 30,
        url: "sheet.jpg",
        x: 320,
        y: 0,
        w: 160,
        h: 90,
      },
    ];

    it("finds correct cue via binary search", () => {
      expect(getStoryboardThumbnailAt(cues, 0)?.x).toBe(0);
      expect(getStoryboardThumbnailAt(cues, 5)?.x).toBe(0);
      expect(getStoryboardThumbnailAt(cues, 10)?.x).toBe(160);
      expect(getStoryboardThumbnailAt(cues, 19.9)?.x).toBe(160);
      expect(getStoryboardThumbnailAt(cues, 25)?.x).toBe(320);
    });

    it("clamps boundary cases gracefully", () => {
      expect(getStoryboardThumbnailAt(cues, -5)?.x).toBe(0);
      expect(getStoryboardThumbnailAt(cues, 30.5)?.x).toBe(320);
      expect(getStoryboardThumbnailAt([], 10)).toBeNull();
    });
  });

  describe("getSpriteStyle", () => {
    it("generates correct CSS sprite background position and dimensions", () => {
      const cue = {
        startSec: 10,
        endSec: 20,
        url: "https://example.com/sprite.jpg",
        x: 320,
        y: 180,
        w: 160,
        h: 90,
      };

      const style = getSpriteStyle(cue);
      expect(style.backgroundImage).toBe('url("https://example.com/sprite.jpg")');
      expect(style.backgroundPosition).toBe("-320px -180px");
      expect(style.width).toBe("160px");
      expect(style.height).toBe("90px");
      expect(style.backgroundRepeat).toBe("no-repeat");
    });
  });
});
