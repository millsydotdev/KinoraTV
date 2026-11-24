/**
 * React State Hook for Media Servers in Kinora.
 *
 * Provides reactive access to connected Jellyfin, Emby, and Plex servers,
 * cached library items, and playback synchronization.
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  mediaServerManager,
  type MediaServerConfig,
  type MediaServerItem,
  type PlaybackProgressUpdate,
} from '../lib/mediaServer'

export function useMediaServers() {
  const [servers, setServers] = useState<MediaServerConfig[]>(() => mediaServerManager.loadServers())
  const [items, setItems] = useState<MediaServerItem[]>(() => mediaServerManager.getCachedItems())
  const [isLoading, setIsLoading] = useState(false)

  const reload = useCallback(() => {
    setServers(mediaServerManager.loadServers())
    setItems(mediaServerManager.getCachedItems())
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const syncAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const activeServers = mediaServerManager.loadServers()
      for (const s of activeServers) {
        await mediaServerManager.syncServer(s.id)
      }
      reload()
    } finally {
      setIsLoading(false)
    }
  }, [reload])

  const syncServer = useCallback(async (serverId: string) => {
    setIsLoading(true)
    try {
      await mediaServerManager.syncServer(serverId)
      reload()
    } finally {
      setIsLoading(false)
    }
  }, [reload])

  const reportProgress = useCallback(async (serverId: string, update: PlaybackProgressUpdate) => {
    await mediaServerManager.reportProgress(serverId, update)
  }, [])

  return {
    servers,
    items,
    isLoading,
    reload,
    syncAll,
    syncServer,
    reportProgress,
  }
}
