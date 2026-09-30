export const getRandomComputerWord = async (previousWord: string | undefined, usedWords: string[]) => {
  const response = await fetch("/api/computer-word", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ previousWord, usedWords }),
  })

  if (!response.ok) throw new Error("Dictionary API request failed")
  const result: { word: string | null } = await response.json()
  return result.word
}