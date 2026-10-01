import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const sqlPath = fileURLToPath(new URL("./korean_kr.sql", import.meta.url))
const wordPattern = /\((\d+),\s*'((?:\\.|''|[^'\\])*)',\s*'((?:\\.|''|[^'\\])*)'\)/g
const HANGUL_BASE = 0xac00
const HANGUL_END = 0xd7a3
const SYLLABLES_PER_INITIAL = 21 * 28
const NIEUN_INDEX = 2
const RIEUL_INDEX = 5
const IEUNG_INDEX = 11
const NIEUN_TO_IEUNG_VOWELS = new Set([3, 6, 7, 12, 17, 20])

const decodeSqlString = (value) => value
  .replace(/''/g, "'")
  .replace(/\\([0abtnvfrZ\\'"%_])/g, (_, escaped) => ({
    0: "\0", a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r", Z: "\x1a",
    "\\": "\\", "'": "'", '"': '"', "%": "%", _: "_",
  })[escaped])

const replaceInitial = (syllable, initialIndex) => {
  const syllableIndex = syllable.charCodeAt(0) - HANGUL_BASE
  return String.fromCharCode(HANGUL_BASE + initialIndex * SYLLABLES_PER_INITIAL + syllableIndex % SYLLABLES_PER_INITIAL)
}

export const getAllowedInitials = (syllable) => {
  const code = syllable.charCodeAt(0)
  if (code < HANGUL_BASE || code > HANGUL_END) return [syllable]

  const syllableIndex = code - HANGUL_BASE
  const initialIndex = Math.floor(syllableIndex / SYLLABLES_PER_INITIAL)
  const vowelIndex = Math.floor((syllableIndex % SYLLABLES_PER_INITIAL) / 28)
  const allowed = [syllable]

  if (initialIndex === RIEUL_INDEX) {
    allowed.push(replaceInitial(syllable, NIEUN_INDEX), replaceInitial(syllable, IEUNG_INDEX))
  } else if (initialIndex === NIEUN_INDEX && NIEUN_TO_IEUNG_VOWELS.has(vowelIndex)) {
    allowed.push(replaceInitial(syllable, IEUNG_INDEX))
  }

  return [...new Set(allowed)]
}

const loadWordIndex = () => {
  const sql = readFileSync(sqlPath, "utf8")
  const nounWords = new Set()
  const northKoreanWords = new Set()

  for (const [, , rawWord, rawPart] of sql.matchAll(wordPattern)) {
    const word = decodeSqlString(rawWord).normalize("NFC")
    const part = decodeSqlString(rawPart)
    if (part === "북한어") northKoreanWords.add(word)
    if (part === "명사" && /^[가-힣]+$/u.test(word)) nounWords.add(word)
  }

  const words = new Set([...nounWords].filter((word) => !northKoreanWords.has(word)))
  const index = new Map()
  for (const word of words) {
    const initial = word[0]
    const bucket = index.get(initial) ?? []
    bucket.push(word)
    index.set(initial, bucket)
  }

  return { index, words, wordCount: words.size }
}

const dictionary = loadWordIndex()

export const wordsByInitial = dictionary.index
export const dictionaryWords = dictionary.words
export const wordCount = dictionary.wordCount

