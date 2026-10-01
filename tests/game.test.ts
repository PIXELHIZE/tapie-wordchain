import assert from "node:assert/strict"
import test from "node:test"
import { gameReducer, getTurnDurationMs, initialGame, type GameState } from "../src/utils/Game.ts"
import { getAllowedInitials, isValidWord } from "../src/utils/WordChain.ts"

const start = (mode: "deathmatch" | "timeAttack" = "timeAttack") =>
  gameReducer(initialGame, { type: "start", mode, now: 0 })
const action = (game: GameState, now: number) => ({ session: game.session, turn: game.words.length, now })
const humanWord = (game: GameState, word: string, now: number) => {
  const pending = gameReducer(game, { type: "validate", ...action(game, now) })
  return gameReducer(pending, { type: "validated", ...action(pending, now + 100), word })
}

test("time attack starts at 15 seconds and shortens every five complete rounds", () => {
  for (const [round, seconds] of [[1, 15], [5, 15], [6, 13], [11, 11], [16, 9], [21, 7], [26, 5], [31, 3], [100, 3]]) {
    const count = (round - 1) * 2
    assert.equal(getTurnDurationMs(count), seconds * 1000)
    assert.equal(getTurnDurationMs(count + 1), seconds * 1000)
  }
})

test("both players get the current round's full limit on every accepted turn", () => {
  let game = start()
  assert.equal(game.deadline, 15000)
  for (let turn = 0; turn < 80; turn++) {
    const now = turn * 1000 + 10
    game = turn % 2 === 0 ? humanWord(game, `사과${turn}`, now) :
      gameReducer(game, { type: "computer-word", ...action(game, now), word: `과일${turn}` })
    assert.equal(game.words.length, turn + 1)
    assert.equal(game.result, null)
    assert.equal(game.deadline, now + (turn % 2 === 0 ? 100 : 0) + getTurnDurationMs(turn + 1))
  }
})

test("deathmatch has no deadline, including after a dictionary rejection", () => {
  let game = start("deathmatch")
  game = gameReducer(game, { type: "validate", ...action(game, 100000) })
  game = gameReducer(game, { type: "validated", ...action(game, 200000), word: "사과", error: "실패" })
  assert.equal(game.deadline, null)
  game = humanWord(game, "사과", 300000)
  assert.equal(game.deadline, null)
  assert.equal(game.words.length, 1)
})

test("a timely submission can finish validating after its original deadline", () => {
  let game = start()
  game = gameReducer(game, { type: "validate", ...action(game, 14999) })
  assert.equal(game.pending?.remainingMs, 1)
  assert.equal(game.deadline, null)
  assert.equal(gameReducer(game, { type: "timeout", ...action(game, 20000) }), game)
  game = gameReducer(game, { type: "validated", ...action(game, 20000), word: "사과" })
  assert.deepEqual(game.words, ["사과"])
  assert.equal(game.result, null)
  assert.equal(game.deadline, 35000)
})

test("a rejected submission resumes the saved time without giving extra thinking time", () => {
  let game = start()
  game = gameReducer(game, { type: "validate", ...action(game, 14000) })
  game = gameReducer(game, { type: "validated", ...action(game, 20000), word: "가나다", error: "사전에 없음" })
  assert.equal(game.deadline, 21000)
  assert.equal(game.pending, null)
  assert.equal(game.error, "사전에 없음")
  assert.deepEqual(game.words, [])
})

test("a submission at or after the deadline loses without starting validation", () => {
  for (const now of [15000, 15001]) {
    const game = start()
    const finished = gameReducer(game, { type: "validate", ...action(game, now) })
    assert.equal(finished.result?.winner, 1)
    assert.equal(finished.pending, null)
    assert.deepEqual(finished.words, [])
  }
})

test("a late computer response loses even if the timer callback has not run", () => {
  let game = humanWord(start(), "사과", 1000)
  const deadline = game.deadline!
  game = gameReducer(game, { type: "computer-word", ...action(game, deadline), word: "과일" })
  assert.equal(game.result?.winner, 0)
  assert.deepEqual(game.words, ["사과"])
})

test("timeout callbacks cannot finish the wrong turn or fire early", () => {
  const original = start()
  const next = humanWord(original, "사과", 100)
  assert.equal(gameReducer(next, { type: "timeout", ...action(original, 16000) }), next)
  assert.equal(gameReducer(next, { type: "timeout", ...action(next, 1000) }), next)
  assert.equal(gameReducer(next, { type: "timeout", ...action(next, next.deadline!) }).result?.winner, 0)
})

test("forfeit during validation prevents a late valid response from changing the result", () => {
  const game = gameReducer(start(), { type: "validate", ...action(start(), 100) })
  const finished = gameReducer(game, { type: "finish", ...action(game, 200), result: { winner: 1, message: "기권" } })
  assert.equal(gameReducer(finished, { type: "validated", ...action(game, 300), word: "사과" }), finished)
})

test("a computer response after forfeit cannot add another word", () => {
  const game = humanWord(start(), "사과", 100)
  const finished = gameReducer(game, { type: "finish", ...action(game, 200), result: { winner: 1, message: "기권" } })
  assert.equal(gameReducer(finished, { type: "computer-word", ...action(game, 300), word: "과일" }), finished)
})

test("restart and home invalidate replies from the previous session", () => {
  const pending = gameReducer(start(), { type: "validate", ...action(start(), 100) })
  for (const next of [gameReducer(pending, { type: "start", mode: "timeAttack", now: 1000 }), gameReducer(pending, { type: "home" })]) {
    assert.notEqual(next.session, pending.session)
    assert.deepEqual(next.words, [])
    assert.equal(gameReducer(next, { type: "validated", ...action(pending, 1100), word: "사과" }), next)
  }
})

test("duplicate validation and completed replies are ignored", () => {
  const game = start()
  const pending = gameReducer(game, { type: "validate", ...action(game, 100) })
  assert.equal(gameReducer(pending, { type: "validate", ...action(pending, 200) }), pending)
  const next = gameReducer(pending, { type: "validated", ...action(pending, 300), word: "사과" })
  assert.equal(gameReducer(next, { type: "validated", ...action(pending, 400), word: "사과" }), next)
})

test("word validation rejects non-Korean, short, duplicate and broken-chain words", () => {
  assert.ok(isValidWord(undefined, "가", []))
  assert.ok(isValidWord(undefined, "apple", []))
  assert.ok(isValidWord("사과", "사과", ["사과"]))
  assert.ok(isValidWord("사과", "바나나", ["사과"]))
  assert.equal(isValidWord("사과", "과일", ["사과"]), null)
})

test("word validation normalizes decomposed Hangul and preserves allowed initials", () => {
  assert.equal(isValidWord("사과", "과일".normalize("NFD"), ["사과"]), null)
  assert.ok(isValidWord(undefined, "사과".normalize("NFD"), ["사과"]))
  assert.deepEqual(getAllowedInitials("녀"), ["녀", "여"])
  assert.equal(isValidWord("소녀", "여행", ["소녀"]), null)
})
