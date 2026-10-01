import { useEffect, useRef, useState, type FormEvent } from "react"

type Props = {
    onSubmit: (word: string) => boolean | Promise<boolean>
    disabled: boolean
    error: string
    statusMessage: string
}

const WordInput = ({ onSubmit, disabled, error, statusMessage }: Props) => {
    const [text, setText] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!disabled) inputRef.current?.focus()
    }, [disabled])

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const word = text.trim()
        if (!word || disabled || isSubmitting) return

        setIsSubmitting(true)
        try {
            if (await onSubmit(word)) setText("")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <form className={`word-form ${error ? "word-form-error" : ""}`} onSubmit={handleSubmit}>
            {error && (
                <div className="word-error-banner" id="word-error" role="alert">
                    <span className="word-error-icon" aria-hidden="true">!</span>
                    <span><strong>입력한 단어를 사용할 수 없어요</strong>{error}</span>
                </div>
            )}
            <label className="word-input-wrap">
                <span className="sr-only">단어 입력</span>
                <input
                    ref={inputRef}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="단어를 입력하세요"
                    autoComplete="off"
                    disabled={disabled}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "word-error" : undefined}
                />
                <kbd>엔터</kbd>
            </label>
            <button className="submit-button" type="submit" disabled={disabled || isSubmitting || !text.trim()}>
                <span>단어 잇기</span><span className="submit-arrow" aria-hidden="true">↗</span>
            </button>
            <p className="input-message" aria-live="polite">
                {error ? "다른 단어로 다시 시도해 주세요." : statusMessage}
            </p>
        </form>
    )
}

export default WordInput
