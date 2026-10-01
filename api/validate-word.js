import { dictionaryWords } from "../dictionary.js"

export default function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    response.status(405).json({ error: "Method not allowed" })
    return
  }

  const word = request.body?.word
  if (typeof word !== "string" || !/^[가-힣]+$/u.test(word.normalize("NFC"))) {
    response.status(400).json({ error: "word must contain Korean syllables only" })
    return
  }

  response.status(200).json({ valid: dictionaryWords.has(word.normalize("NFC")) })
}

