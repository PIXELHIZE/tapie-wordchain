import { useEffect, useReducer, useRef, useState } from "react"
import WordInput from "./WordInput"
import WordList from "./WordList"
import { getRandomComputerWord } from "./utils/ComputerOpponent"
import { gameReducer, getTurnDurationMs, initialGame, type GameMode } from "./utils/Game"
import { getAllowedInitials, isValidWord, isWordInDictionary } from "./utils/WordChain"

const Arrow = () => <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>

const App = () => {
  const [game, dispatch] = useReducer(gameReducer, initialGame)
  const [clock, setClock] = useState({ deadline: 0, remainingMs: 15000 })
  const [speechMessage, setSpeechMessage] = useState("")
  const rulesRef = useRef<HTMLDialogElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const { mode, words, result, session, deadline, pending, error } = game
  const currentPlayer = words.length % 2
  const isComputerTurn = currentPlayer === 1 && !result && mode !== null
  const lastWord = words.at(-1)
  const requiredLetter = lastWord?.at(-1)
  const allowedInitials = requiredLetter ? getAllowedInitials(requiredLetter) : []
  const turnDurationMs = getTurnDurationMs(words.length)
  const remainingMs = pending?.remainingMs ?? (clock.deadline === deadline ? clock.remainingMs : turnDurationMs)
  const round = Math.floor(words.length / 2) + 1

  useEffect(() => () => {
    requestRef.current?.abort()
    window.speechSynthesis?.cancel()
  }, [])

  useEffect(() => {
    if (deadline === null || result) return
    const interval = window.setInterval(() => {
      const now = Date.now()
      setClock({ deadline, remainingMs: Math.max(0, deadline - now) })
      if (now >= deadline) dispatch({ type: "timeout", session, turn: words.length, now })
    }, 50)
    return () => window.clearInterval(interval)
  }, [deadline, result, session, words.length])

  useEffect(() => {
    if (!isComputerTurn) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void getRandomComputerWord(lastWord, words, controller.signal).then((word) => {
        if (controller.signal.aborted) return
        if (!word) {
          dispatch({ type: "finish", session, turn: words.length, result: { winner: 0, message: "테이피가 이어갈 단어를 찾지 못했어요." } })
        } else if (isValidWord(lastWord, word, words)) {
          dispatch({ type: "finish", session, turn: words.length, result: { winner: null, message: "잘못된 단어 응답을 받았어요. 다시 시작해 주세요." } })
        } else {
          dispatch({ type: "computer-word", session, turn: words.length, word, now: Date.now() })
        }
      }).catch(() => {
        if (!controller.signal.aborted) dispatch({ type: "finish", session, turn: words.length, result: { winner: null, message: "사전에 연결할 수 없어요. 잠시 후 다시 시작해 주세요." } })
      })
    }, 700)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [isComputerTurn, lastWord, session, words])

  const handleSubmit = async (text: string) => {
    if (!mode || result || currentPlayer !== 0 || pending || requestRef.current) return false
    const word = text.trim().normalize("NFC")
    const message = isValidWord(lastWord, word, words)
    if (message) {
      dispatch({ type: "error", message })
      return false
    }
    const now = Date.now()
    if (deadline !== null && now >= deadline) {
      dispatch({ type: "timeout", session, turn: words.length, now })
      return false
    }
    const controller = new AbortController()
    requestRef.current = controller
    dispatch({ type: "validate", session, turn: words.length, now })
    try {
      const valid = await isWordInDictionary(word, controller.signal)
      if (controller.signal.aborted) return false
      dispatch({ type: "validated", session, turn: words.length, word, now: Date.now(), error: valid ? undefined : "사전에 없는 단어예요." })
      return valid
    } catch {
      if (!controller.signal.aborted) dispatch({ type: "validated", session, turn: words.length, word, now: Date.now(), error: "사전에 연결할 수 없어요. 다시 시도해 주세요." })
      return false
    } finally {
      if (requestRef.current === controller) requestRef.current = null
    }
  }

  const cancelRequests = () => {
    requestRef.current?.abort()
    requestRef.current = null
    window.speechSynthesis?.cancel()
    setSpeechMessage("")
  }

  const startGame = (selectedMode: GameMode) => {
    cancelRequests()
    dispatch({ type: "start", mode: selectedMode, now: Date.now() })
  }

  const goHome = () => {
    cancelRequests()
    dispatch({ type: "home" })
  }

  const forfeit = () => {
    cancelRequests()
    dispatch({ type: "finish", session, turn: words.length, result: { winner: 1, message: "이번 경기는 기권했어요." } })
  }

  const readLastWord = () => {
    if (!lastWord) return
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setSpeechMessage("이 브라우저에서는 단어 읽기를 지원하지 않아요.")
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(lastWord)
    utterance.lang = "ko-KR"
    utterance.rate = 0.9
    const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith("ko"))
    if (voice) utterance.voice = voice
    utterance.onerror = () => setSpeechMessage("단어를 읽지 못했어요.")
    utterance.onend = () => setSpeechMessage("")
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={goHome} aria-label="테이피 끝말잇기 홈">
          <span className="brand-mark" aria-hidden="true">↗</span>
          <span>TAPIE<span className="brand-divider">/</span>끝말잇기</span>
        </button>
        {mode ? <button className="text-button" onClick={goHome}>모드 선택 <Arrow /></button> :
          <button className="text-button" onClick={() => rulesRef.current?.showModal()}>게임 방법 <span className="help-icon" aria-hidden="true">?</span></button>}
      </header>

      <main id="main">
        {!mode ? (
          <section className="home-screen" aria-labelledby="home-title">
            <div className="hero">
              <div className="hero-copy">
                <h1 id="home-title">단어 끝에서,<br />다음 시작으로.</h1>
                <p>테이피와 한 단어씩, 어디까지 이어갈까요?</p>
              </div>
              <div className="word-art" aria-hidden="true">
                <div className="art-word art-word-first"><span>사</span><span className="art-dark">과</span></div>
                <span className="art-connector">↘</span>
                <div className="art-word art-word-second"><span className="art-outline">과</span><span className="art-dark">일</span></div>
                <span className="art-connector art-connector-second">↘</span>
                <div className="art-word art-word-third"><span className="art-outline">일</span><span>기</span></div>
              </div>
            </div>

            <div className="mode-grid" aria-label="게임 모드 선택">
              <button className="mode-card" onClick={() => startGame("deathmatch")}>
                <span className="mode-card-icon" aria-hidden="true">∞</span>
                <span className="mode-card-copy"><strong>데스매치</strong><span>시간 제한 없이, 막힐 때까지.</span></span>
                <span className="mode-card-arrow"><Arrow /></span>
              </button>
              <button className="mode-card mode-card-dark" onClick={() => startGame("timeAttack")}>
                <svg className="mode-card-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true"><circle cx="16" cy="18" r="10" /><path d="M16 12v6l4 2M12 3h8M16 3v5m9 1 3 3" /></svg>
                <span className="mode-card-copy"><strong>타임어택</strong><span>15초부터 시작해, 점점 빠르게.</span></span>
                <span className="mode-card-arrow"><Arrow /></span>
              </button>
            </div>
          </section>
        ) : (
          <section className="game-screen" aria-labelledby="game-title">
            <div className="game-heading">
              <h1 id="game-title">{mode === "timeAttack" ? "타임어택" : "데스매치"}<span className="round-label">라운드 {String(round).padStart(2, "0")}</span></h1>
              <button className="text-button" onClick={() => startGame(mode)}>새 게임 <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 5v6h-6M20 11a8 8 0 1 0-1 6" /></svg></button>
            </div>

            <div className="game-layout">
              <div className="play-column">
                <div className="scoreboard" aria-label="단어 점수">
                  <div className={`player ${!result && currentPlayer === 0 ? "player-active" : ""}`}><span className="player-dot" /><span>나</span><strong>{Math.ceil(words.length / 2)}</strong></div>
                  <span className="versus" aria-hidden="true">:</span>
                  <div className={`player ${!result && currentPlayer === 1 ? "player-active" : ""}`}><strong>{Math.floor(words.length / 2)}</strong><span>테이피</span><span className="player-dot" /></div>
                </div>

                <div className={`game-board ${result ? "game-board-finished" : ""} ${mode === "timeAttack" && remainingMs <= 3000 && !result && !pending ? "game-board-urgent" : ""}`}>
                  <div className="board-top">
                    <span className="turn-status" role="status">{result ? "경기 종료" : pending ? "단어 확인 중" : isComputerTurn ? "테이피 생각 중" : "내 차례"}{(isComputerTurn || pending) && <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>}</span>
                    {mode === "timeAttack" && !result && <span className="timer" aria-label={`제한 시간 ${turnDurationMs / 1000}초`}><strong aria-hidden="true">{(remainingMs / 1000).toFixed(1)}</strong><span aria-hidden="true">초</span></span>}
                  </div>

                  {result ? (
                    <div className="result-content" role="status">
                      <span className="result-icon" aria-hidden="true">{result.winner === 0 ? "↗" : result.winner === 1 ? "↘" : "—"}</span>
                      <h2>{result.winner === 0 ? "내가 이겼어요!" : result.winner === 1 ? "테이피의 승리" : "잠시 중단됐어요"}</h2>
                      <p>{result.message}</p>
                      <button className="button-light" onClick={() => startGame(mode)}>한 판 더 <Arrow /></button>
                    </div>
                  ) : (
                    <div className="word-prompt">
                      <p>{requiredLetter ? "이 글자로 이어주세요" : "어떤 단어든 좋아요"}</p>
                      <strong className={requiredLetter ? "required-letter" : "first-word"}>{requiredLetter ?? "첫 단어"}</strong>
                      {allowedInitials.length > 1 && <span className="allowed-initials">{allowedInitials.join(" · ")} 시작 가능</span>}
                      {lastWord && <div className="previous-word"><span>이전 단어</span><strong>{lastWord}</strong><button onClick={readLastWord} aria-label={`이전 단어 ${lastWord} 읽기`}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></svg></button></div>}
                    </div>
                  )}

                  {mode === "timeAttack" && !result && <div className="time-track" role="progressbar" aria-label="남은 시간" aria-valuemin={0} aria-valuemax={turnDurationMs} aria-valuenow={Math.ceil(remainingMs)} aria-valuetext={`${(remainingMs / 1000).toFixed(1)}초 남음`}><span style={{ transform: `scaleX(${remainingMs / turnDurationMs})` }} /></div>}
                </div>

                {!result && <WordInput key={session} onSubmit={handleSubmit} disabled={isComputerTurn || Boolean(pending)} error={error} />}
                <div className="game-actions">
                  {mode === "timeAttack" && !result ? <span className="pace-note">{turnDurationMs > 3000 ? `${5 - Math.floor(words.length / 2) % 5}라운드 뒤 ${Math.max(3, turnDurationMs / 1000 - 2)}초` : "최종 속도 · 3초"}</span> : <span />}
                  {!result && <button className="text-button muted-button" onClick={forfeit}>기권하기</button>}
                </div>
                <span className="speech-status" role="status">{speechMessage}</span>
              </div>

              <aside className="history-column" aria-labelledby="history-title">
                <div className="history-heading"><h2 id="history-title">이어진 단어</h2><span>{words.length}</span></div>
                <WordList words={words} />
              </aside>
            </div>
          </section>
        )}
      </main>

      <dialog className="rules-dialog" ref={rulesRef} aria-labelledby="rules-title" onClick={(event) => { if (event.target === event.currentTarget) rulesRef.current?.close() }}>
        <div className="dialog-heading"><h2 id="rules-title">게임 방법</h2><button className="close-button" onClick={() => rulesRef.current?.close()} aria-label="게임 방법 닫기">×</button></div>
        <ol><li>두 글자 이상의 한글 명사를 입력하세요.</li><li>앞 단어의 마지막 글자로 시작하세요. 두음법칙으로 이을 수 있는 글자는 화면에 표시돼요.</li><li>이미 나온 단어는 다시 쓸 수 없어요.</li></ol>
        <p>타임어택은 15초로 시작해 5라운드마다 2초씩 줄어들어요. 최소 3초까지, 나와 테이피에게 같은 시간이 주어져요.</p>
        <button className="button-dark" onClick={() => rulesRef.current?.close()}>알겠어요 <Arrow /></button>
      </dialog>
    </div>
  )
}

export default App
