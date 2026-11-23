// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DownloadsModal } from './DownloadsModal'
import * as nativeModule from '../lib/native'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../lib/native', async (importOriginal) => {
  const actual = await importOriginal<typeof nativeModule>()
  return {
    ...actual,
    getDownloads: vi.fn(),
    pauseDownload: vi.fn(),
    resumeDownload: vi.fn(),
    cancelDownload: vi.fn(),
    deleteDownload: vi.fn(),
  }
})

describe('DownloadsModal', () => {
  let root: Root
  let host: HTMLDivElement

  const mockItems: nativeModule.DownloadItem[] = [
    {
      id: 'dl-1',
      url: 'http://example.com/movie1.mp4',
      title: 'Interstellar',
      kind: 'movie',
      extension: 'mp4',
      artworkUrl: 'http://example.com/interstellar.jpg',
      status: 'downloading',
      downloadedBytes: 500_000_000,
      totalBytes: 2_000_000_000,
      speedBps: 2_500_000,
      etaSeconds: 600,
      errorMessage: null,
      filePath: '/tmp/dl-1/video.mp4',
      createdAt: 1000,
      completedAt: null,
    },
    {
      id: 'dl-2',
      url: 'http://example.com/movie2.mp4',
      title: 'Dune: Part Two',
      kind: 'movie',
      extension: 'mp4',
      artworkUrl: null,
      status: 'completed',
      downloadedBytes: 3_000_000_000,
      totalBytes: 3_000_000_000,
      speedBps: 0,
      etaSeconds: null,
      errorMessage: null,
      filePath: '/tmp/dl-2/video.mp4',
      createdAt: 1000,
      completedAt: 2000,
    },
    {
      id: 'dl-3',
      url: 'http://example.com/ep1.mkv',
      title: 'Severance S01E01',
      kind: 'episode',
      extension: 'mkv',
      artworkUrl: null,
      status: 'paused',
      downloadedBytes: 150_000_000,
      totalBytes: 1_000_000_000,
      speedBps: 0,
      etaSeconds: null,
      errorMessage: null,
      filePath: '/tmp/dl-3/video.mkv',
      createdAt: 1000,
      completedAt: null,
    },
  ]

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    vi.mocked(nativeModule.getDownloads).mockResolvedValue(mockItems)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
    vi.clearAllMocks()
  })

  it('does not render when open is false', () => {
    act(() => {
      root.render(<DownloadsModal open={false} onClose={vi.fn()} />)
    })
    expect(host.innerHTML).toBe('')
  })

  it('renders modal dialog and displays all downloads', async () => {
    await act(async () => {
      root.render(<DownloadsModal open={true} onClose={vi.fn()} />)
    })

    expect(host.querySelector('.downloads-modal')).not.toBeNull()
    expect(host.textContent).toContain('Downloads & Offline Playback')
    expect(host.textContent).toContain('Interstellar')
    expect(host.textContent).toContain('Dune: Part Two')
    expect(host.textContent).toContain('Severance S01E01')
    expect(host.textContent).toContain('Downloading')
    expect(host.textContent).toContain('Completed')
    expect(host.textContent).toContain('Paused')
  })

  it('filters items by Active and Completed tabs', async () => {
    await act(async () => {
      root.render(<DownloadsModal open={true} onClose={vi.fn()} />)
    })

    const tabs = host.querySelectorAll('.downloads-tab') as NodeListOf<HTMLButtonElement>
    expect(tabs).toHaveLength(3)

    // Click "In Progress" tab
    await act(async () => {
      tabs[1]?.click()
    })

    expect(host.textContent).toContain('Interstellar')
    expect(host.textContent).toContain('Severance S01E01')
    expect(host.textContent).not.toContain('Dune: Part Two')

    // Click "Completed" tab
    await act(async () => {
      tabs[2]?.click()
    })

    expect(host.textContent).toContain('Dune: Part Two')
    expect(host.textContent).not.toContain('Interstellar')
    expect(host.textContent).not.toContain('Severance S01E01')
  })

  it('triggers pause and resume operations', async () => {
    await act(async () => {
      root.render(<DownloadsModal open={true} onClose={vi.fn()} />)
    })

    // Pause Interstellar
    const pauseBtn = host.querySelector('button[title="Pause download"]') as HTMLButtonElement
    expect(pauseBtn).not.toBeNull()

    await act(async () => {
      pauseBtn.click()
    })

    expect(nativeModule.pauseDownload).toHaveBeenCalledWith('dl-1')

    // Resume Severance
    const resumeBtn = host.querySelector('button[title="Resume download"]') as HTMLButtonElement
    expect(resumeBtn).not.toBeNull()

    await act(async () => {
      resumeBtn.click()
    })

    expect(nativeModule.resumeDownload).toHaveBeenCalledWith('dl-3')
  })

  it('triggers delete operation', async () => {
    await act(async () => {
      root.render(<DownloadsModal open={true} onClose={vi.fn()} />)
    })

    const deleteBtns = host.querySelectorAll('.download-delete-btn') as NodeListOf<HTMLButtonElement>
    expect(deleteBtns.length).toBeGreaterThan(0)

    await act(async () => {
      deleteBtns[0]?.click()
    })

    expect(nativeModule.deleteDownload).toHaveBeenCalledWith('dl-1')
  })

  it('triggers onPlayItem with offline stream URI on completed item click', async () => {
    const onPlay = vi.fn()
    await act(async () => {
      root.render(<DownloadsModal open={true} onClose={vi.fn()} onPlayItem={onPlay} />)
    })

    const playBtn = host.querySelector('button[title="Play offline stream"]') as HTMLButtonElement
    expect(playBtn).not.toBeNull()

    await act(async () => {
      playBtn.click()
    })

    expect(onPlay).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dl-2', title: 'Dune: Part Two' }),
      'kstream://localhost/downloads/dl-2/video.mp4'
    )
  })

  it('renders empty state when no items match', async () => {
    vi.mocked(nativeModule.getDownloads).mockResolvedValue([])

    await act(async () => {
      root.render(<DownloadsModal open={true} onClose={vi.fn()} />)
    })

    expect(host.textContent).toContain('No downloads saved on this device')
  })
})
