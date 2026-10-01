# 끝말잇기

테이피 봇과 단어를 이어가며 점수를 쌓는 흑백 끝말잇기 게임입니다. Cloudflare Worker에서 React 화면과 게임 API를 함께 제공하고, Cloudflare D1에 게임 상태와 닉네임 랭킹을 저장합니다.

## 게임 규칙

- 제한 시간은 12초로 시작합니다. 두 번의 봇 응답마다 2초씩 줄어들며, 11라운드부터 최소 3초를 유지합니다: **12 → 10 → 8 → 6 → 4 → 3초**.
- 두 글자 이상의 사전 단어만 인정합니다. 앞 단어의 마지막 글자 및 표시된 두음법칙으로 이어야 하며, 중복은 금지합니다.
- 사용한 단어를 제외하고 봇이 답할 수 없는 한방 단어는 거절합니다. 봇도 가능한 한 이어갈 수 있는 단어를 선택합니다. 받아들여진 단어에는 항상 봇의 답이 함께 돌아옵니다.
- 플레이어 승리 조건은 없습니다. 시간 초과나 기권으로 봇이 승리하며, 끝날 때까지 누적한 점수로 랭킹에 도전합니다.
- 단어당 점수는 **한글 글자 수 × 10 + 제출 시 남은 정수 초 × 5**입니다. 예를 들어 4글자 단어를 8초 남았을 때 제출하면 80점이 쌓입니다. 입력 중에는 예상 점수를 표시하고, 최종 점수는 Worker가 계산합니다.
- 닉네임은 한글·영문·숫자·밑줄·공백 1~12자입니다. 끝난 게임은 한 번만 등록되며, 전체 기록 상위 20개를 점수 내림차순으로 표시합니다. 동점은 등록 시간이 빠른 기록이 먼저입니다.

## 로컬 실행

Node.js 24 이상을 사용합니다.

```sh
npm ci
npm run dev
```

사전 생성과 로컬 D1 마이그레이션이 자동 실행되고 `http://localhost:5187`에서 Cloudflare 로컬 런타임을 사용합니다. 별도의 Node API 서버는 없습니다.

```sh
npm test
npm run lint
npm run build
npm run deploy:check
```

테스트는 실제 SQLite 스키마로 점수 계산, 시간 단계, 한방 차단, 동시·중복 제출, 시간 초과·기권, 점수 위조, 닉네임 및 랭킹 등록을 검증합니다.

## Cloudflare 배포

이 저장소의 `wrangler.jsonc`에는 현재 배포된 Worker와 D1 데이터베이스가 연결돼 있습니다. 인증은 Git에 저장하지 않고 Wrangler의 로그인 세션이나 `CLOUDFLARE_API_TOKEN`으로 제공합니다.

```sh
npx wrangler login
npm run db:migrate:remote
npm run deploy
```

다른 Cloudflare 계정에 배포할 때는 `account_id`를 해당 계정으로 바꾸고 `npm run db:create`로 전용 D1을 만든 뒤, 반환된 `database_id`를 설정합니다. 이후 마이그레이션과 배포를 실행합니다. `.dev.vars`, `.wrangler`, 생성된 사전, 빌드 산출물은 Git에서 제외됩니다.

정적 화면과 Worker API 구성은 [Cloudflare React SPA 가이드](https://developers.cloudflare.com/workers/vite-plugin/tutorial/)와 [정적 에셋 설정](https://developers.cloudflare.com/workers/static-assets/binding/)을 따릅니다. 데이터베이스 설정은 [D1 마이그레이션](https://developers.cloudflare.com/d1/reference/migrations/)을 참고하세요.

## 단어 데이터와 API

빌드 시 `korean_kr.sql`, `kkutu_words.txt`, `kkutu_excluded_words.txt`를 읽어 `worker/generated/words.json`을 만듭니다. Worker 런타임에서 파일시스템이나 MySQL에 접근하지 않습니다. 출처와 라이선스는 `THIRD_PARTY_NOTICES.md`를 참고하세요.

- `POST /api/games`: 서버 게임 생성
- `GET /api/games/:id`: 현재 상태 확인
- `POST /api/games/:id/words`: 단어 검증, 봇 응답, 점수 누적
- `POST /api/games/:id/finish`: 기권 또는 시간 초과 확인
- `POST /api/games/:id/ranking`: 닉네임으로 서버 점수 등록
- `GET /api/rankings`: 전체 기록 상위 20개

게임 ID는 해당 게임만 제어하는 임의의 UUID입니다. 서버가 기록·점수·마감 시간을 소유하고 차례 번호를 조건으로 갱신하여, 재전송과 동시 요청이 점수를 중복해서 올리지 못하게 합니다. 로그인 없는 공개 랭킹이므로 닉네임은 계정 소유권을 나타내지 않습니다.
