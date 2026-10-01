import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { extname, resolve, sep } from "node:path"
import { createServer as createViteServer } from "vite"

const projectRoot = process.cwd()
const sqlPath = resolve(projectRoot, "korean_kr.sql")
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

const getAllowedInitials = (syllable) => {
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

const { index: wordsByInitial, words: dictionaryWords, wordCount } = loadWordIndex()
const json = (response, statusCode, body) => {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(body))
}

const readJsonBody = (request) => new Promise((resolveBody, reject) => {
  let body = ""
  request.setEncoding("utf8")
  request.on("data", (chunk) => {
    body += chunk
    if (body.length > 2_000_000) reject(new Error("Request body too large"))
  })
  request.on("end", () => {
    try {
      resolveBody(JSON.parse(body))
    } catch {
      reject(new Error("Invalid JSON"))
    }
  })
  request.on("error", reject)
})

const serveStaticFile = (request, response) => {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname)
  } catch {
    response.writeHead(400, { "content-type": "text/plain; charset=utf-8" })
    response.end("Bad request")
    return
  }

  const distRoot = resolve(projectRoot, "dist")
  const requestedFile = resolve(distRoot, `.${pathname}`)
  const safeFile = requestedFile === distRoot || requestedFile.startsWith(`${distRoot}${sep}`)
    ? requestedFile
    : resolve(distRoot, "index.html")
  const filePath = extname(safeFile) ? safeFile : resolve(distRoot, "index.html")
  const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  }

  try {
    const content = readFileSync(filePath)
    response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream" })
    response.end(request.method === "HEAD" ? undefined : content)
  } catch {
    if (!response.headersSent) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      response.end("Not found")
    }
  }
}

const isDevelopment = process.argv.includes("--dev")
const vite = isDevelopment
  ? await createViteServer({
    configFile: resolve(projectRoot, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  })
  : null

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname
  if (pathname === "/api/computer-word") {
    if (request.method !== "POST") {
      json(response, 405, { error: "Method not allowed" })
      return
    }

    try {
      const { previousWord, usedWords = [] } = await readJsonBody(request)
      if (!Array.isArray(usedWords) || usedWords.some((word) => typeof word !== "string")) {
        json(response, 400, { error: "usedWords must be an array of strings" })
        return
      }

      const initial = typeof previousWord === "string" ? [...previousWord.normalize("NFC")].at(-1) : undefined
      const candidates = initial
        ? getAllowedInitials(initial).flatMap((allowedInitial) => wordsByInitial.get(allowedInitial) ?? [])
        : [...wordsByInitial.values()].flat()
      const used = new Set(usedWords.map((word) => word.normalize("NFC")))
      const available = candidates.filter((word) => !used.has(word))
      const word = available.length ? available[Math.floor(Math.random() * available.length)] : null
      json(response, 200, { word })
    } catch {
      json(response, 400, { error: "Invalid word request" })
    }
    return
  }

  if (pathname === "/api/validate-word") {
    if (request.method !== "POST") {
      json(response, 405, { error: "Method not allowed" })
      return
    }

    try {
      const { word } = await readJsonBody(request)
      if (typeof word !== "string" || !/^[가-힣]+$/u.test(word.normalize("NFC"))) {
        json(response, 400, { error: "word must contain Korean syllables only" })
        return
      }
      json(response, 200, { valid: dictionaryWords.has(word.normalize("NFC")) })
    } catch {
      json(response, 400, { error: "Invalid word request" })
    }
    return
  }

  if (isDevelopment) {
    vite.middlewares(request, response)
    return
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405)
    response.end("Method not allowed")
    return
  }
  serveStaticFile(request, response)
})

const port = Number(process.env.PORT ?? (isDevelopment ? 5173 : 4173))
server.listen(port, "0.0.0.0", () => {
  console.log(`TAPIE server listening on http://localhost:${port} (${wordCount.toLocaleString()} dictionary words)`)
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await vite?.close()
    server.close(() => process.exit(0))
  })
}
