export const isValidWord = (prev: string | undefined, next: string, used: string[]) => {
    const normalizedNext = next.normalize("NFC")

    if (!/^[가-힣]{2,}$/u.test(normalizedNext)) {
        return "두 글자 이상의 한글 단어를 입력해 주세요."
    }
    if (used.some((word) => word.normalize("NFC") === normalizedNext)) {
        return "이미 나온 단어예요. 다른 단어를 입력해 주세요."
    }
    if (prev && prev[prev.length - 1] !== normalizedNext[0]) {
        return `‘${prev[prev.length - 1]}’(으)로 시작하는 단어를 입력해 주세요.`
    }
    return null
}