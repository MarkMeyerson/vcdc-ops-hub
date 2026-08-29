'use client'

import type { Roster } from '@/lib/scan/resolve'

// On-device storage for ride sign-in.
//
// The rule this file exists to enforce (brief Section 9): a leader offline
// for hours has an expired access token, and an auth failure must never be
// able to destroy local attendance. Every scan is written here before
// anything is sent anywhere. Losing 22 scanned riders to a login redirect is
// the worst failure this system can have, so the network is treated as a
// nice-to-have that catches up later, never as the place a scan lives.
//
// Raw IndexedDB, no wrapper library: the surface used here is four calls
// wide and a dependency that ships its own version of "did this write land"
// is not worth it for that.

const DB_NAME = 'vcdc-ride'
const DB_VERSION = 1
const META_STORE = 'meta'
const SCAN_STORE = 'scans'
const ROSTER_KEY = 'roster'

export type ScanRecord = {
  // `${rideId}|${key}`. Deduplicates a rider rescanned at the back of the
  // queue without needing a read before every write.
  id: string
  rideId: string
  key: string
  raw: string
  name: string
  detail: string
  scannedAt: number
  // True when the phone had no signal at the moment of the scan. Carried
  // through to ride_attendance.scanned_offline so the club can tell a
  // verified check-in from an optimistic one.
  offline: boolean
  synced: boolean
  // Set when the server accepted the ride but could not resolve this code.
  // The row stays on the phone and stays on the leader's screen.
  rejected: string | null
}

// A phone in private browsing, or with site data blocked, throws on open.
// That must not take the scanner down: the session then runs in memory,
// which is worse than IndexedDB and still far better than nothing, and the
// UI says so rather than quietly pretending it is durable.
let memoryFallback = false
const memoryScans = new Map<string, ScanRecord>()
let memoryRoster: Roster | null = null

export function usingMemoryFallback(): boolean {
  return memoryFallback
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      memoryFallback = true
      resolve(null)
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      memoryFallback = true
      resolve(null)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE)
      }
      if (!db.objectStoreNames.contains(SCAN_STORE)) {
        const store = db.createObjectStore(SCAN_STORE, { keyPath: 'id' })
        store.createIndex('rideId', 'rideId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      memoryFallback = true
      resolve(null)
    }
    request.onblocked = () => {
      memoryFallback = true
      resolve(null)
    }
  })

  return dbPromise
}

function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null)
          return
        }
        try {
          const tx = db.transaction(storeName, mode)
          const request = work(tx.objectStore(storeName))
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => resolve(null)
        } catch {
          memoryFallback = true
          resolve(null)
        }
      })
  )
}

// ---------- Roster ----------

export async function saveRoster(roster: Roster): Promise<void> {
  memoryRoster = roster
  await run(META_STORE, 'readwrite', (store) => store.put(roster, ROSTER_KEY))
}

export async function loadRoster(): Promise<Roster | null> {
  const stored = await run<Roster>(META_STORE, 'readonly', (store) =>
    store.get(ROSTER_KEY)
  )
  if (stored) return stored
  return memoryRoster
}

// ---------- Scans ----------

// Write first, ask questions later. Everything that reaches the network goes
// through here on the way in.
export async function putScan(record: ScanRecord): Promise<void> {
  memoryScans.set(record.id, record)
  await run(SCAN_STORE, 'readwrite', (store) => store.put(record))
}

export async function listScans(rideId: string): Promise<ScanRecord[]> {
  const stored = await run<ScanRecord[]>(SCAN_STORE, 'readonly', (store) =>
    store.index('rideId').getAll(rideId)
  )
  const rows = stored ?? [...memoryScans.values()].filter((s) => s.rideId === rideId)
  return rows.sort((a, b) => b.scannedAt - a.scannedAt)
}

export async function updateScans(records: ScanRecord[]): Promise<void> {
  for (const record of records) {
    memoryScans.set(record.id, record)
  }
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(SCAN_STORE, 'readwrite')
      const store = tx.objectStore(SCAN_STORE)
      for (const record of records) store.put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function deleteScan(id: string): Promise<void> {
  memoryScans.delete(id)
  await run(SCAN_STORE, 'readwrite', (store) => store.delete(id))
}

// Only ever called after the server has confirmed the ride is submitted.
// Never called to tidy up, never called on an error path.
export async function clearRide(rideId: string): Promise<void> {
  const rows = await listScans(rideId)
  for (const row of rows) await deleteScan(row.id)
}
