# STEP 1 — OMR → 학부모 진단 리포트 최소 수정 패치

대상 파일: `index.html`

목표: OMR 클릭 후 학부모 진단 리포트에서 깨지는 첫 번째 오류를 제거한다.

## 문제

`renderDynamicTextReport()` 내부에서 `accuracy`가 선언되기 전에 `usGradeBand` 계산에 사용된다.

현재 흐름:

```js
const totalCorrect = this.omrMarks.filter(x => x === true).length;
const totalGraded = this.omrMarks.filter(x => x !== null).length;

const studentName = this.activeStudent ? this.activeStudent.name : "학생";
const isKo = this.langMode === 'ko';
const usGradeBand = accuracy >= 88 ? "US Grade 9 Honors-ready" : accuracy >= 70 ? "US Grade 9 On-track" : "US Grade 9 Intervention";
```

이 상태에서는 `accuracy is not defined` 오류가 발생할 수 있다.

## 최소 수정

아래 한 줄을 `usGradeBand`보다 위에 추가한다.

```js
const accuracy = totalGraded === 0 ? 0 : Math.round((totalCorrect / totalGraded) * 100);
```

## 수정 후 형태

```js
const totalCorrect = this.omrMarks.filter(x => x === true).length;
const totalGraded = this.omrMarks.filter(x => x !== null).length;
const accuracy = totalGraded === 0 ? 0 : Math.round((totalCorrect / totalGraded) * 100);

const studentName = this.activeStudent ? this.activeStudent.name : "학생";
const isKo = this.langMode === 'ko';
const usGradeBand = accuracy >= 88 ? "US Grade 9 Honors-ready" : accuracy >= 70 ? "US Grade 9 On-track" : "US Grade 9 Intervention";
```

## 금지

- MathJax 수정 금지
- Cloud Run URL 수정 금지
- AI 호출부 수정 금지
- 전체 UI 수정 금지
- 다른 함수 동시 수정 금지

## 테스트

1. OMR에서 O/X 3개 이상 클릭
2. 학부모 진단 리포트 탭 진입
3. 콘솔에 `accuracy is not defined` 오류가 없는지 확인
4. 점수/정답률/US Grade Band 표시 확인
