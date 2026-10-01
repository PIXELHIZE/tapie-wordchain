import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const sourcePath = resolve(process.argv[2] ?? "")
const targetPath = resolve(process.argv[3] ?? "kkutu_words.txt")
const exclusionPath = resolve(process.argv[4] ?? "kkutu_excluded_words.txt")
if (!process.argv[2]) throw new Error("Usage: node scripts/import-kkutu-words.mjs <KKuTu/db.sql> [output]")

const sourceSql = readFileSync(sourcePath, "utf8")
const localSql = readFileSync(resolve("korean_kr.sql"), "utf8")
const localPattern = /\((\d+),\s*'((?:\\.|''|[^'\\])*)',\s*'((?:\\.|''|[^'\\])*)'\)/g
const localWords = new Set()
const localNorthKoreanWords = new Set()

for (const [, , word, part] of localSql.matchAll(localPattern)) {
  const normalizedWord = word.normalize("NFC")
  if (part === "북한어") localNorthKoreanWords.add(normalizedWord)
  if (part === "명사" && /^[가-힣]+$/u.test(normalizedWord)) localWords.add(normalizedWord)
}
for (const word of localNorthKoreanWords) localWords.delete(word)

const copyStart = "COPY kkutu_ko (_id, type, mean, hit, flag, theme) FROM stdin;\n"
const startIndex = sourceSql.indexOf(copyStart)
if (startIndex < 0) throw new Error("Could not find kkutu_ko COPY section")
const dataStart = startIndex + copyStart.length
const dataEnd = sourceSql.indexOf("\n\\.\n", dataStart)
if (dataEnd < 0) throw new Error("Could not find end of kkutu_ko COPY section")

const importedWords = new Set()
const northKoreanWords = new Set()
let sourceRows = 0
let eligibleRows = 0

for (const row of sourceSql.slice(dataStart, dataEnd).split("\n")) {
  if (!row) continue
  sourceRows += 1
  const columns = row.split("\t")
  if (columns.length < 5) continue

  const [rawWord, type, , , rawFlag] = columns
  const word = rawWord.normalize("NFC")
  const flag = Number(rawFlag)
  const isNoun = /(^|,)1(,|$)/.test(type)
  if (Number.isInteger(flag) && (flag & 32) !== 0 && /^[가-힣]+$/u.test(word)) northKoreanWords.add(word)
  const hasExcludedFlag = !Number.isInteger(flag) || (flag & (4 | 8 | 16 | 32)) !== 0
  if (!isNoun || hasExcludedFlag || !/^[가-힣]+$/u.test(word)) continue

  eligibleRows += 1
  if (!localWords.has(word)) importedWords.add(word)
}

const words = [...importedWords].sort((a, b) => a.localeCompare(b, "ko"))
const header = [
  "# KKuTu Korean noun supplement",
  "# Source: https://github.com/JJoriping/KKuTu",
  "# Source commit: a2c240bc31fe2dea31d26fb1cf7625b4645556a6",
  "# Filters: Hangul-only noun(type 1), excluding spaced/dialect/archaic/North-Korean flags",
]
writeFileSync(targetPath, `${header.join("\n")}\n${words.join("\n")}\n`)
writeFileSync(exclusionPath, `${[...northKoreanWords].sort((a, b) => a.localeCompare(b, "ko")).join("\n")}\n`)

console.log(JSON.stringify({
  sourceRows,
  eligibleRows,
  existingWords: localWords.size,
  importedWords: words.length,
  northKoreanExclusions: northKoreanWords.size,
}, null, 2))
