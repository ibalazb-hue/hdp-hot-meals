/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { flushQueue, pullBundle } from './submit'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('sync', (event) => {
  const syncEvent = event as ExtendableEvent & { tag?: string }
  if (syncEvent.tag === 'hdp-scans') {
    syncEvent.waitUntil(
      flushQueue()
        .then(() => pullBundle())
        .catch(() => undefined),
    )
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'FLUSH_SCANS') {
    event.waitUntil(
      flushQueue()
        .then(() => pullBundle())
        .catch(() => undefined),
    )
  }
})
