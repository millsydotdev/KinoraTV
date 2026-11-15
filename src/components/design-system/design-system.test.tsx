// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Button,
  Badge,
  Input,
  Select,
  Checkbox,
  Modal,
  Tabs,
  Card,
  Tooltip,
} from './index'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Design System Primitives', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
    vi.restoreAllMocks()
  })

  describe('Button', () => {
    it('renders with label and handles clicks', async () => {
      const handleClick = vi.fn()
      await act(async () => {
        root.render(<Button onClick={handleClick}>Click Me</Button>)
      })
      const btn = host.querySelector('button')!
      expect(btn).not.toBeNull()
      expect(btn.textContent).toContain('Click Me')
      btn.click()
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('renders disabled state and loading spinner', async () => {
      await act(async () => {
        root.render(<Button loading>Saving</Button>)
      })
      const btn = host.querySelector('button')!
      expect(btn.hasAttribute('disabled')).toBe(true)
      expect(btn.getAttribute('aria-busy')).toBe('true')
      expect(host.querySelector('.ds-btn-spinner')).not.toBeNull()
    })
  })

  describe('Badge', () => {
    it('renders tone and children', async () => {
      await act(async () => {
        root.render(<Badge tone="emerald">Active</Badge>)
      })
      const badge = host.querySelector('.ds-badge-emerald')!
      expect(badge).not.toBeNull()
      expect(badge.textContent).toContain('Active')
    })
  })

  describe('Input', () => {
    it('renders input with label and helper text', async () => {
      await act(async () => {
        root.render(
          <Input
            label="Email Address"
            helperText="We will never share your email."
            placeholder="user@example.com"
          />,
        )
      })
      const label = host.querySelector('.ds-field-label')!
      expect(label.textContent).toBe('Email Address')
      const helper = host.querySelector('.ds-field-helper')!
      expect(helper.textContent).toBe('We will never share your email.')
      const input = host.querySelector('input')!
      expect(input.placeholder).toBe('user@example.com')
    })

    it('renders error message with alert role', async () => {
      await act(async () => {
        root.render(
          <Input
            label="Password"
            error="Password is required"
          />,
        )
      })
      const errorMsg = host.querySelector('[role="alert"]')!
      expect(errorMsg.textContent).toBe('Password is required')
      const input = host.querySelector('input')!
      expect(input.getAttribute('aria-invalid')).toBe('true')
    })

    it('supports clearable button', async () => {
      const handleClear = vi.fn()
      await act(async () => {
        root.render(
          <Input
            label="Search"
            value="something"
            clearable
            onClear={handleClear}
            onChange={() => {}}
          />,
        )
      })
      const clearBtn = host.querySelector('[aria-label="Clear input"]') as HTMLButtonElement
      expect(clearBtn).not.toBeNull()
      clearBtn.click()
      expect(handleClear).toHaveBeenCalledTimes(1)
    })
  })

  describe('Select', () => {
    it('renders options and responds to selection', async () => {
      const handleChange = vi.fn()
      await act(async () => {
        root.render(
          <Select
            label="Resolution"
            value="1080p"
            onChange={handleChange}
            options={[
              { value: '720p', label: '720p HD' },
              { value: '1080p', label: '1080p Full HD' },
              { value: '2160p', label: '4K Ultra HD' },
            ]}
          />,
        )
      })
      const select = host.querySelector('select')!
      expect(select.value).toBe('1080p')
      select.value = '2160p'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      expect(handleChange).toHaveBeenCalled()
    })
  })

  describe('Checkbox', () => {
    it('renders accessible label and toggles checked state', async () => {
      const handleChange = vi.fn()
      await act(async () => {
        root.render(
          <Checkbox
            label="Enable Subtitles"
            checked={false}
            onChange={handleChange}
          />,
        )
      })
      const chk = host.querySelector('input[type="checkbox"]') as HTMLInputElement
      expect(chk.checked).toBe(false)
      chk.click()
      expect(handleChange).toHaveBeenCalledTimes(1)
    })
  })

  describe('Modal', () => {
    it('renders dialog with title, body, and footer when open', async () => {
      const handleClose = vi.fn()
      await act(async () => {
        root.render(
          <Modal
            isOpen={true}
            onClose={handleClose}
            title="Confirm Action"
            description="Are you sure you want to proceed?"
            footer={<button type="button" onClick={handleClose}>Dismiss</button>}
          >
            <p>Dialog body content</p>
          </Modal>,
        )
      })
      const dialog = host.querySelector('[role="dialog"]')!
      expect(dialog).not.toBeNull()
      expect(host.querySelector('.ds-modal-title')?.textContent).toBe('Confirm Action')
      expect(host.querySelector('.ds-modal-body')?.textContent).toContain('Dialog body content')

      const closeBtn = host.querySelector('.ds-modal-close-btn') as HTMLButtonElement
      expect(closeBtn).not.toBeNull()
      closeBtn.click()
      expect(handleClose).toHaveBeenCalledTimes(1)
    })

    it('does not render when isOpen is false', async () => {
      await act(async () => {
        root.render(
          <Modal isOpen={false} onClose={() => {}}>
            <p>Hidden content</p>
          </Modal>,
        )
      })
      expect(host.querySelector('[role="dialog"]')).toBeNull()
    })
  })

  describe('Tabs', () => {
    it('renders accessible tab list and triggers tab switch', async () => {
      const handleTabChange = vi.fn()
      await act(async () => {
        root.render(
          <Tabs
            activeId="tab-2"
            onChange={handleTabChange}
            items={[
              { id: 'tab-1', label: 'First Tab', count: 5 },
              { id: 'tab-2', label: 'Second Tab', count: 12 },
              { id: 'tab-3', label: 'Third Tab' },
            ]}
          />,
        )
      })
      const tablist = host.querySelector('[role="tablist"]')!
      expect(tablist).not.toBeNull()

      const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      expect(tabs).toHaveLength(3)
      expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')

      tabs[0]?.click()
      expect(handleTabChange).toHaveBeenCalledWith('tab-1')
    })
  })

  describe('Card', () => {
    it('renders with header, body, and footer', async () => {
      await act(async () => {
        root.render(
          <Card
            header={<h3>Card Title</h3>}
            footer={<span>Card Footer</span>}
          >
            <p>Card Body</p>
          </Card>,
        )
      })
      expect(host.querySelector('.ds-card-header')?.textContent).toBe('Card Title')
      expect(host.querySelector('.ds-card-body')?.textContent).toBe('Card Body')
      expect(host.querySelector('.ds-card-footer')?.textContent).toBe('Card Footer')
    })
  })

  describe('Tooltip', () => {
    it('reveals tooltip on focus and hides on blur', async () => {
      await act(async () => {
        root.render(
          <Tooltip content="Helpful information" position="top">
            <button type="button">Focus me</button>
          </Tooltip>,
        )
      })
      expect(host.querySelector('[role="tooltip"]')).toBeNull()

      const button = host.querySelector('button')!
      await act(async () => {
        button.focus()
      })
      expect(host.querySelector('[role="tooltip"]')?.textContent).toBe('Helpful information')

      await act(async () => {
        button.blur()
      })
      expect(host.querySelector('[role="tooltip"]')).toBeNull()
    })
  })
})
