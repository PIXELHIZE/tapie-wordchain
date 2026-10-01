import { useEffect, useRef, useState } from "react"
import logo from "./assets/tapie_mylogo.png"
import WordInput from "./WordInput"
import WordList from "./WordList"
import { getRandomComputerWord } from "./utils/ComputerOpponent"
import { getAllowedInitials, isValidWord, isWordInDictionary } from "./utils/WordChain"

type GameMode = "deathmatch" | "timeAttack"

const App = () => {
  const [error, setError] = useState("")
  const [words, setWords] = useState<string[]>([])
  const [isFinished, setIsFinished] = useState(false)
  const [winner, setWinner] = useState<number | null>(null)
  const [inputResetKey, setInputResetKey] = useState(0)
  const [mode, setMode] = useState<GameMode | null>(null)
  const [isModeDialogOpen, setIsModeDialogOpen] = useState(false)
  const [remainingMs, setRemainingMs] = useState(3000)
  const [turnTimerKey, setTurnTimerKey] = useState(0)
  const [speechMessage, setSpeechMessage] = useState("")
  const gameSessionRef = useRef(0)
  const currentPlayer = words.length % 2
  const isComputerTurn = currentPlayer === 1 && !isFinished && mode !== null
  const lastWord = words[words.length - 1]
  const requiredLetter = lastWord?.[lastWord.length - 1]
  const allowedInitials = requiredLetter ? getAllowedInitials(requiredLetter) : []

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  useEffect(() => {
    if (mode !== "timeAttack" || isFinished) return

    const deadline = Date.now() + 3000
    const intervalId = window.setInterval(() => {
      const nextRemainingMs = Math.max(0, deadline - Date.now())
      setRemainingMs(nextRemainingMs)
      if (nextRemainingMs === 0) {
        gameSessionRef.current += 1
        setWinner(1 - currentPlayer)
        setError(currentPlayer === 0 ? "시간 초과! 테이피가 이겼어요." : "시간 초과! 테이피가 제시간에 답하지 못했어요.")
        setIsFinished(true)
      }
    }, 50)

    return () => window.clearInterval(intervalId)
  }, [currentPlayer, isFinished, mode, turnTimerKey, words.length])

  useEffect(() => {
    if (!isComputerTurn) return

    let isCancelled = false
    const timeoutId = window.setTimeout(() => {
      void getRandomComputerWord(lastWord, words)
        .then((computerWord) => {
          if (isCancelled) return
          if (!computerWord) {
            gameSessionRef.current += 1
            setWinner(0)
            setError("테이피가 이어갈 단어를 찾지 못했어요.")
            setIsFinished(true)
            return
          }

          setError("")
          setRemainingMs(3000)
          setWords((currentWords) => [...currentWords, computerWord])
        })
        .catch(() => {
          if (isCancelled) return
          gameSessionRef.current += 1
          setWinner(null)
          setError("단어 사전에 연결할 수 없어요. 서버를 확인해 주세요.")
          setIsFinished(true)
        })
    }, 900)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [isComputerTurn, lastWord, words])

  const handleSubmit = async (word: string) => {
    const prev = words[words.length - 1]
    const result = isValidWord(prev, word, words)
    if (result) {
      setError(result)
      return false
    }

    const session = gameSessionRef.current
    const normalizedWord = word.normalize("NFC")
    try {
      const existsInDictionary = await isWordInDictionary(normalizedWord)
      if (session !== gameSessionRef.current) return false
      if (!existsInDictionary) {
        setError("사전에 없는 단어예요. 다른 단어를 입력해 주세요.")
        return false
      }
    } catch {
      if (session !== gameSessionRef.current) return false
      setError("단어 사전에 연결할 수 없어요. 다시 시도해 주세요.")
      return false
    }

    setError("")
    setRemainingMs(3000)
    setWords([...words, normalizedWord])
    return true
  }

  const startNewGame = (selectedMode: GameMode) => {
    setMode(selectedMode)
    resetGame()
    setIsModeDialogOpen(false)
  }

  const resetGame = () => {
    window.speechSynthesis?.cancel()
    gameSessionRef.current += 1
    setWords([])
    setError("")
    setIsFinished(false)
    setWinner(null)
    setRemainingMs(3000)
    setSpeechMessage("")
    setTurnTimerKey((key) => key + 1)
    setInputResetKey((key) => key + 1)
  }

  const restartGame = () => {
    if (mode) {
      resetGame()
      return
    }
    setIsModeDialogOpen(true)
  }

  const openModeDialog = () => setIsModeDialogOpen(true)

  const goHome = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    setIsModeDialogOpen(false)
    setMode(null)
    resetGame()
  }

  const finishByForfeit = () => {
    gameSessionRef.current += 1
    setWinner(1)
    setError("기권했어요. 테이피가 이겼어요.")
    setIsFinished(true)
    setInputResetKey((key) => key + 1)
  }

  const readLastWord = () => {
    if (!lastWord) return
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setSpeechMessage("이 브라우저에서는 음성 읽기를 지원하지 않아요.")
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(lastWord)
    utterance.lang = "ko-KR"
    utterance.rate = 0.9
    const koreanVoice = window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ko"))
    if (koreanVoice) utterance.voice = koreanVoice
    utterance.onstart = () => setSpeechMessage(`‘${lastWord}’ 단어를 읽고 있어요.`)
    utterance.onend = () => setSpeechMessage("")
    utterance.onerror = () => setSpeechMessage("단어를 읽지 못했어요. 다시 시도해 주세요.")
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" onClick={goHome} aria-label="테이피 끝말잇기 홈">
          <img className="brand-mark" src={logo} alt="" />
          <span className="brand-name">테이피 끝말잇기</span>
        </a>
        {mode && <div className="header-meta"><span className="live-dot" />{mode === "timeAttack" ? "타임어택" : "단어 데스매치"} <span className="meta-divider">/</span> 상대 테이피</div>}
      </header>

      <main id="top">
        {!mode ? (
          <section className="home-screen" aria-labelledby="home-title">
            <div className="home-copy">
              <p className="eyebrow">테이피 끝말잇기 <span>·</span> 오늘의 한 판</p>
              <h1 id="home-title">안녕하세요끄투입니다<br /><span>잘부탁드립니다</span></h1>
              <p>단어 하나로 시작하는 테이피와의 우리말 대결</p>
            </div>
            <div className="home-mode-grid" aria-label="게임 모드 선택">
              <button className="home-mode-option" type="button" onClick={() => startNewGame("deathmatch")}>
                <span className="home-mode-number">모드 01</span>
                <strong>단어 데스매치</strong>
                <span>시간 제한 없이 단어를 이어가며 테이피와 겨뤄요.</span>
                <b aria-hidden="true">↗</b>
              </button>
              <button className="home-mode-option home-mode-option-time" type="button" onClick={() => startNewGame("timeAttack")}>
                <span className="home-mode-number">모드 02 · 3초 제한</span>
                <strong>타임어택</strong>
                <span>나와 테이피 모두 3초 안에 다음 단어를 입력해요.</span>
                <b aria-hidden="true">↗</b>
              </button>
            </div>
            <section className="home-rules" aria-labelledby="rules-title">
              <h2 id="rules-title">플레이 방법</h2>
              <p><span>01</span> 한 글자 이상의 한글 단어를 입력해요.</p>
              <p><span>02</span> 앞 단어의 마지막 글자로 다음 단어를 시작해요.</p>
              <p><span>03</span> 이미 나온 단어는 다시 사용할 수 없어요.</p>
            </section>
          </section>
        ) : (
        <div className="game-layout">
          <section className="play-column" aria-label="게임 진행">
            <div className="section-heading">
              <div><span className="section-kicker">{mode === "timeAttack" ? "3초 안에 이어가기" : "우리말 끝말잇기"}</span><h2>오늘의 한 판</h2></div>
              <div className="section-controls">
                <button className="mode-change-button" type="button" onClick={openModeDialog} title="모드 변경">모드 변경</button>
                <button className="icon-button" type="button" onClick={restartGame} title="현재 모드로 새 게임" aria-label="현재 모드로 새 게임">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4.9 9a7.5 7.5 0 0 1 12.5-2L20 12M4 17v-5h5m10.1 3a7.5 7.5 0 0 1-12.5 2L4 12" /></svg>
                </button>
              </div>
            </div>

            <div className="match-surface">
              <div className="players" aria-label="현재 차례">
                {[0, 1].map((player) => (
                  <div className={`player ${!isFinished && currentPlayer === player ? "player-active" : ""} ${isFinished && winner === player ? "player-winner" : ""} ${isFinished && winner !== null && winner !== player ? "player-loser" : ""}`} key={player}>
                    <span className="player-index">0{player + 1}</span>
                    <span className="player-name">{player === 0 ? "나" : "테이피"}</span>
                    {isFinished && winner !== null && <span className="player-result-badge">{winner === player ? "승자" : "패자"}</span>}
                    <span className="player-score">{words.filter((_, index) => index % 2 === player).length}</span>
                  </div>
                ))}
              </div>

              <div className={`turn-board ${isFinished ? "turn-board-finished" : ""} ${isComputerTurn ? "turn-board-ai" : ""} ${mode === "timeAttack" && remainingMs < 1000 && !isFinished ? "turn-board-urgent" : ""}`} aria-live="polite">
              <div className="turn-board-top">
                <span>{isFinished ? "경기 종료" : currentPlayer === 0 ? "내 차례 · 1P" : "테이피 생각 중"}</span>
                <span>{mode === "timeAttack" && !isFinished ? `${(remainingMs / 1000).toFixed(1)}초` : `차례 ${String(words.length + 1).padStart(2, "0")}`}</span>
              </div>
              {mode === "timeAttack" && !isFinished && (
                <div
                  className={`time-progress ${remainingMs < 1000 ? "time-progress-urgent" : ""}`}
                  role="progressbar"
                  aria-label="남은 시간"
                  aria-valuemin={0}
                  aria-valuemax={3000}
                  aria-valuenow={remainingMs}
                  aria-valuetext={`${(remainingMs / 1000).toFixed(1)}초 남음`}
                  aria-live="off"
                >
                  <span style={{ transform: `scaleX(${remainingMs / 3000})` }} />
                </div>
              )}
              {!isFinished && <div className="beat-lane" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div>}
              {isFinished ? (
                <div className="result-message">
                  <span className="result-symbol" aria-hidden="true">{winner === null ? "!" : "★"}</span>
                  <span className="result-label">{winner === null ? "경기 중단" : "WINNER · 승자"}</span>
                  <strong>{winner === null ? "확인 필요" : winner === 1 ? "테이피" : "나"}</strong>
                  {winner !== null && <span className="result-loser">패자 · {winner === 1 ? "나" : "테이피"}</span>}
                  <span className="result-caption">{error || "기권으로 게임이 종료됐어요."}</span>
                  <button className="result-restart-button" type="button" onClick={restartGame}>새 게임 시작 <span aria-hidden="true">↗</span></button>
                </div>
              ) : (
                <div className="prompt-content">
                  <div>
                    <span className="prompt-label">{requiredLetter ? allowedInitials.length > 1 ? `두음법칙 적용 · ${allowedInitials.join(" · ")} 중 하나로 시작` : "이 글자로 시작" : "첫 단어를 시작하세요"}</span>
                    <strong className={`required-letter ${requiredLetter ? "has-letter" : ""}`}>{requiredLetter ?? "?"}</strong>
                  </div>
                  <span className="prompt-arrow" aria-hidden="true">↘</span>
                </div>
              )}
              </div>
            </div>

            {!isFinished && (
              <WordInput
                key={inputResetKey}
                onSubmit={handleSubmit}
                disabled={isComputerTurn || isModeDialogOpen || !mode}
                error={error}
                statusMessage={isComputerTurn ? "테이피가 단어를 고르고 있어요." : "단어를 입력하고 차례를 이어가세요."}
              />
            )}

            <div className="play-actions">
              <p className="rule-note"><span className="rule-mark">!</span> 한 글자 이상의 한글 단어 · 이미 나온 단어는 사용할 수 없어요</p>
              <div className="play-action-buttons">
                <button className="read-word-button" type="button" onClick={readLastWord} disabled={!lastWord} aria-describedby="speech-status">
                  단어 읽기 <span aria-hidden="true">◖)</span>
                </button>
                {!isFinished && <button className="forfeit-button" type="button" onClick={finishByForfeit}>기권하기 <span aria-hidden="true">↗</span></button>}
              </div>
              <span className="sr-only" id="speech-status" role="status" aria-live="polite">{speechMessage}</span>
            </div>
          </section>

          <aside className="history-column" aria-label="단어 기록">
            <div className="section-heading history-heading">
              <div><span className="section-kicker">단어 기록</span><h2>이어진 단어</h2></div>
              <span className="word-count">{String(words.length).padStart(2, "0")}</span>
            </div>
            <WordList words={words} />
            <div className="history-footer"><span>진행 상태</span><span>{words.length ? "진행 중" : "대기"}<i /></span></div>
          </aside>
        </div>
        )}
      </main>

      <footer className="site-footer"><span>테이피 끝말잇기 <b>·</b> 01</span><span>이어갈 단어를 입력해 리듬을 이어가세요.</span></footer>
      {isModeDialogOpen && (
        <div className="mode-overlay">
          <section className="mode-dialog" role="dialog" aria-modal="true" aria-labelledby="mode-title">
            <span className="mode-kicker">테이피 끝말잇기 · 모드 선택</span>
            <h2 id="mode-title">어떤 모드로<br />이어볼까요?</h2>
            <p className="mode-intro">플레이 모드를 선택하면 바로 시작해요.</p>
            <div className="mode-options">
              <button className="mode-option" type="button" onClick={() => startNewGame("deathmatch")}>
                <span className="mode-number">모드 01</span>
                <strong>단어 데스매치</strong>
                <span>차례를 이어가며 상대가 막힐 때까지 대결</span>
                <b aria-hidden="true">↗</b>
              </button>
              <button className="mode-option mode-option-time" type="button" onClick={() => startNewGame("timeAttack")}>
                <span className="mode-number">모드 02 · 3초 제한</span>
                <strong>타임어택</strong>
                <span>나와 테이피 모두 차례마다 3초 안에 입력</span>
                <b aria-hidden="true">↗</b>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
