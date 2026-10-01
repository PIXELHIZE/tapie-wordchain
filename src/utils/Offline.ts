import { createWordEngine, type WordEngine } from "../../worker/engine.ts"
import { getTranscript, type LocalRun } from "../../shared/run.ts"
import type { RankingEntry, RankingResult } from "../../shared/game.ts"
import { synchronizeRecords, type SavedRecord, type QueueStore } from "./SyncQueue.ts"

const DICTIONARY_CACHE = "tapie-dictionary-v2"
const RUN_KEY = "wordchain-run-v2"
const RANK_KEY = "wordchain-rankings-v2"
const MODE_KEY = "wordchain-local-mode"
let manual = false
let connected = true
let syncing: Promise<void> | null = null
let enginePromise: Promise<WordEngine> | null = null
const changed = () => window.dispatchEvent(new Event("wordchain-sync"))
try { manual = localStorage.getItem(MODE_KEY) === "true" } catch { /* Optional preference. */ }

export const connectionState = () => ({ manual, connected })
export const setLocalMode = (value: boolean) => {
  manual = value
  try { localStorage.setItem(MODE_KEY, String(value)) } catch { /* Optional preference. */ }
  changed()
  if (!value) void syncRankings()
}
const readJson = <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback } catch { return fallback } }
export const restoreRun = (): LocalRun | null => {
  const run = readJson<LocalRun | null>(RUN_KEY, null)
  return run?.game?.id && Array.isArray(run.attempts) && Number.isFinite(run.turnStartedAt) ? run : null
}
export const persistRun = (run: LocalRun | null) => { try { if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run)); else localStorage.removeItem(RUN_KEY) } catch { /* Gameplay still works if browser storage is full. */ } }
export const cachedRankings = () => readJson<RankingEntry[]>(RANK_KEY, [])
const cacheRankings = (entries: RankingEntry[]) => { try { localStorage.setItem(RANK_KEY, JSON.stringify(entries)) } catch { /* Optional cache. */ } }

let database: Promise<IDBDatabase> | null = null
const db = () => database ??= new Promise((resolve, reject) => {
  const request = indexedDB.open("tapie-offline-v2", 1)
  request.onupgradeneeded = () => request.result.createObjectStore("records", { keyPath: "id" })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => { database = null; reject(request.error) }
})
const records: QueueStore = {
  all: async () => new Promise<SavedRecord[]>((resolve, reject) => {
    void db().then((database) => {
      const request = database.transaction("records").objectStore("records").getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    }).catch(reject)
  }),
  put: async (record) => new Promise<void>((resolve, reject) => {
    void db().then((database) => {
      const transaction = database.transaction("records", "readwrite")
      transaction.objectStore("records").put(record)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    }).catch(reject)
  }),
}

export const loadLocalEngine = () => enginePromise ??= (async () => {
  let cache: Cache | undefined
  try { cache = await caches.open(DICTIONARY_CACHE) } catch { /* In-memory mode still works. */ }
  let response = await cache?.match("/dictionary.json")
  if (!response) {
    response = await fetch("/dictionary.json", { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error("사전을 내려받지 못했어요. 처음 한 번은 연결이 필요해요.")
    await cache?.put("/dictionary.json", response.clone())
  }
  const words: string[] = await response.json()
  return createWordEngine(words)
})().catch((error) => { enginePromise = null; throw error })

class RankingFailure extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
const fetchRanking = async (path: string, body?: unknown) => {
  const response = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(3000) })
  const value = await response.json()
  if (!response.ok) throw new RankingFailure(value.error || "기록을 등록하지 못했어요.", response.status)
  return value
}
export const refreshRankings = async () => {
  if (manual) return cachedRankings()
  try {
    const { rankings } = await fetchRanking("/api/rankings") as { rankings: RankingEntry[] }
    cacheRankings(rankings); connected = true
  } catch { connected = false }
  changed()
  return cachedRankings()
}
export const pendingRankings = async (): Promise<RankingEntry[]> => (await records.all()).filter((record) => !record.result && !record.error).map((record) => ({ rank: 0, nickname: record.nickname, score: record.score, createdAt: record.createdAt, pending: true }))
export const registrationFor = async (id: string) => {
  const record = (await records.all()).find((record) => record.id === id)
  if (record?.error) throw new Error(record.error)
  return record ? record.result?.entry ?? { rank: 0, nickname: record.nickname, score: record.score, createdAt: record.createdAt, pending: true } : null
}
export const queueRanking = async (run: LocalRun, nicknameInput: string) => {
  const nickname = nicknameInput.trim().normalize("NFC")
  if (!/^[가-힣a-zA-Z0-9_ ]{1,12}$/u.test(nickname)) throw new Error("닉네임은 한글·영문·숫자로 1~12자 입력해 주세요.")
  const existing = (await records.all()).find((record) => record.id === run.game.id)
  if (!existing) await records.put({ id: run.game.id, nickname, transcript: getTranscript(run), score: run.game.score, createdAt: Date.now() })
  try { localStorage.setItem("wordchain-nickname", nickname) } catch { /* Optional preference. */ }
  changed()
  void syncRankings()
  return registrationFor(run.game.id)
}
export const syncRankings = () => {
  if (manual) return Promise.resolve()
  if (syncing) return syncing
  syncing = (async () => {
    connected = await synchronizeRecords(records, async (record) => {
      const result = await fetchRanking("/api/local-ranking", { nickname: record.nickname, transcript: record.transcript }) as RankingResult
      cacheRankings(result.rankings)
      return result
    }, (error) => error instanceof RankingFailure && error.status >= 400 && error.status < 500 ? error.message : undefined)
    await refreshRankings()
  })().catch(() => { connected = false }).finally(() => { syncing = null; changed() })
  return syncing
}

export const prepareOfflineShell = async () => {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return false
  const registration = await navigator.serviceWorker.register("/sw.js")
  const worker = registration.installing || registration.waiting
  if (worker && worker.state !== "activated") await new Promise<void>((resolve, reject) => {
    worker.addEventListener("statechange", () => { if (worker.state === "activated") resolve(); if (worker.state === "redundant") reject(new Error("오프라인 화면을 저장하지 못했어요.")) })
  })
  return true
}
