import { getAllowedInitials, wordsByInitial } from "../dictionary.js"

export default function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    response.status(405).json({ error: "Method not allowed" })
    return
  }

  const { previousWord, usedWords = [] } = request.body ?? {}
  if (!Array.isArray(usedWords) || usedWords.some((word) => typeof word !== "string")) {
    response.status(400).json({ error: "usedWords must be an array of strings" })
    return
  }

  const initial = typeof previousWord === "string" ? [...previousWord.normalize("NFC")].at(-1) : undefined
  const candidates = initial
    ? getAllowedInitials(initial).flatMap((allowedInitial) => wordsByInitial.get(allowedInitial) ?? [])
    : [...wordsByInitial.values()].flat()
  const used = new Set(usedWords.map((word) => word.normalize("NFC")))
  const available = candidates.filter((word) => !used.has(word))
  const word = available.length ? available[Math.floor(Math.random() * available.length)] : null
  response.status(200).json({ word })
}

