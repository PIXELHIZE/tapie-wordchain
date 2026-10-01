import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import WordInput from "./WordInput"
import WordList from "./WordList"
import RankingList from "./RankingList"
import type { GameSnapshot, RankingEntry } from "../shared/game"
import { getAllowedInitials, isValidWord } from "./utils/WordChain"
import { ApiError, finishGameRequest, rankingRequest, startGameRequest, submitWordRequest } from "./utils/GameApi"

const Arrow = () => <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
type ActiveGame = { data: GameSnapshot; deadline: number }
const activeGame = (data: GameSnapshot): ActiveGame => ({ data, deadline: Date.now() + data.remainingMs })

const App = () => {
  const [game, setGame] = useState<ActiveGame | null>(null)
  const [clock, setClock] = useState({ deadline: 0, remainingMs: 12000 })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [finishError, setFinishError] = useState("")
  const [registered, setRegistered] = useState<RankingEntry | null>(null)
  const [nickname, setNickname] = useState(() => { try { return localStorage.getItem("wordchain-nickname") || "" } catch { return "" } })
  const rulesRef = useRef<HTMLDialogElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const data = game?.data
  const words = data?.words ?? []
  const lastWord = words.at(-1)
  const requiredLetter = lastWord?.at(-1)
  const allowedInitials = requiredLetter ? getAllowedInitials(requiredLetter) : []
  const remainingMs = game ? clock.deadline === game.deadline ? clock.remainingMs : data!.remainingMs : 12000
  const isFinished = data?.status === "finished"

  useEffect(() => () => { requestRef.current?.abort(); window.speechSynthesis?.cancel() }, [])

  const cancelRequests = () => {
    generation.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    window.speechSynthesis?.cancel()
    setPending(false)
    setError("")
    setFinishError("")
    setRegistered(null)
  }

  const startGame = async () => {
    cancelRequests()
    const current = generation.current
    const controller = new AbortController()
    requestRef.current = controller
    setPending(true)
    try {
      const { game: next } = await startGameRequest(controller.signal)
      if (current === generation.current) setGame(activeGame(next))
    } catch {
      if (current === generation.current) setError("게임을 시작하지 못했어요. 다시 시도해 주세요.")
    } finally {
      if (current === generation.current) { requestRef.current = null; setPending(false) }
    }
  }

  const goHome = () => { cancelRequests(); setGame(null) }

  const finishGame = useCallback(async (reason: "timeout" | "forfeit") => {
    if (!data || data.status === "finished" || requestRef.current) return
    const current = generation.current
    const controller = new AbortController()
    requestRef.current = controller
    setPending(true)
    setError("")
    try {
      const { game: next } = await finishGameRequest(data.id, reason, controller.signal)
      if (current === generation.current) { setGame(activeGame(next)); setFinishError("") }
    } catch {
      if (current === generation.current) setFinishError("경기 종료를 확인하지 못했어요.")
    } finally {
      if (current === generation.current) { requestRef.current = null; setPending(false) }
    }
  }, [data])

  useEffect(() => {
    if (!game || game.data.status === "finished" || pending) return
    const interval = window.setInterval(() => setClock({ deadline: game.deadline, remainingMs: Math.max(0, game.deadline - Date.now()) }), 50)
    return () => window.clearInterval(interval)
  }, [game, pending])

  useEffect(() => {
    if (!game || isFinished || pending || finishError || remainingMs > 0) return
    const timer = window.setTimeout(() => { void finishGame("timeout") }, 0)
    return () => window.clearTimeout(timer)
  }, [game, isFinished, pending, remainingMs, finishError, finishGame])

  const handleSubmit = async (text: string) => {
    if (!data || isFinished || pending || requestRef.current) return false
    const word = text.trim().normalize("NFC")
    const message = isValidWord(lastWord, word, words)
    if (message) { setError(message); return false }
    const current = generation.current
    const controller = new AbortController()
    requestRef.current = controller
    setPending(true)
    setError("")
    try {
      const { game: next } = await submitWordRequest(data, word, controller.signal)
      if (current !== generation.current) return false
      setGame(activeGame(next))
      return true
    } catch (cause) {
      if (current === generation.current) {
        if (cause instanceof ApiError && cause.game) {
          setGame(activeGame(cause.game))
          if (cause.game.revision > data.revision && cause.game.words[data.words.length] === word) return true
        }
        setError(cause instanceof ApiError ? cause.message : "연결을 확인하고 다시 시도해 주세요.")
      }
      return false
    } finally {
      if (current === generation.current) { requestRef.current = null; setPending(false) }
    }
  }

  const registerRanking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!data || requestRef.current || registered) return
    const current = generation.current
    const controller = new AbortController()
    requestRef.current = controller
    setPending(true)
    setError("")
    try {
      const { entry } = await rankingRequest(data.id, nickname, controller.signal)
      if (current === generation.current) {
        setRegistered(entry)
        try { localStorage.setItem("wordchain-nickname", entry.nickname) } catch { /* Storage is optional. */ }
      }
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof ApiError ? cause.message : "기록을 등록하지 못했어요. 다시 시도해 주세요.")
    } finally {
      if (current === generation.current) { requestRef.current = null; setPending(false) }
    }
  }

  const readLastWord = () => {
    if (!lastWord) return
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { setError("이 브라우저는 단어 읽기를 지원하지 않아요."); return }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(lastWord)
    utterance.lang = "ko-KR"
    utterance.rate = .9
    window.speechSynthesis.speak(utterance)
  }

  return <div className="app-shell">
    <header className="site-header">
      <button className="brand" onClick={goHome} aria-label="끝말잇기 홈"><span className="brand-mark" aria-hidden="true">↗</span><span>TAPIE<span className="brand-divider">/</span>끝말잇기</span></button>
      {game ? <button className="text-button" onClick={goHome}>홈으로 <Arrow /></button> : <button className="text-button" onClick={() => rulesRef.current?.showModal()}>게임 방법 <span className="help-icon" aria-hidden="true">?</span></button>}
    </header>
    <main id="main">
      {!game ? <section className="home-screen" aria-labelledby="home-title">
        <div className="hero"><div className="hero-copy"><h1 id="home-title">끝말잇기.<br />내 기록은 어디까지?</h1><p>빠르게 이어갈수록, 길게 입력할수록 더 높은 점수.</p><button className="button-dark primary-start" onClick={() => { void startGame() }} disabled={pending}>{pending ? "준비 중" : "시작하기"}<Arrow /></button>{error && <p className="word-error" role="alert">{error}</p>}</div>
          <div className="word-art" aria-hidden="true"><div className="art-word art-word-first"><span>사</span><span className="art-dark">과</span></div><span className="art-connector">↘</span><div className="art-word art-word-second"><span className="art-outline">과</span><span className="art-dark">일</span></div><span className="art-connector art-connector-second">↘</span><div className="art-word art-word-third"><span className="art-outline">일</span><span>기</span></div></div>
        </div>
        <RankingList />
      </section> : <section className="game-screen" aria-labelledby="game-title">
        <div className="game-heading"><h1 id="game-title">끝말잇기<span className="round-label">라운드 {String(data!.revision + 1).padStart(2, "0")}</span></h1><button className="text-button" disabled={pending} onClick={() => { void startGame() }}>새 게임 <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 5v6h-6M20 11a8 8 0 1 0-1 6" /></svg></button></div>
        <div className="game-layout"><div className="play-column">
          <div className="scoreboard survival-score" aria-label="현재 점수"><span>내 점수</span><strong aria-live="polite">{data!.score.toLocaleString()}<span>점</span></strong>{data!.lastGain > 0 && <span className="score-gain" key={data!.revision}>+{data!.lastGain}</span>}<span className="bot-opponent">상대 테이피</span></div>
          <div className={`game-board ${isFinished ? "game-board-finished" : ""} ${remainingMs <= 3000 && !isFinished && !pending ? "game-board-urgent" : ""}`}>
            <div className="board-top"><span className="turn-status" role="status">{isFinished ? "경기 종료" : finishError ? "연결 확인 필요" : pending ? "테이피 생각 중" : "내 차례"}{pending && <span className="thinking-dots" aria-hidden="true"><i /><i /><i /></span>}</span>{!isFinished && <span className="timer" aria-label={`제한 시간 ${data!.turnDurationMs / 1000}초`}><strong aria-hidden="true">{(remainingMs / 1000).toFixed(1)}</strong><span aria-hidden="true">초</span></span>}</div>
            {isFinished ? <div className="result-content" role="status"><h2>테이피의 승리</h2><strong className="result-score">{data!.score.toLocaleString()}<span>점</span></strong><p>{data!.reason === "forfeit" ? "기권했어요." : "제한 시간이 끝났어요."} {data!.revision}개의 단어를 이었어요.</p><button className="button-light" disabled={pending} onClick={() => { void startGame() }}>한 판 더 <Arrow /></button></div> : finishError ? <div className="result-content"><h2>연결을 확인해 주세요</h2><p>{finishError}</p><button className="button-light" disabled={pending} onClick={() => { void finishGame("timeout") }}>다시 확인 <Arrow /></button></div> : <div className="word-prompt"><p>{requiredLetter ? "이 글자로 이어주세요" : "어떤 단어든 좋아요"}</p><strong className={requiredLetter ? "required-letter" : "first-word"}>{requiredLetter ?? "첫 단어"}</strong>{allowedInitials.length > 1 && <span className="allowed-initials">{allowedInitials.join(" · ")} 시작 가능</span>}{lastWord && <div className="previous-word"><span>이전 단어</span><strong>{lastWord}</strong><button onClick={readLastWord} aria-label={`이전 단어 ${lastWord} 읽기`}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m11 5-5 4H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></svg></button></div>}</div>}
            {!isFinished && <div className="time-track" role="progressbar" aria-label="남은 시간" aria-valuemin={0} aria-valuemax={data!.turnDurationMs} aria-valuenow={Math.ceil(remainingMs)} aria-valuetext={`${(remainingMs / 1000).toFixed(1)}초 남음`}><span style={{ transform: `scaleX(${remainingMs / data!.turnDurationMs})` }} /></div>}
          </div>
          {!isFinished && !finishError && <WordInput key={data!.id} onSubmit={handleSubmit} disabled={pending || remainingMs === 0} error={error} remainingMs={remainingMs} onEdit={() => setError("")} />}
          {isFinished && data!.score > 0 && <div className="ranking-registration">{registered ? <div className="registered-result" role="status"><strong>{registered.rank}위에 등록됐어요.</strong><span>{registered.nickname} · {registered.score.toLocaleString()}점</span><button className="text-button" onClick={goHome}>전체 랭킹 <Arrow /></button></div> : <form onSubmit={registerRanking}><label htmlFor="nickname">랭킹에 기록 남기기</label><div className="registration-row"><input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={12} placeholder="닉네임" autoComplete="nickname" disabled={pending} /><button className="button-dark" disabled={pending || !nickname.trim()}>{pending ? "등록 중" : "등록하기"}</button></div>{error && <p className="word-error" role="alert">{error}</p>}</form>}</div>}
          <div className="game-actions">{!isFinished && <><span className="pace-note">{data!.turnDurationMs > 3000 ? `${2 - data!.revision % 2}라운드 뒤 ${Math.max(3, data!.turnDurationMs / 1000 - 2)}초` : "최종 속도 · 3초"}</span><button className="text-button muted-button" disabled={pending} onClick={() => { void finishGame("forfeit") }}>기권하기</button></>}</div>
        </div><aside className="history-column" aria-labelledby="history-title"><div className="history-heading"><h2 id="history-title">이어진 단어</h2><span>{words.length}</span></div><WordList words={words} /></aside></div>
      </section>}
    </main>
    <dialog className="rules-dialog" ref={rulesRef} aria-labelledby="rules-title" onClick={(event) => { if (event.target === event.currentTarget) rulesRef.current?.close() }}><div className="dialog-heading"><h2 id="rules-title">게임 방법</h2><button className="close-button" onClick={() => rulesRef.current?.close()} aria-label="게임 방법 닫기">×</button></div><ol><li>두 글자 이상의 한글 단어를 입력하세요.</li><li>앞 단어의 마지막 글자로 이어주세요. 중복과 한방 단어는 사용할 수 없어요.</li><li>글자당 10점, 남은 시간 1초당 5점이 쌓여요.</li></ol><p>12초로 시작해 2라운드마다 2초씩, 최소 3초까지 줄어들어요. 테이피는 반드시 답하니 끝까지 버티며 최고 점수에 도전하세요.</p><button className="button-dark" onClick={() => rulesRef.current?.close()}>알겠어요 <Arrow /></button></dialog>
  </div>
}

export default App
