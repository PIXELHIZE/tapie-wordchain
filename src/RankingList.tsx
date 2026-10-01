import { useEffect, useState } from "react"
import type { RankingEntry } from "../shared/game"
import { rankingsRequest } from "./utils/GameApi"

const RankingList = () => {
  const [entries, setEntries] = useState<RankingEntry[] | null>(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void rankingsRequest(controller.signal).then(({ rankings }) => {
      if (!controller.signal.aborted) { setEntries(rankings); setError("") }
    }).catch(() => {
      if (!controller.signal.aborted) setError("랭킹을 불러오지 못했어요.")
    })
    return () => controller.abort()
  }, [retry])

  return <section className="ranking-section" aria-labelledby="ranking-title">
    <div className="ranking-heading"><h2 id="ranking-title">랭킹</h2><span>최고 점수 TOP 20</span></div>
    {error ? <div className="ranking-empty" role="status"><p>{error}</p><button className="text-button" onClick={() => setRetry((value) => value + 1)}>다시 불러오기 ↗</button></div> :
      entries === null ? <p className="ranking-empty" role="status">기록을 불러오는 중이에요.</p> :
      !entries.length ? <p className="ranking-empty">첫 번째 기록의 주인공이 되어보세요.</p> :
      <ol className="ranking-list">{entries.map((entry) => <li className="ranking-entry" key={`${entry.rank}-${entry.createdAt}`}><span className={`ranking-position ${entry.rank <= 3 ? "ranking-position-top" : ""}`}>{String(entry.rank).padStart(2, "0")}</span><strong>{entry.nickname}</strong><span className="ranking-score">{entry.score.toLocaleString()}<span>점</span></span></li>)}</ol>}
  </section>
}

export default RankingList
