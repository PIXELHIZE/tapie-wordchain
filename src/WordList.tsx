type Props = {
    words: string[]
}

const WordList = ({ words }: Props) => {
    if (words.length === 0) {
        return (
            <div className="empty-history">
                <span className="empty-symbol" aria-hidden="true">✳</span>
                <p>아직 이어진 단어가 없어요.</p>
                <span>첫 단어를 적어 게임을 시작하세요.</span>
            </div>
        )
    }

    return (
        <ol className="word-list">
            {[...words].reverse().map((word, reverseIndex) => {
                const index = words.length - reverseIndex - 1
                const nextWord = words[index + 1]
                return (
                    <li className="word-entry" key={`${index}-${word}`}>
                        <span className={`entry-player ${index % 2 === 1 ? "entry-player-ai" : ""}`}>{index % 2 === 0 ? "YOU" : "AI"}</span>
                        <span className="entry-word">{word}</span>
                        <span className="entry-ending">{nextWord ? `${word[word.length - 1]} →` : "LAST"}</span>
                    </li>
                )
            })}
        </ol>
    )
}

export default WordList