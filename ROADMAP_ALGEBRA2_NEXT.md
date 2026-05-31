# ROADMAP_ALGEBRA2_NEXT

## 목표

GFIELD Algebra2 Smart Placement Hub를 로컬 PC/Cursor 중심이 아니라 다음 구조로 운영한다.

```text
GPT
→ 설계/검수/지시

Telegram Bot
→ 모바일 명령창

Google Cloud VM
→ 실제 실행/백업/배포/로그 확인

GitHub
→ 기준 저장소/백업/태그/릴리즈

Cloud Run
→ Gemini 프록시

Google Drive
→ 대용량 문항/출력물 저장소
```

## Phase 0 — 기준선 고정

- 기준 커밋: `50878cd10036e0e82528ed482be8946131746aba`
- GitHub main을 기준선으로 고정
- VM 작업폴더의 modified 상태 제거
- 실제 HTML 백업 생성
- 태그 생성 권장: `backup-50878cd-stable`

완료 조건:

```text
VM algebra2 repo clean
GitHub main과 일치
실제 HTML 백업 존재
```

## Phase 1 — Telegram Bot 운영 명령 완성

필수 명령:

```text
/run status
/run deploy
/run algebra2_status
/run algebra2_backup
/run algebra2_diff
/run algebra2_restore
/run algebra2_health
```

각 명령 원칙:

- `/run status`: HQ/VM 생존 확인
- `/run algebra2_status`: algebra2 브랜치/커밋/modified/백업 확인
- `/run algebra2_backup`: GitHub에 실제 HTML 백업 생성
- `/run algebra2_diff`: 수정 전후 차이 확인
- `/run algebra2_restore`: 마지막 안정 커밋으로 복구
- `/run algebra2_health`: 서비스 URL/Cloud Run health 확인

## Phase 2 — 백업/배포 파이프라인

배포 전 순서:

```text
1. status
2. backup
3. patch
4. diff
5. smoke test
6. deploy
7. health check
```

배포 후 확인:

- 서비스 링크 열림
- Cloud Run `/api/health` 정상
- OMR 클릭 가능
- 분석 리포트 렌더링
- 로드맵 생성
- 워크북 다운로드
- 해설지 다운로드
- HTML 리포트 다운로드

## Phase 3 — 출력물 표준화

- 워크북 파일명 규칙
- 해설지 파일명 규칙
- 학부모 상담용 리포트 파일명 규칙
- 한글/영문 리포트 구분
- Google Drive 저장 폴더 규칙

권장 파일명:

```text
GFIELD_Algebra2_Workbook_{student}_{YYYYMMDD}.html
GFIELD_Algebra2_AnswerKey_{student}_{YYYYMMDD}.html
GFIELD_Algebra2_Report_{student}_{YYYYMMDD}.html
```

## Phase 4 — 분석 고도화

추가할 분석 축:

- 기초 결손형
- 단순 실수형
- 선수개념 부족형
- 고난도 적응형
- 미국 학년 기준 위치
- Honors/AP 대비 트랙
- Top 30/50 대학 로드맵 트랙

리포트에 포함할 항목:

```text
현재 위치
이전 진도 Prerequisite
다음 진도 Next Readiness
Track A: Honors/AP 대비
Track B: Top 30/50 대학 준비형
이번 수업이 전체 로드맵에서 차지하는 의미
```

## Phase 5 — Drive 연동형 문항 뱅크

- GitHub에는 코드만 보관
- 이미지/문항/교안/리포트 대용량 자료는 Google Drive 사용
- 프론트엔드에는 API Key 저장 금지
- Drive 파일 ID만 교체 가능한 구조 유지

## 다음 작업 우선순위

```text
Step 0: VM clean checkout
Step 1: GitHub 실제 HTML 백업 생성
Step 2: Telegram Bot algebra2 명령 안정화
Step 3: OMR snapshot 단일화
Step 4: 분석/로드맵/워크북/인쇄 연결 검증
Step 5: 교안/워크북 문항 뱅크 구조 추가
```
