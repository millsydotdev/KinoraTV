import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import {
  getLocalLibraries,
  saveLocalLibrary,
  deleteLocalLibrary,
  scanLocalLibrary,
  getLocalMediaCatalogue,
  getStorageVolumesInfo,
  selectLocalMediaFolder,
  type LocalLibrary,
  type LocalMediaCatalogue,
  type LocalScanResult,
  type StorageVolumesSummary,
} from '../lib/native'

export interface LocalMediaState {
  libraries: LocalLibrary[]
  catalogue: LocalMediaCatalogue
  storageSummary: StorageVolumesSummary | null
  scanning: Record<string, boolean>
  lastScanResult: LocalScanResult | null
  loading: boolean
  addLibrary: (name: string, mediaType: 'movies' | 'tv', folderPath: string) => Promise<LocalLibrary | null>
  removeLibrary: (id: string) => Promise<boolean>
  scanLibrary: (id: string) => Promise<LocalScanResult | null>
  scanAllLibraries: () => Promise<void>
  chooseFolder: (defaultPath?: string) => Promise<string | null>
  refreshStorage: () => Promise<void>
  refreshCatalogue: () => Promise<void>
}

const emptyCatalogue: LocalMediaCatalogue = {
  movies: [],
  series: [],
  totalMediaBytes: 0,
}

const LocalMediaContext = createContext<LocalMediaState | null>(null)

export function LocalMediaProvider({ children }: { children: ReactNode }) {
  const [libraries, setLibraries] = useState<LocalLibrary[]>([])
  const [catalogue, setCatalogue] = useState<LocalMediaCatalogue>(emptyCatalogue)
  const [storageSummary, setStorageSummary] = useState<StorageVolumesSummary | null>(null)
  const [scanning, setScanning] = useState<Record<string, boolean>>({})
  const [lastScanResult, setLastScanResult] = useState<LocalScanResult | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshStorage = useCallback(async () => {
    try {
      const summary = await getStorageVolumesInfo()
      if (summary) {
        setStorageSummary(summary)
      }
    } catch {
      // Storage inspection fallback
    }
  }, [])

  const refreshCatalogue = useCallback(async () => {
    try {
      const cat = await getLocalMediaCatalogue()
      if (cat) {
        setCatalogue({
          movies: Array.isArray(cat.movies) ? cat.movies : [],
          series: Array.isArray(cat.series) ? cat.series : Array.isArray((cat as any).shows) ? (cat as any).shows : [],
          totalMediaBytes: typeof cat.totalMediaBytes === 'number' ? cat.totalMediaBytes : 0,
        })
      }
    } catch {
      // Catalogue loading fallback
    }
  }, [])

  const reloadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [libs, cat, storage] = await Promise.all([
        getLocalLibraries(),
        getLocalMediaCatalogue(),
        getStorageVolumesInfo(),
      ])
      if (libs) setLibraries(libs)
      if (cat) setCatalogue(cat)
      if (storage) setStorageSummary(storage)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reloadAll()
  }, [reloadAll])

  const addLibrary = useCallback(
    async (name: string, mediaType: 'movies' | 'tv', folderPath: string): Promise<LocalLibrary | null> => {
      const newLib: LocalLibrary = {
        id: `lib_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name,
        mediaType,
        folders: [folderPath],
        lastScannedAt: null,
        autoScan: true,
        scanIntervalHours: 6,
      }
      const saved = await saveLocalLibrary(newLib)
      if (saved) {
        setLibraries((prev) => [...prev.filter((l) => l.id !== newLib.id), saved])
        // Trigger initial scan in background
        scanLocalLibrary(newLib.id).then((res) => {
          if (res) {
            setLastScanResult(res)
            reloadAll()
          }
        }).catch(() => {})
        return saved
      }
      return null
    },
    [reloadAll],
  )

  const removeLibrary = useCallback(async (id: string): Promise<boolean> => {
    const ok = await deleteLocalLibrary(id)
    if (ok) {
      setLibraries((prev) => prev.filter((l) => l.id !== id))
      await reloadAll()
      return true
    }
    return false
  }, [reloadAll])

  const scanLibrary = useCallback(
    async (id: string): Promise<LocalScanResult | null> => {
      setScanning((prev) => ({ ...prev, [id]: true }))
      try {
        const res = await scanLocalLibrary(id)
        if (res) {
          setLastScanResult(res)
          await reloadAll()
        }
        return res
      } finally {
        setScanning((prev) => ({ ...prev, [id]: false }))
      }
    },
    [reloadAll],
  )

  const scanAllLibraries = useCallback(async () => {
    for (const lib of libraries) {
      await scanLibrary(lib.id)
    }
  }, [libraries, scanLibrary])

  const chooseFolder = useCallback(async (defaultPath?: string): Promise<string | null> => {
    return selectLocalMediaFolder(defaultPath)
  }, [])

  const value: LocalMediaState = {
    libraries,
    catalogue,
    storageSummary,
    scanning,
    lastScanResult,
    loading,
    addLibrary,
    removeLibrary,
    scanLibrary,
    scanAllLibraries,
    chooseFolder,
    refreshStorage,
    refreshCatalogue,
  }

  return <LocalMediaContext.Provider value={value}>{children}</LocalMediaContext.Provider>
}

const defaultLocalMediaState: LocalMediaState = {
  libraries: [],
  catalogue: emptyCatalogue,
  storageSummary: null,
  scanning: {},
  lastScanResult: null,
  loading: false,
  addLibrary: async () => null,
  removeLibrary: async () => false,
  scanLibrary: async () => null,
  scanAllLibraries: async () => {},
  chooseFolder: async () => null,
  refreshStorage: async () => {},
  refreshCatalogue: async () => {},
}

export function useLocalMedia(): LocalMediaState {
  const ctx = useContext(LocalMediaContext)
  return ctx || defaultLocalMediaState
}
