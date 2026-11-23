import { describe, expect, it } from 'vitest'
import {
  getPreviousChannelId,
  recordChannelTune,
} from './channelRecall'

describe('channelRecall', () => {
  it('records channel tune and avoids duplicate adjacent entries', () => {
    let history: string[] = []
    history = recordChannelTune('bbc-one', history)
    expect(history).toEqual(['bbc-one'])

    // Tuning same channel again does not add duplicate
    history = recordChannelTune('bbc-one', history)
    expect(history).toEqual(['bbc-one'])

    // Tuning second channel
    history = recordChannelTune('itv-one', history)
    expect(history).toEqual(['bbc-one', 'itv-one'])
  })

  it('caps history stack to maxHistory entries', () => {
    let history: string[] = []
    for (let i = 1; i <= 15; i++) {
      history = recordChannelTune(`channel-${i}`, history, 5)
    }
    expect(history).toHaveLength(5)
    expect(history).toEqual([
      'channel-11',
      'channel-12',
      'channel-13',
      'channel-14',
      'channel-15',
    ])
  })

  it('retrieves previous channel ID correctly', () => {
    const history = ['sky-sports-f1', 'sky-sports-premier-league']

    // When currently watching the top channel, recalls previous one
    expect(getPreviousChannelId(history, 'sky-sports-premier-league')).toBe('sky-sports-f1')

    // Empty or single channel history cannot recall
    expect(getPreviousChannelId([])).toBeNull()
    expect(getPreviousChannelId(['only-one'])).toBeNull()
  })

  it('bounces back and forth between two channels', () => {
    let history = ['channel-a', 'channel-b']

    // Currently on channel-b -> recall to channel-a
    const recall1 = getPreviousChannelId(history, 'channel-b')
    expect(recall1).toBe('channel-a')

    // Tune to channel-a
    history = recordChannelTune('channel-a', history)
    expect(history).toEqual(['channel-a', 'channel-b', 'channel-a'])

    // Currently on channel-a -> recall to channel-b
    const recall2 = getPreviousChannelId(history, 'channel-a')
    expect(recall2).toBe('channel-b')
  })
})
