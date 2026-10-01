import type { GameSnapshot, RankingEntry, RankingResult } from "../../shared/game"

export class ApiError extends Error {
  game?: GameSnapshot
  constructor(message: string, game?: GameSnapshot) { super(message); this.game = game }
}

const request = async <T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
  })
  const data = await response.json()
  if (!response.ok) throw new ApiError(data.error || "요청을 처리하지 못했어요.", data.game)
  return data as T
}

export const startGameRequest = (signal: AbortSignal) => request<{ game: GameSnapshot }>("/api/games", {}, signal)
export const submitWordRequest = (game: GameSnapshot, word: string, signal: AbortSignal) => request<{ game: GameSnapshot }>(`/api/games/${game.id}/words`, { word, revision: game.revision }, signal)
export const finishGameRequest = (id: string, reason: "timeout" | "forfeit", signal: AbortSignal) => request<{ game: GameSnapshot }>(`/api/games/${id}/finish`, { reason }, signal)
export const rankingRequest = (id: string, nickname: string, signal: AbortSignal) => request<RankingResult>(`/api/games/${id}/ranking`, { nickname }, signal)
export const rankingsRequest = (signal: AbortSignal) => request<{ rankings: RankingEntry[] }>("/api/rankings", undefined, signal)
