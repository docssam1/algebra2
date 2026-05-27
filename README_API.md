# Algebra2 GPT Proxy

이 저장소에는 GPT 중계 서버가 추가되어 있습니다.

## 파일

- server.js: GPT 중계 서버
- package.json: 서버 실행 의존성
- .env.example: 서버 환경변수 예시

## 실행 순서

1. 저장소를 서버에 받습니다.
2. 의존성을 설치합니다.
3. 환경변수 파일을 만듭니다.
4. 서버를 실행합니다.

## 상태 확인

브라우저에서 다음 주소를 열어 확인합니다.

/api/health

정상 응답에는 ok true, engine openai, model 값이 포함됩니다.

## 프론트 연결

index.html의 AI 호출 함수는 최종적으로 /api/openai 주소를 호출하도록 바꿔야 합니다.

운영 구조는 다음과 같습니다.

GitHub Pages 화면 -> GPT 중계 서버 -> GPT API

API 키는 절대 index.html에 넣지 않습니다.
