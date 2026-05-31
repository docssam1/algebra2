# HANDOFF_ALGEBRA2

## 1. 현재 기준

- Repository: https://github.com/docssam1/algebra2
- Service URL: https://docssam1.github.io/algebra2/
- Branch: main
- Latest Commit: `50878cd10036e0e82528ed482be8946131746aba`
- Last Known Working Commit: `50878cd`
- Cloud Run Health URL: https://algebra2-gemini-proxy-v2-274099580288.asia-northeast3.run.app/api/health
- Cloud Run model: `gemini-2.5-flash`

## 2. 현재 반영 기능

- 깨진 한글 복구 반영 이력 존재
- 상단 엔진 표기: Gemini 엔진
- Cloud Run 프록시 기본 URL 연결
- API 요청 재시도 1회 로직 반영
- 40문항 OMR 입력 보드
- OMR 기반 학부모 진단 리포트 동적 생성
- 약점 도메인 자동 선택
- 회차/분 입력 기반 적응형 로드맵 생성
- 미국 학년 기준 밴드 문구 포함
- HTML 리포트 다운로드
- 워크북 다운로드
- 해설지 다운로드

## 3. 핵심 함수 기준

- `setOmrValue(id, status)`: 40문항 OMR 마킹
- `updateLiveAnalytics()`: 점수/정답률/리포트 갱신
- `renderDynamicTextReport()`: 학부모 진단 리포트 생성
- `generateAdaptiveCurriculum()`: OMR 기반 로드맵 생성
- `buildCustomCurriculum()`: 선택 도메인/회차/시간 기반 로드맵 생성
- `downloadCurrentReportHtml()`: 현재 리포트 HTML 다운로드
- `downloadMaterialPack(type)`: 워크북/해설지 다운로드 진입
- `buildMaterialPackHtml(type, sessions)`: 워크북/해설지 HTML 생성
- `downloadHtmlFile(filename, html)`: HTML 파일 저장

## 4. OMR 기반 파이프라인

```text
OMR 클릭
→ setOmrValue()
→ updateLiveAnalytics()
→ renderDynamicTextReport()
→ buildCustomCurriculum()
→ generateAdaptiveCurriculum()
→ downloadMaterialPack('workbook' | 'answerkey')
→ downloadCurrentReportHtml() / print
```

현재 기능 연결은 되어 있으나, 다음 작업 전 반드시 VM 작업폴더의 `index.html modified` 상태를 정리해야 한다.

## 5. 현재 위험 요소

- GitHub main은 `50878cd` 이후 추가 커밋 없음.
- VM 작업폴더에는 `index.html modified` 상태가 있을 수 있음.
- VM 작업폴더는 다음 작업 전 `origin/main` 기준으로 clean checkout 해야 한다.
- `backups/` 폴더에 실제 `.html` 백업이 있는지 재확인 필요.
- 기존 `.md` 백업 포인터는 실제 HTML 백업이 아니다.
- 대형 `index.html` 전체 재작성 금지.

## 6. 운영 구조

- GPT: 설계, 판단, 검수, 지시문, QA 기준
- Google Cloud VM: 실제 실행, 로그 확인, 배포 스크립트, 임시 작업 공간
- Telegram Bot: 모바일 관제 명령창
- GitHub: 단일 진실 소스, 커밋/태그/백업 기준
- Google Drive: 대용량 문항 이미지, 출력물, 리포트 아카이브
- Cloud Run: Gemini 프록시, API Key 비노출, 에러 분리

## 7. 절대 금지

- API Key / 토큰 노출 금지
- 부모 발송 금지
- DB 수정 금지
- Cloud Run 백엔드 임의 수정 금지
- 로컬 PC 파일 기준 작업 금지
- `index.html` 전체 재작성 금지
- 백업 없는 수정 금지

## 8. 다음 작업 전 필수 확인

```text
1. VM algebra2 작업폴더 clean checkout
2. GitHub 실제 HTML 백업 생성
3. Telegram Bot 명령 정상 여부 확인
4. 작은 패치 단위로만 진행
```
