import words from "./generated/words.json"
import { createWordEngine } from "./engine"
import { createApi } from "./api"

export default { fetch: createApi(createWordEngine(words)) }
