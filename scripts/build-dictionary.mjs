import { mkdir, writeFile } from "node:fs/promises"
import { dictionaryWords } from "../dictionary.js"

const destination = new URL("../worker/generated/", import.meta.url)
await mkdir(destination, { recursive: true })
await writeFile(new URL("words.json", destination), JSON.stringify([...dictionaryWords]))
console.log(`Worker dictionary: ${dictionaryWords.size.toLocaleString()} words`)
