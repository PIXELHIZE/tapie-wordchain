import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import { extname, resolve, sep } from "node:path"
import { createServer as createViteServer } from "vite"

const projectRoot = process.cwd()
const sqlPath = resolve(projectRoot, "korean_kr.sql")
const wordPattern = /\((\d+),\s*'((?:\\.|''|[^'\\])*)',\s*'((?:\\.|''|[^'\\])*)'\)/g

const decodeSqlString = (value) => value
  .replace(/''/g, "'")
  .replace(/\\([0abtnvfrZ\\'"%_])/g, (_, escaped) => ({
    0: "\0", a: "\x07", b: "\b", t: "\t", n: "\n", v: "\v", f: "\f", r: "\r", Z: "\x1a",
    "\\": "\\", "'": "'", '"': '"', "%": "%", _: "_",
  })[escaped])

const loadWordIndex = () => {
  const sql = readFileSync(sqlPath, "utf8")
  const words = new Set()

  for (const [, , rawWord, rawPart] of sql.matchAll(wordPattern)) {
    const word = decodeSqlString(rawWord).normalize("NFC")
    const part = decodeSqlString(rawPart)
    if (part === "명사" && /^[가-힣]{2,}$/u.test(word)) words.add(word)
  }

  const index = new Map()
  for (const word of words) {
    const initial = word[0]
    const bucket = index.get(initial) ?? []
    bucket.push(word)
    index.set(initial, bucket)
  }

  return { index, wordCount: words.size }
}

const { index: wordsByInitial, wordCount } = loadWordIndex()
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
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname)
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
    response.writeHead(200, { "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream" })
    response.end(readFileSync(filePath))
  } catch {
    response.writeHead(404)
    response.end("Not found")
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
      const candidates = initial ? wordsByInitial.get(initial) ?? [] : [...wordsByInitial.values()].flat()
      const used = new Set(usedWords.map((word) => word.normalize("NFC")))
      const available = candidates.filter((word) => !used.has(word))
      const word = available.length ? available[Math.floor(Math.random() * available.length)] : null
      json(response, 200, { word })
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