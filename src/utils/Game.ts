export type GameMode = "deathmatch" | "timeAttack"
export type Player = 0 | 1
export type GameResult = { winner: Player | null; message: string }

export const getTurnDurationMs = (wordCount: number) =>
  Math.max(3000, 15000 - Math.floor(wordCount / 10) * 2000)

export type GameState = {
  mode: GameMode | null
  words: string[]
  result: GameResult | null
  error: string
  session: number
  deadline: number | null
  pending: { remainingMs: number } | null
}

export const initialGame: GameState = {
  mode: null, words: [], result: null, error: "", session: 0, deadline: null, pending: null,
}

type TurnAction = { session: number; turn: number; now: number }
export type GameAction =
  | { type: "start"; mode: GameMode; now: number }
  | { type: "home" }
  | { type: "error"; message: string }
  | ({ type: "validate" } & TurnAction)
  | ({ type: "validated"; word: string; error?: string } & TurnAction)
  | ({ type: "computer-word"; word: string } & TurnAction)
  | ({ type: "timeout" } & TurnAction)
  | { type: "finish"; result: GameResult; session: number; turn: number }

const isCurrentTurn = (state: GameState, action: { session: number; turn: number }) =>
  state.mode !== null && !state.result && state.session === action.session && state.words.length === action.turn

const finish = (state: GameState, result: GameResult): GameState => ({
  ...state, result, error: "", deadline: null, pending: null,
})

const timeout = (state: GameState) => finish(state, {
  winner: state.words.length % 2 === 0 ? 1 : 0,
  message: state.words.length % 2 === 0 ? "제한 시간이 끝났어요." : "테이피가 제시간에 답하지 못했어요.",
})

const addWord = (state: GameState, word: string, now: number): GameState => {
  const words = [...state.words, word]
  return {
    ...state, words, error: "", pending: null,
    deadline: state.mode === "timeAttack" ? now + getTurnDurationMs(words.length) : null,
  }
}

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case "start":
      return {
        ...initialGame, mode: action.mode, session: state.session + 1,
        deadline: action.mode === "timeAttack" ? action.now + getTurnDurationMs(0) : null,
      }
    case "home":
      return { ...initialGame, session: state.session + 1 }
    case "error":
      return state.mode && !state.result && !state.pending ? { ...state, error: action.message } : state
    case "validate":
      if (!isCurrentTurn(state, action) || state.words.length % 2 !== 0 || state.pending) return state
      if (state.deadline !== null && action.now >= state.deadline) return timeout(state)
      // A timely submission should not lose time waiting for the dictionary server.
      return {
        ...state, error: "", deadline: null,
        pending: { remainingMs: state.deadline === null ? 0 : state.deadline - action.now },
      }
    case "validated":
      if (!isCurrentTurn(state, action) || !state.pending) return state
      if (action.error) return {
        ...state, error: action.error, pending: null,
        deadline: state.mode === "timeAttack" ? action.now + state.pending.remainingMs : null,
      }
      return addWord(state, action.word, action.now)
    case "computer-word":
      if (!isCurrentTurn(state, action) || state.words.length % 2 !== 1) return state
      if (state.deadline !== null && action.now >= state.deadline) return timeout(state)
      return addWord(state, action.word, action.now)
    case "timeout":
      if (!isCurrentTurn(state, action) || state.pending || state.deadline === null || action.now < state.deadline) return state
      return timeout(state)
    case "finish":
      return isCurrentTurn(state, action) ? finish(state, action.result) : state
  }
}
