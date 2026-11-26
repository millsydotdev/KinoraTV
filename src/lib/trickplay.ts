/**
 * Storyboard trickplay scrubbing engine for Kinora.
 * Parses WebVTT storyboard cues and spatial sprite coordinates for video scrubber previews.
 */

export interface StoryboardCue {
  startSec: number;
  endSec: number;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteStyle {
  backgroundImage: string;
  backgroundPosition: string;
  width: string;
  height: string;
  backgroundRepeat: string;
}

/**
 * Parses a WebVTT or SRT timestamp (hh:mm:ss.sss or mm:ss.sss) into total seconds.
 */
export function parseTimestamp(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  // Replace comma with period for subsecond parsing:
  const normalized = trimmed.replace(",", ".");
  const parts = normalized.split(":");

  if (parts.length === 3) {
    const hours = parseFloat(parts[0] ?? "0") || 0;
    const minutes = parseFloat(parts[1] ?? "0") || 0;
    const seconds = parseFloat(parts[2] ?? "0") || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const minutes = parseFloat(parts[0] ?? "0") || 0;
    const seconds = parseFloat(parts[1] ?? "0") || 0;
    return minutes * 60 + seconds;
  }

  return parseFloat(normalized) || 0;
}

/**
 * Resolves a potentially relative image path against a base URL.
 */
function resolveUrl(relativeOrAbsolute: string, baseUrl?: string): string {
  if (!baseUrl || /^https?:\/\//i.test(relativeOrAbsolute)) {
    return relativeOrAbsolute;
  }

  try {
    const base = new URL(baseUrl);
    return new URL(relativeOrAbsolute, base).href;
  } catch {
    // Fallback simple path concatenation if URL parsing fails:
    const baseClean = baseUrl.replace(/\/+$/, "");
    const relClean = relativeOrAbsolute.replace(/^\/+/, "");
    return `${baseClean}/${relClean}`;
  }
}

/**
 * Parses WebVTT storyboard sprite sheet metadata.
 */
export function parseStoryboardVtt(vttContent: string, baseUrl?: string): StoryboardCue[] {
  if (!vttContent) return [];

  const lines = vttContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const cues: StoryboardCue[] = [];

  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    if (rawLine === undefined) {
      i++;
      continue;
    }
    const line = rawLine.trim();

    // Skip WEBWTT header and comment notes:
    if (!line || line.startsWith("WEBVTT") || line.startsWith("NOTE")) {
      i++;
      continue;
    }

    // Check for cue timing line: 00:00:00.000 --> 00:00:05.000
    if (line.includes("-->")) {
      const arrowIndex = line.indexOf("-->");
      const startStr = line.slice(0, arrowIndex).trim();
      const endRest = line.slice(arrowIndex + 3).trim();
      // An optional cue setting might follow the end timestamp:
      const endStr = endRest.split(/\s+/)[0] ?? "";

      const startSec = parseTimestamp(startStr);
      const endSec = parseTimestamp(endStr);

      // Read payload line(s):
      i++;
      let payload = "";
      while (i < lines.length) {
        const nextRaw = lines[i];
        if (nextRaw === undefined || nextRaw.trim() === "") {
          break;
        }
        if (!payload) {
          payload = nextRaw.trim();
        }
        i++;
      }

      if (payload) {
        // Parse xywh spatial crop fragment: url#xywh=x,y,w,h
        let imageUrl = payload;
        let x = 0;
        let y = 0;
        let w = 160;
        let h = 90;

        const hashIndex = payload.indexOf("#xywh=");
        if (hashIndex !== -1) {
          imageUrl = payload.slice(0, hashIndex);
          const coords = payload.slice(hashIndex + 6).split(",");
          if (coords.length === 4) {
            x = parseInt(coords[0] ?? "0", 10) || 0;
            y = parseInt(coords[1] ?? "0", 10) || 0;
            w = parseInt(coords[2] ?? "160", 10) || 160;
            h = parseInt(coords[3] ?? "90", 10) || 90;
          }
        }

        const resolvedUrl = resolveUrl(imageUrl, baseUrl);

        cues.push({
          startSec,
          endSec,
          url: resolvedUrl,
          x,
          y,
          w,
          h,
        });
      }
    } else {
      i++;
    }
  }

  // Ensure cues are sorted chronologically:
  return cues.sort((a, b) => a.startSec - b.startSec);
}

/**
 * Finds the storyboard cue corresponding to a specific playback second.
 */
export function getStoryboardThumbnailAt(cues: StoryboardCue[], timeSec: number): StoryboardCue | null {
  if (!cues || cues.length === 0) return null;

  const target = Math.max(0, timeSec);

  // Binary search for efficient O(log N) lookup:
  let low = 0;
  let high = cues.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const cue = cues[mid];
    if (!cue) break;

    if (target >= cue.startSec && target < cue.endSec) {
      return cue;
    }

    if (target < cue.startSec) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  // Bound clamping: if time is within the final cue:
  const lastCue = cues[cues.length - 1];
  if (lastCue && target >= lastCue.startSec && target <= lastCue.endSec + 1) {
    return lastCue;
  }

  // If before first cue:
  const firstCue = cues[0];
  if (firstCue && target < firstCue.startSec) {
    return firstCue;
  }

  return null;
}

/**
 * Computes CSS styles for rendering the cropped thumbnail from the sprite sheet.
 */
export function getSpriteStyle(cue: StoryboardCue): SpriteStyle {
  return {
    backgroundImage: `url("${cue.url}")`,
    backgroundPosition: `-${cue.x}px -${cue.y}px`,
    width: `${cue.w}px`,
    height: `${cue.h}px`,
    backgroundRepeat: "no-repeat",
  };
}
