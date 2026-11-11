# DEV RADAR — 개발팀 주간 기술 브리핑

매주 GitHub 트렌딩 TOP 7을 기록하고, 그중 우리 업무에 쓸 만한 것을 직접 테스트해 판정·공유하는 체계입니다.
수집은 자동으로, 판단은 직접 써 본 뒤에 합니다.

## 왜 하나

- 개발 도구와 AI 에이전트 생태계는 주 단위로 바뀝니다. 개인 감이 아니라 **기록**으로 흐름을 잡습니다.
- 러브오피스에 붙일 만한 도구를 **먼저 검증**해서, 팀이 시행착오 없이 도입할 수 있게 합니다.
- 결과를 **주 단위로 공유**해 팀 전체가 같은 정보를 봅니다.

## 운영 사이클

| 단계 | 주기 | 내용 |
|---|---|---|
| 1. 수집 | 매일 21:17 (자동) | GitHub Actions가 [GitHub 주간 트렌딩](https://github.com/trending?since=weekly)을 읽어 이번 주 기록을 갱신. 일요일 마지막 갱신으로 마감 |
| 2. 선정·요약 | 주 1회 | 상위 7개를 그 주 TOP 7으로 기록하고, 레포 설명을 Claude로 한국어 요약 (`data/summaries.json`) |
| 3. 테스트 | 주 2~3개 | Claude Code로 설치·실행해 보고 러브오피스 적용 가능성 검토 |
| 4. 판정·공유 | 주 1회 | 도입·시험·검토·보류로 판정해 레이더에 반영, 사이트의 '전달용 요약'을 주간보고·팀 채널에 공유 |

## 판정 기준 (레이더 링)

| 링 | 의미 |
|---|---|
| 도입 (adopt) | 검증 완료. 바로 써도 됨 |
| 시험 (trial) | 작은 범위에서 실제로 써 보는 중 |
| 검토 (assess) | 가능성이 있어 더 지켜봄 |
| 보류 (hold) | 지금은 쓰지 않기로 함 |
| 포착 | 트렌딩에 올랐고 아직 테스트 전 (자동) |

분야(사분면)는 레포 이름·설명의 키워드로 자동 분류합니다: 에이전트·자동화 / AI 모델·데이터 / 개발 도구 / 웹·인프라.

## 화면 (레이더 관제)

- 레이더 스코프: 방위 = 분야(사분면), 거리 = 판정 단계(가운데일수록 도입). 바깥 점선 링은 테스트 전인 이번 주 TOP 7
- 회전 스윕과 잔광, 바닥 잡음은 화면 연출이고, 스윕이 표적을 지날 때 표적이 반짝이며 파문이 퍼짐
- 점이나 표적 목록을 누르면 록온 → 표적 정보(한국어 요약, 이번 주 ★, 판정과 테스트 기록) 표시
- 키보드: `←` `→` 표적 전환, `Esc` 록온 해제, `Space` 스윕 정지
- 버튼: 스윕 정지, 속도(6·10·15 RPM), 약한 신호(8위 이하) 표시
- 아래: 스캔 기록(지난 호), 판정 기준과 읽는 법, 브리핑(주간보고용 요약 복사), 운영 절차
- 첫 방문 때만 짧은 부팅 화면이 나오고(아무 키나 누르면 건너뜀), 운영체제의 '동작 줄이기' 설정이면 애니메이션 없이 멈춘 레이더로 보여 줌

## 테스트 기록 추가

`data/notes.json`에 항목을 추가하고 푸시하면 사이트에 반영됩니다.

```json
[
  {
    "repo": "owner/repo",
    "date": "2026-11-12",
    "ring": "trial",
    "summary": "한 줄 판정",
    "tested": "무엇을 어떻게 해 봤는지",
    "fit": "러브오피스에 어떻게 쓸 수 있는지"
  }
]
```

- `ring`: `adopt` · `trial` · `assess` · `hold`
- `quadrant`(선택): `agent` · `model` · `tools` · `web` — 자동 분류를 덮어씁니다.

## 구조

```
index.html · style.css · app.js   사이트 (빌드 없음, data/의 JSON만 읽음)
scope.js                          레이더 스코프(캔버스): 스윕·잔광·잡음·핑
data/weeks/YYYY-Www.json          주차별 트렌딩 기록 (주간 순위 전체, 상위 7개가 TOP 7)
data/index.json                   주차 목록과 TOP 7 누적 기록 (수집기가 자동 생성)
data/summaries.json               레포별 한국어 요약
data/notes.json                   직접 테스트 기록
scripts/collect.mjs               수집기 (Node 18 이상, 의존성 없음)
scripts/serve.mjs                 로컬 미리보기 서버
.github/workflows/radar.yml       매일 수집 + GitHub Pages 배포
```

사이트 문구에 들어가는 프로젝트 이름은 `app.js` 맨 위 `PROJECT_NAME`에서 바꿉니다.

## 로컬에서 실행

```bash
node scripts/collect.mjs   # 이번 주 기록 갱신
node scripts/serve.mjs     # http://localhost:4318
```

## 자동 수집 (GitHub Actions)

저장소에 올리면 `.github/workflows/radar.yml`이 매일 21:17(KST)에 주간 트렌딩을 수집해 `data/`에 커밋합니다.
Actions 탭에서 **DEV RADAR** 워크플로를 수동 실행(Run workflow)해도 바로 수집됩니다.

## 사이트 공개 (GitHub Pages)

사이트 배포는 저장소 변수 `PAGES_ENABLED`가 `true`일 때만 돕니다. 무료 계정은 공개 저장소여야 Pages를 쓸 수 있습니다.

```bash
gh repo edit <owner>/dev-radar --visibility public --accept-visibility-change-consequences
gh api -X POST repos/<owner>/dev-radar/pages -f build_type=workflow
gh variable set PAGES_ENABLED --body true -R <owner>/dev-radar
gh workflow run radar.yml -R <owner>/dev-radar
```

배포가 끝나면 `https://<owner>.github.io/dev-radar/`에서 열립니다. 공개하기 싫으면 로컬에서 `node scripts/serve.mjs`로 보면 됩니다.
