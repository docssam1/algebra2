# BACKUP_AND_DEPLOY_RULES

## 핵심 원칙

1. GitHub가 단일 진실 소스다.
2. VM은 실행 공간이지 장기 백업 저장소가 아니다.
3. 로컬 PC 파일은 기준으로 사용하지 않는다.
4. 배포 전에는 반드시 백업한다.
5. 수정은 작은 단위로 진행한다.
6. 문제 발생 시 커밋 해시로 즉시 복구한다.

## 저장 위치 원칙

```text
GitHub
→ 코드, 문서, 태그, 기준 백업

Google Cloud VM
→ 실행, 임시 작업, 로그 확인

Google Drive
→ 대용량 문항, 이미지, PDF, 출력물
```

## GitHub 백업 원칙

권장 백업 방식:

```text
1. 안정 커밋 태그 생성
2. 실제 HTML 백업 파일 저장
3. 릴리즈 노트 또는 HANDOFF 문서 업데이트
```

권장 태그명:

```text
backup-YYYYMMDD-HHMM
backup-50878cd-stable
```

권장 백업 파일:

```text
backups/index_base_YYYYMMDD_HHMMSS.html
```

주의:

- `.md` 백업 포인터는 실제 HTML 백업이 아니다.
- 실제 복구 가능한 `.html` 파일이 있어야 한다.
- 대형 백업 파일을 VM에 계속 쌓지 않는다.

## VM 백업 원칙

VM 백업은 임시 보관만 허용한다.

권장 위치:

```text
/home/gfield7265/gfield-projects/algebra2/backups/
/opt/algebra2/backups/
```

정리 원칙:

- 최근 1~3개만 유지
- 오래된 출력물은 Google Drive로 이동
- VM 30GB 디스크를 장기 보관소로 사용하지 않는다.

## 배포 전 체크리스트

```text
1. /run algebra2_status
2. GitHub main과 VM 커밋 일치 확인
3. Working tree clean 확인
4. /run algebra2_backup
5. 작은 패치 적용
6. git diff 확인
7. smoke test
8. 배포
```

## Smoke Test

배포 전후 반드시 확인한다.

```text
1. 서비스 URL 열림
2. Cloud Run /api/health 정상
3. OMR O/X 클릭 가능
4. 점수/정답률 반영
5. 학부모 진단 리포트 표시
6. 로드맵 생성
7. 워크북 다운로드
8. 해설지 다운로드
9. HTML 리포트 다운로드
```

## 금지 사항

- API Key / Token 프론트엔드 노출 금지
- 부모 발송 테스트 금지
- 운영 DB 수정 금지
- Cloud Run 백엔드 임의 수정 금지
- `index.html` 전체 재작성 금지
- GitHub main 직접 대규모 수정 금지
- 백업 없는 패치 금지
- VM modified 상태에서 새 작업 시작 금지

## 복구 규칙

문제 발생 시:

```text
1. 현재 상태 확인
2. 변경 diff 저장
3. 마지막 안정 커밋 확인
4. git reset --hard <stable_commit>
5. smoke test 재실행
6. 복구 결과 Telegram으로 보고
```

기준 안정 커밋:

```text
50878cd10036e0e82528ed482be8946131746aba
```

## Telegram Bot 명령 규칙

권장 명령:

```text
/run status
/run deploy
/run algebra2_status
/run algebra2_backup
/run algebra2_diff
/run algebra2_restore
/run algebra2_health
```

명령 추가 원칙:

- 위험 명령은 직접 shell 자유 실행으로 열지 않는다.
- 허용된 스크립트만 실행한다.
- `rm`, 자유 `git push`, API Key 출력 명령은 금지한다.
- 부모 발송/DB 수정 명령은 별도 승인 전까지 만들지 않는다.

## 작업 승인 규칙

모바일 운영 기준:

```text
GPT가 설계
→ Telegram으로 status/backup
→ VM에서 작은 패치
→ diff 확인
→ 원장님 승인
→ 배포
→ health 확인
```

완료 보고 형식:

```text
완료.
Commit:
확인 링크:
다음 작업:
```
