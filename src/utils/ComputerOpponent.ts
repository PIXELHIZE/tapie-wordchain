export const getRandomComputerWord = async (previousWord: string | undefined, usedWords: string[], signal?: AbortSignal) => {
  const response = await fetch("/api/computer-word", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ previousWord, usedWords }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(6000)]) : AbortSignal.timeout(6000),
  })

  if (!response.ok) throw new Error("Dictionary API request failed")
  const result: { word: string | null } = await response.json()
  if (result.word !== null && typeof result.word !== "string") throw new Error("Invalid computer word response")
  return result.word?.normalize("NFC") ?? null
}
