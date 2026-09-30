import { useEffect, useState } from "react"
import logo from "./assets/tapie_mylogo.png"
import WordInput from "./WordInput"
import WordList from "./WordList"
import { getRandomComputerWord } from "./utils/ComputerOpponent"
import { isValidWord } from "./utils/WordChain"

type GameMode = "deathmatch" | "timeAttack"

const App = () => {
  const [error, setError] = useState("")
  const [words, setWords] = useState<string[]>([])
  const [isFinished, setIsFinished] = useState(false)
  const [inputResetKey, setInputResetKey] = useState(0)
  const [mode, setMode] = useState<GameMode | null>(null)
  const [isModeDialogOpen, setIsModeDialogOpen] = useState(true)
  const [remainingMs, setRemainingMs] = useState(3000)
  const currentPlayer = words.length % 2
  const isComputerTurn = currentPlayer === 1 && !isFinished && mode !== null
  const lastWord = words[words.length - 1]
  const requiredLetter = lastWord?.[lastWord.length - 1]

  useEffect(() => {
    if (mode !== "timeAttack" || isFinished) return

    const deadline = Date.now() + 3000
    const intervalId = window.setInterval(() => {
      const nextRemainingMs = Math.max(0, deadline - Date.now())
      setRemainingMs(nextRemainingMs)
      if (nextRemainingMs === 0) {
        setError(currentPlayer === 0 ? "시간 초과! TAPIE AI가 이겼어요." : "시간 초과! TAPIE AI가 제시간에 답하지 못했어요.")
        setIsFinished(true)
      }
    }, 50)

    return () => window.clearInterval(intervalId)
  }, [currentPlayer, isFinished, mode, words.length])

  useEffect(() => {
    if (!isComputerTurn) return

    let isCancelled = false
    const timeoutId = window.setTimeout(() => {
      void getRandomComputerWord(lastWord, words)
        .then((computerWord) => {
          if (isCancelled) return
          if (!computerWord) {
            setError("TAPIE AI가 이어갈 단어를 찾지 못했어요.")
            setIsFinished(true)
            return
          }

          setError("")
          setRemainingMs(3000)
          setWords((currentWords) => [...currentWords, computerWord])
        })
        .catch(() => {
          if (isCancelled) return
          setError("단어 사전에 연결할 수 없어요. 서버를 확인해 주세요.")
          setIsFinished(true)
        })
    }, 900)

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [isComputerTurn, lastWord, words])

  const handleSubmit = (word: string) => {
    const prev = words[words.length - 1]
    const result = isValidWord(prev, word, words)
    if (result) {
      setError(result)
      return false
    }

    setError("")
    setRemainingMs(3000)
    setWords([...words, word.normalize("NFC")])
    return true
  }

  const startNewGame = (selectedMode: GameMode) => {
    setMode(selectedMode)
    resetGame()
    setIsModeDialogOpen(false)
  }

  const resetGame = () => {
    setWords([])
    setError("")
    setIsFinished(false)
    setRemainingMs(3000)
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

  const finishByForfeit = () => {
    setError("")
    setIsFinished(true)
    setInputResetKey((key) => key + 1)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="TAPIE 끝말잇기 홈">
          <img className="brand-mark" src={logo} alt="" />
          <span className="brand-name">테이피 끝말잇기</span>
        </a>
        <div className="header-meta"><span className="live-dot" />{mode === "timeAttack" ? "타임어택" : "단어 데스매치"} <span className="meta-divider">/</span> VS TAPIE AI</div>
      </header>

      <main id="top">
        <section className="intro-row" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">테이피 끝말잇기 <span>·</span></p>
            <h1 id="page-title">안녕하세요끝말잇기입니다<br /><span>잘부탁드립니다.</span></h1>
          </div>
          <p className="intro-note">한 단어씩 이어가는<br />테이피봇과의 우리말 대결.</p>
        </section>

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

            <div className="players" aria-label="현재 차례">
              {[0, 1].map((player) => (
                <div className={`player ${!isFinished && currentPlayer === player ? "player-active" : ""} ${isFinished && 1 - currentPlayer === player ? "player-winner" : ""}`} key={player}>
                  <span className="player-index">0{player + 1}</span>
                  <span className="player-name">{player === 0 ? "YOU" : "TAPIE AI"}</span>
                  <span className="player-score">{words.filter((_, index) => index % 2 === player).length}</span>
                </div>
              ))}
            </div>

            <div className={`turn-board ${isFinished ? "turn-board-finished" : ""} ${isComputerTurn ? "turn-board-ai" : ""} ${mode === "timeAttack" && remainingMs < 1000 && !isFinished ? "turn-board-urgent" : ""}`} aria-live="polite">
              <div className="turn-board-top">
                <span>{isFinished ? "MATCH COMPLETE" : currentPlayer === 0 ? "YOUR TURN · PLAYER 01" : "TAPIE AI · THINKING"}</span>
                <span>{mode === "timeAttack" && !isFinished ? `${(remainingMs / 1000).toFixed(1)}s` : `ROUND ${String(words.length + 1).padStart(2, "0")}`}</span>
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
                  <span className="result-label">WINNER</span>
                  <strong>{currentPlayer === 0 ? "태이피" : "나"}</strong>
                  <span className="result-caption">{error || "기권으로 게임이 종료됐어요."}</span>
                </div>
              ) : (
                <div className="prompt-content">
                  <div>
                    <span className="prompt-label">{requiredLetter ? "이 글자로 시작" : "첫 단어를 시작하세요"}</span>
                    <strong className={`required-letter ${requiredLetter ? "has-letter" : ""}`}>{requiredLetter ?? "?"}</strong>
                  </div>
                  <span className="prompt-arrow" aria-hidden="true">↘</span>
                </div>
              )}
            </div>

            <WordInput
              key={inputResetKey}
              onSubmit={handleSubmit}
              disabled={isFinished || isComputerTurn}
              error={error}
              statusMessage={isComputerTurn ? "TAPIE AI가 단어를 고르고 있어요." : "단어를 입력하고 차례를 이어가세요."}
            />

            <div className="play-actions">
              <p className="rule-note"><span className="rule-mark">!</span> 두 글자 이상의 한글 단어 · 이미 나온 단어는 사용할 수 없어요</p>
              {!isFinished && <button className="forfeit-button" type="button" onClick={finishByForfeit}>기권하기 <span aria-hidden="true">↗</span></button>}
            </div>
          </section>

          <aside className="history-column" aria-label="단어 기록">
            <div className="section-heading history-heading">
              <div><span className="section-kicker">WORD BY WORD</span><h2>이어진 단어</h2></div>
              <span className="word-count">{String(words.length).padStart(2, "0")}</span>
            </div>
            <WordList words={words} />
            <div className="history-footer"><span>CHAIN STATUS</span><span>{words.length ? "IN PLAY" : "READY"}<i /></span></div>
          </aside>
        </div>
      </main>

      <footer className="site-footer"><span>TAPIE WORD CLUB <b>·</b> WORD BEAT 01</span><span>이어갈 단어를 입력해 리듬을 이어가세요.</span></footer>
      {isModeDialogOpen && (
        <div className="mode-overlay">
          <section className="mode-dialog" role="dialog" aria-modal="true" aria-labelledby="mode-title">
            <span className="mode-kicker">TAPIE WORD CLUB · GAME SELECT</span>
            <h2 id="mode-title">어떤 모드로<br />이어볼까요?</h2>
            <p className="mode-intro">플레이 모드를 선택하면 바로 시작해요.</p>
            <div className="mode-options">
              <button className="mode-option" type="button" onClick={() => startNewGame("deathmatch")}>
                <span className="mode-number">MODE 01</span>
                <strong>단어 데스매치</strong>
                <span>차례를 이어가며 상대가 막힐 때까지 대결</span>
                <b aria-hidden="true">↗</b>
              </button>
              <button className="mode-option mode-option-time" type="button" onClick={() => startNewGame("timeAttack")}>
                <span className="mode-number">MODE 02 · 3 SEC</span>
                <strong>타임어택</strong>
                <span>나와 AI 모두 차례마다 3초 안에 입력</span>
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