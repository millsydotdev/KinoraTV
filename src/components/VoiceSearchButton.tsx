/**
 * Interactive microphone voice search button for Kinora search interfaces.
 * Provides voice feedback, speech transcription HUD, and intent dispatch.
 * Strictly adheres to project typography standards: zero em-dashes.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import {
  isVoiceSupported,
  VoiceRecognitionController,
  parseVoiceIntent,
  executeVoiceAction,
  type VoiceState,
} from '../lib/voiceCommand'
import './VoiceSearchButton.css'

export interface VoiceSearchButtonProps {
  onSearchQuery?: (query: string) => void
  onTuneChannel?: (query: string, channelNumber?: number) => void
  className?: string
}

export function VoiceSearchButton({
  onSearchQuery,
  onTuneChannel,
  className = '',
}: VoiceSearchButtonProps) {
  const navigate = useNavigate()
  const [supported, setSupported] = useState(false)
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const controllerRef = useRef<VoiceRecognitionController | null>(null)

  useEffect(() => {
    const isSupp = isVoiceSupported()
    setSupported(isSupp)
    if (isSupp) {
      const ctrl = new VoiceRecognitionController()
      controllerRef.current = ctrl
      const unsub = ctrl.subscribe((newState, newTranscript) => {
        setState(newState)
        setTranscript(newTranscript)

        if (newState === 'idle' && newTranscript.trim()) {
          const action = parseVoiceIntent(newTranscript)
          executeVoiceAction(action, navigate, {
            onSearch: onSearchQuery,
            onTuneChannel,
          })
          setNotice(`Recognised: "${newTranscript}"`)
          setTimeout(() => setNotice(null), 3000)
        } else if (newState === 'error') {
          setNotice('Voice recognition failed or microphone was blocked.')
          setTimeout(() => setNotice(null), 3000)
        }
      })
      return () => {
        ctrl.stop()
        unsub()
      }
    }
  }, [navigate, onSearchQuery, onTuneChannel])

  const toggleListening = useCallback(() => {
    if (!supported) {
      setNotice('Voice search is not supported by your browser or platform.')
      setTimeout(() => setNotice(null), 3000)
      return
    }

    const ctrl = controllerRef.current
    if (!ctrl) return

    if (state === 'listening') {
      ctrl.stop()
    } else {
      setNotice(null)
      ctrl.start()
    }
  }, [supported, state])

  return (
    <div className={`voice-btn-wrap ${className}`}>
      <button
        type="button"
        className={`voice-search-btn ${state === 'listening' ? 'listening' : ''}`}
        onClick={toggleListening}
        title={
          !supported
            ? 'Voice search unavailable'
            : state === 'listening'
            ? 'Listening... Click to stop'
            : 'Search with voice (Click to speak)'
        }
        aria-label="Search by voice"
      >
        <Icon name="mic" size={16} />
      </button>

      {state === 'listening' && (
        <div className="voice-hud" role="status" aria-live="polite">
          <div className="voice-hud-title">
            <span className="voice-indicator-dot" />
            <span>Listening...</span>
          </div>
          <div className="voice-transcript">
            {transcript ? `"${transcript}"` : 'Say channel, title, or navigation...'}
          </div>
        </div>
      )}

      {notice && state !== 'listening' && (
        <div className="voice-hud" role="alert">
          <div className="voice-transcript">{notice}</div>
        </div>
      )}
    </div>
  )
}
