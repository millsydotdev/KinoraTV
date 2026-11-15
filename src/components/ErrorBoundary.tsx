import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Icon } from './Icon'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode)
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  onReset?: () => void
  variant?: 'page' | 'inline'
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/** Redacts URLs, tokens, queries, and credentials from user-facing error text. */
function sanitizeErrorMessage(msg: string): string {
  return msg
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[redacted URL]')
    .replace(/[a-zA-Z0-9_-]{32,}/g, '[redacted token]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted address]')
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  reset = (): void => {
    if (this.props.onReset) {
      this.props.onReset()
    }
    this.setState({ hasError: false, error: null })
  }

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.reset)
      }
      if (this.props.fallback) {
        return this.props.fallback
      }

      const safeMessage = sanitizeErrorMessage(this.state.error.message || 'An unexpected application error occurred.')

      if (this.props.variant === 'inline') {
        return (
          <div
            className="state state-inline"
            role="alert"
            style={{
              padding: '16px 20px',
              background: 'rgba(229, 9, 20, 0.08)',
              borderRadius: 'var(--r-m, 8px)',
              border: '1px solid rgba(229, 9, 20, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              margin: '12px 0',
            }}
          >
            <Icon name="warning" size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: '0.875rem', marginBottom: '2px' }}>
                Component Error
              </strong>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>{safeMessage}</span>
            </div>
            <button type="button" className="btn btn-secondary btn-small" onClick={this.reset}>
              Retry
            </button>
          </div>
        )
      }

      return (
        <div className="state" role="alert" style={{ margin: '48px auto', maxWidth: '480px', padding: '32px' }}>
          <span className="icon-mark">
            <Icon name="warning" size={32} />
          </span>
          <h3>Something went wrong</h3>
          <p>{safeMessage}</p>
          <div className="state-action" style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" onClick={this.reset}>
              Try again
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                this.reset()
                if (window.history.length > 1) {
                  window.history.back()
                } else {
                  window.location.href = '/'
                }
              }}
            >
              Go back
            </button>
            <a href="/" className="btn btn-primary" onClick={() => this.reset()}>
              Return to Home
            </a>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
