// Channel Recall (Previous Channel) history engine for Kinora 10-foot TV experience.
// Manages previous channel memory and instant bounce toggling between live broadcasts.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

export interface ChannelRecallState {
  history: string[] // List of channel IDs in chronological order (most recent at end)
}

export const INITIAL_RECALL_STATE: ChannelRecallState = {
  history: [],
}

// Records a channel tune into the history stack, preventing adjacent duplicate entries
export function recordChannelTune(
  channelId: string,
  history: string[],
  maxHistory = 10
): string[] {
  if (!channelId) return history
  const last = history[history.length - 1]
  if (last === channelId) return history

  const updated = [...history, channelId]
  if (updated.length > maxHistory) {
    return updated.slice(updated.length - maxHistory)
  }
  return updated
}

// Resolves the previous channel to recall to
export function getPreviousChannelId(
  history: string[],
  currentChannelId?: string
): string | null {
  if (history.length < 2) return null

  // If current channel matches top of stack, return the one before it
  const top = history[history.length - 1]
  if (top === currentChannelId) {
    return history[history.length - 2] ?? null
  }

  // Otherwise, return top of stack if different from current
  if (top && top !== currentChannelId) {
    return top
  }

  return history[history.length - 2] ?? null
}
