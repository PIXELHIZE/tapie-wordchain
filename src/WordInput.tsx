import { useState, type FormEvent } from "react"

type Props = {
    onSubmit: (word: string) => boolean
    disabled: boolean
    error: string
    statusMessage: string
}

const WordInput = ({ onSubmit, disabled, error, statusMessage }: Props) => {
    const [text, setText] = useState("")

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const word = text.trim()
        if (!word || !onSubmit(word)) return
        setText("")
    }

    return (
        <form className="word-form" onSubmit={handleSubmit}>
            <label className="word-input-wrap">
                <span className="sr-only">단어 입력</span>
                <input
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="단어를 입력하세요"
                    autoComplete="off"
                    disabled={disabled}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "word-error" : undefined}
                />
                <kbd>ENTER</kbd>
            </label>
            <button className="submit-button" type="submit" disabled={disabled || !text.trim()}>
                <span>단어 잇기</span><span className="submit-arrow" aria-hidden="true">↗</span>
            </button>
            <p className={`input-message ${error ? "input-error" : ""}`} id={error ? "word-error" : undefined} aria-live="polite">
                {error || statusMessage}
            </p>
        </form>
    )
}

export default WordInput