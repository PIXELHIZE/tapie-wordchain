export const getTurnDurationMs = (completedRounds: number) => Math.max(3000, 12000 - Math.floor(completedRounds / 2) * 2000)

export const getWordPoints = (word: string, remainingMs: number) => {
  const lengthPoints = word.normalize("NFC").length * 10
  const timePoints = Math.floor(Math.max(0, remainingMs) / 1000) * 5
  return { lengthPoints, timePoints, total: lengthPoints + timePoints }
}

export type GameSnapshot = {
  id: string
  revision: number
  words: string[]
  score: number
  status: "active" | "finished"
  reason: "timeout" | "forfeit" | null
  turnDurationMs: number
  remainingMs: number
  ranked: boolean
  lastGain: number
}

export type RankingEntry = { rank: number; nickname: string; score: number; createdAt: number }
export type RankingResult = { entry: RankingEntry; rankings: RankingEntry[] }
