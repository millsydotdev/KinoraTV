import { describe, expect, it } from 'vitest'
import { GamepadController, type GamepadAction } from './gamepadNav'

describe('gamepadNav', () => {
  it('detects directional input and triggers action callbacks', () => {
    const actions: GamepadAction[] = []
    const controller = new GamepadController({
      onAction: (act) => actions.push(act),
      repeatIntervalMs: 0,
    })

    // Simulate D-pad Down press
    const mockGamepad = {
      buttons: [
        { pressed: false }, // 0
        { pressed: false }, // 1
        { pressed: false }, // 2
        { pressed: false }, // 3
        { pressed: false }, // 4
        { pressed: false }, // 5
        { pressed: false }, // 6
        { pressed: false }, // 7
        { pressed: false }, // 8
        { pressed: false }, // 9
        { pressed: false }, // 10
        { pressed: false }, // 11
        { pressed: false }, // 12 (Up)
        { pressed: true },  // 13 (Down)
        { pressed: false }, // 14 (Left)
        { pressed: false }, // 15 (Right)
      ],
      axes: [0, 0],
    }

    controller.evaluateGamepadState(mockGamepad)
    expect(actions).toEqual(['down'])
  })

  it('detects analog stick navigation past deadzone', () => {
    const actions: GamepadAction[] = []
    const controller = new GamepadController({
      onAction: (act) => actions.push(act),
      repeatIntervalMs: 0,
    })

    // Analog stick right (axes[0] = 0.8)
    const mockGamepad = {
      buttons: new Array(16).fill({ pressed: false }),
      axes: [0.8, 0.0],
    }

    controller.evaluateGamepadState(mockGamepad)
    expect(actions).toEqual(['right'])
  })

  it('maps face buttons and bumpers to actions', () => {
    const actions: GamepadAction[] = []
    const controller = new GamepadController({
      onAction: (act) => actions.push(act),
      repeatIntervalMs: 0,
    })

    // Press A / Select (button 0)
    const selectPad = {
      buttons: [{ pressed: true }, ...new Array(15).fill({ pressed: false })],
      axes: [0, 0],
    }
    controller.evaluateGamepadState(selectPad)
    expect(actions).toContain('select')

    // Press Y / Recall (button 3)
    const recallPad = {
      buttons: [
        { pressed: false },
        { pressed: false },
        { pressed: false },
        { pressed: true },
        ...new Array(12).fill({ pressed: false }),
      ],
      axes: [0, 0],
    }
    controller.evaluateGamepadState(recallPad)
    expect(actions).toContain('recall')
  })
})
