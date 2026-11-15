import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { ProgressBar } from './design-system/Feedback'
import './BackgroundTaskCenter.css'

export interface BackgroundTask {
  id: string
  name: string
  stage: string
  progress?: number // 0-100 or undefined for indeterminate
  status: 'running' | 'completed' | 'failed'
  startedAt: number
  completedAt?: number
  error?: string
}

interface BackgroundTaskContextType {
  tasks: BackgroundTask[]
  activeTasks: BackgroundTask[]
  startTask: (name: string, initialStage: string, progress?: number) => string
  updateTask: (id: string, updates: { stage?: string; progress?: number }) => void
  completeTask: (id: string) => void
  failTask: (id: string, error: string) => void
  clearCompleted: () => void
}

const BackgroundTaskContext = createContext<BackgroundTaskContextType | null>(null)

export function BackgroundTaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([])

  const startTask = useCallback((name: string, initialStage: string, progress?: number): string => {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const newTask: BackgroundTask = {
      id,
      name,
      stage: initialStage,
      progress,
      status: 'running',
      startedAt: Date.now(),
    }
    setTasks((prev) => [newTask, ...prev])
    return id
  }, [])

  const updateTask = useCallback((id: string, updates: { stage?: string; progress?: number }) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    )
  }, [])

  const completeTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'completed', completedAt: Date.now(), progress: 100 } : t)),
    )
  }, [])

  const failTask = useCallback((id: string, error: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: 'failed', completedAt: Date.now(), error } : t)),
    )
  }, [])

  const clearCompleted = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status === 'running'))
  }, [])

  const activeTasks = tasks.filter((t) => t.status === 'running')

  return (
    <BackgroundTaskContext.Provider
      value={{
        tasks,
        activeTasks,
        startTask,
        updateTask,
        completeTask,
        failTask,
        clearCompleted,
      }}
    >
      {children}
    </BackgroundTaskContext.Provider>
  )
}

const defaultBackgroundTaskContext: BackgroundTaskContextType = {
  tasks: [],
  activeTasks: [],
  startTask: () => 'stub',
  updateTask: () => {},
  completeTask: () => {},
  failTask: () => {},
  clearCompleted: () => {},
}

export function useBackgroundTasks() {
  const ctx = useContext(BackgroundTaskContext)
  return ctx ?? defaultBackgroundTaskContext
}

export function BackgroundTaskTrigger() {
  const { tasks, activeTasks, clearCompleted } = useBackgroundTasks()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (tasks.length === 0) return null

  return (
    <div className="ds-task-center" ref={box}>
      <button
        type="button"
        className={`icon-btn ds-task-btn ${activeTasks.length > 0 ? 'is-active' : ''}`}
        aria-label={`Background tasks, ${activeTasks.length} running`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="radar" size={18} className={activeTasks.length > 0 ? 'ds-task-spin' : ''} />
        {activeTasks.length > 0 && <span className="ds-task-badge">{activeTasks.length}</span>}
      </button>

      {open && (
        <div className="ds-task-pop" role="group" aria-label="Background Tasks">
          <div className="ds-task-pop-header">
            <strong>Background Tasks</strong>
            {tasks.some((t) => t.status !== 'running') && (
              <button type="button" className="ds-task-clear-btn" onClick={clearCompleted}>
                Clear finished
              </button>
            )}
          </div>

          <ul className="ds-task-list">
            {tasks.map((t) => (
              <li key={t.id} className={`ds-task-item ds-task-item-${t.status}`}>
                <div className="ds-task-item-header">
                  <span className="ds-task-item-name">{t.name}</span>
                  <span className={`ds-task-status-pill ds-task-pill-${t.status}`}>
                    {t.status === 'running' ? 'Active' : t.status === 'completed' ? 'Done' : 'Failed'}
                  </span>
                </div>
                <span className="ds-task-item-stage">{t.error ?? t.stage}</span>
                {t.status === 'running' && (
                  <ProgressBar progress={t.progress} className="ds-task-progress" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
