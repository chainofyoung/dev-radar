// DEV RADAR — 신문 지면 + 실물 레이더 계기. data/ 아래 JSON만 읽어 그린다.
import { createRadar, GAIN_LABELS } from './scope.js';

const PROJECT_NAME = '러브오피스'; // 사이트 문구에 들어가는 우리 프로젝트 이름
const TOP_N = 7;
const TZ = 'Asia/Seoul';
const SPEEDS = [6, 10, 15]; // 스윕 속도(RPM)
const MOTION = !matchMedia('(prefers-reduced-motion: reduce)').matches; // 동작 줄이기 설정이면 멈춘 화면으로

// 분야 = 레이더 사분면(방위). 레포 이름+설명에서 키워드가 가장 많이 걸리는 분야로 자동 분류한다.
// 같은 점수면 위에 있는 분야가 우선. notes.json의 quadrant로 직접 지정할 수도 있다.
const QUADRANTS = [
  {
    key: 'agent', label: '에이전트 · 자동화', sector: [270, 360],
    words: ['agent', 'agents', 'agentic', 'multi-agent', 'subagent', 'subagents', 'bot', 'bots', 'automation', 'automate',
      'autonomous', 'mcp', 'skill', 'skills', 'claude code', 'codex', 'copilot', 'computer use', 'workflow', 'workflows',
      'assistant', 'orchestration', '에이전트', '자동화', '智能体'],
  },
  {
    key: 'model', label: 'AI 모델 · 데이터', sector: [0, 90],
    words: ['ai', 'llm', 'llms', 'model', 'models', 'inference', 'rag', 'embedding', 'embeddings', 'vector', 'ontology',
      'semantic', 'graph', 'reasoning', 'data', 'dataset', 'datasets', 'scraping', 'scraper', 'crawl', 'crawler', 'ml',
      'machine learning', 'deep learning', 'training', 'fine-tuning', 'diffusion', 'vision', 'speech', 'voice', 'tts', 'asr',
      'transcription', 'dictation', 'ocr', 'gpt', 'llama', 'gemini', 'qwen', 'deepseek', 'grok', '인공지능', '모델', '模型'],
  },
  {
    key: 'tools', label: '개발 도구', sector: [180, 270],
    words: ['cli', 'git', 'worktree', 'worktrees', 'editor', 'ide', 'terminal', 'shell', 'vim', 'neovim', 'vscode', 'lint',
      'linter', 'formatter', 'test', 'testing', 'debug', 'debugger', 'build', 'compiler', 'devtools', 'code review', 'pr',
      'review', 'reviewer', 'refactor', 'productivity', 'dotfiles', 'commit', 'package manager'],
  },
  {
    key: 'web', label: '웹 · 인프라', sector: [90, 180],
    words: ['web', 'website', 'react', 'vue', 'svelte', 'nextjs', 'next.js', 'ui', 'ux', 'css', 'tailwind', 'frontend',
      'component', 'components', 'browser', 'server', 'backend', 'api', 'database', 'sql', 'postgres', 'redis', 'cloud',
      'docker', 'kubernetes', 'k8s', 'serverless', 'deploy', 'hosting', 'network', 'proxy', 'security', 'audit', 'auth',
      'infra', 'infrastructure', 'monitoring', 'observability'],
  },
];

// 판정 = 레이더 링(거리). 반지름은 레이더 화면 반지름 대비 비율.
const RINGS = [
  { key: 'adopt', label: '도입', inner: 0.07, outer: 0.27, desc: '검증 완료. 바로 써도 됩니다.' },
  { key: 'trial', label: '시험', inner: 0.27, outer: 0.47, desc: '작은 범위에서 실제로 써 보는 중입니다.' },
  { key: 'assess', label: '검토', inner: 0.47, outer: 0.64, desc: '가능성이 있어 더 지켜봅니다.' },
  { key: 'hold', label: '보류', inner: 0.64, outer: 0.77, desc: '지금은 쓰지 않기로 했습니다.' },
  { key: 'detected', label: '포착', inner: 0.77, outer: 0.92, desc: '이번 주 TOP 7, 아직 테스트 전입니다.' },
  { key: 'weak', label: '약한 신호', inner: 0.92, outer: 0.985, desc: '8위 아래 신호. RANGE 다이얼로 켭니다.' },
];

const QUAD = Object.fromEntries(QUADRANTS.map((q, order) => [q.key, { ...q, order }]));
const RING = Object.fromEntries(RINGS.map((r, order) => [r.key, { ...r, order }]));

// 레이더 화면의 ARPA 기호와 같은 모양(지면용 아이콘)
const SYMBOL_PATHS = {
  adopt: '<circle r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle r="9" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  trial: '<rect x="-7" y="-7" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  assess: '<path d="M0 -9 L9 0 L0 9 L-9 0 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  hold: '<circle r="7.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M-5.5 5.5 L5.5 -5.5" stroke="currentColor" stroke-width="1.6"/>',
  detected: '<circle r="7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.5 2.5"/>',
  weak: '<path d="M-6 3 A7 7 0 0 1 6 3" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
};
const symbol = (verdict, cls = '') =>
  `<svg class="${cls} ink-${verdict}" viewBox="-12 -12 24 24" aria-hidden="true">${SYMBOL_PATHS[verdict]}</svg>`;

/* ── 공통 도구 ─────────────────────────── */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = new Intl.NumberFormat('ko-KR');
const short = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
const todayKST = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
const pad2 = (n) => String(n).padStart(2, '0');
const ghUrl = (repo) => `https://github.com/${repo.split('/').map(encodeURIComponent).join('/')}`;
const dotted = (ymd) => String(ymd ?? '').replaceAll('-', '.');
const monthDay = (ymd) => ymd.slice(5).replace('-', '.');
const weekLabel = (id) => `${id.slice(0, 4)}년 ${Number(id.slice(6))}주차`;
const issueLabel = (no) => (no === 1 ? '창간호' : `제${no}호`);
const isOpen = (week) => todayKST <= week.end;
const brg = (deg) => `${deg.toFixed(1).padStart(5, '0')}°`;

function countBy(list, keyOf) {
  const counts = new Map();
  for (const item of list) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

const wordPatterns = new Map();
function hasWord(haystack, word) {
  if (/[^\x00-\x7f]/.test(word)) return haystack.includes(word);
  let pattern = wordPatterns.get(word);
  if (!pattern) {
    pattern = new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
    wordPatterns.set(word, pattern);
  }
  return pattern.test(haystack);
}

function quadrantOf(item, override) {
  if (override && QUAD[override]) return override;
  const haystack = ` ${item.repo.replace(/[/_.-]+/g, ' ')} ${item.desc ?? ''} `.toLowerCase();
  let best = 'tools';
  let bestScore = 0;
  for (const q of QUADRANTS) {
    const score = q.words.filter((w) => hasWord(haystack, w)).length;
    if (score > bestScore) [best, bestScore] = [q.key, score];
  }
  return best;
}

// 같은 레포는 늘 같은 자리에 오도록 이름으로 시드를 만든다.
function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function getJson(url, fallback) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

/* ── 데이터 ───────────────────────────── */
function buildContext(index, week, notes, summaries) {
  const validNotes = (Array.isArray(notes) ? notes : [])
    .filter((n) => n?.repo && RING[n.ring] && !['detected', 'weak'].includes(n.ring))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const noteByRepo = new Map(validNotes.map((n) => [n.repo, n])); // 같은 레포는 가장 최근 기록
  const items = week.items.map((it) => {
    const note = noteByRepo.get(it.repo) ?? null;
    return { ...it, quad: quadrantOf(it, note?.quadrant), ko: summaries[it.repo] ?? '', note };
  });
  return {
    index,
    week,
    summaries,
    notes: validNotes,
    noteByRepo,
    items,
    top: items.slice(0, TOP_N),
    rest: items.slice(TOP_N),
    issueNo: index.weeks.findIndex((w) => w.id === week.week) + 1,
    strongest: items.reduce((a, b) => (b.gained > a.gained ? b : a)),
  };
}

function placeTargets(targets) {
  const placed = [];
  for (const t of targets) {
    const ring = RING[t.verdict];
    const [b0, b1] = QUAD[t.quad].sector;
    const rand = seeded(hash(`${t.repo}:${t.verdict}`));
    const inner = Math.max(ring.inner, 0.1);
    const minGap = t.verdict === 'weak' ? 0.05 : 0.09;
    let best = null;
    for (let i = 0; i < 90; i++) {
      const bearing = b0 + 9 + rand() * (b1 - b0 - 18);
      const r = inner + (ring.outer - inner) * (0.2 + rand() * 0.6);
      const x = r * Math.sin((bearing * Math.PI) / 180);
      const y = -r * Math.cos((bearing * Math.PI) / 180);
      const gap = placed.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.y - y)), Infinity);
      if (!best || gap > best.gap) best = { bearing, r, x, y, gap };
      if (gap >= minGap) break;
    }
    Object.assign(t, { bearing: best.bearing, rFrac: best.r });
    placed.push(best);
  }
}

function buildTargets(ctx) {
  const tracks = ctx.top.map((it) => ({
    id: `TRK-${pad2(it.rank)}`, code: pad2(it.rank), rank: it.rank, repo: it.repo,
    item: it, note: it.note, quad: it.quad, verdict: it.note ? it.note.ring : 'detected',
  }));
  // TOP 7 밖에서 테스트한 레포도 판정 링에 올린다.
  let extra = 0;
  for (const note of ctx.noteByRepo.values()) {
    if (tracks.some((t) => t.repo === note.repo)) continue;
    const known = ctx.items.find((it) => it.repo === note.repo);
    const reg = ctx.index.repos[note.repo] ?? {};
    const base = known ?? { repo: note.repo, desc: reg.desc ?? '', lang: reg.lang ?? null, stars: reg.stars ?? 0, forks: 0, gained: 0, ko: ctx.summaries[note.repo] ?? '' };
    const quad = quadrantOf(base, note.quadrant);
    const code = known ? pad2(known.rank) : `T${++extra}`;
    tracks.push({ id: `TRK-${code}`, code, rank: known?.rank ?? null, repo: note.repo, item: { ...base, quad }, note, quad, verdict: note.ring });
  }
  const weak = ctx.rest
    .filter((it) => !it.note)
    .map((it) => ({ id: `ECH-${pad2(it.rank)}`, code: pad2(it.rank), rank: it.rank, repo: it.repo, item: it, note: null, quad: it.quad, verdict: 'weak' }));
  placeTargets([...tracks, ...weak]);
  return { tracks, weak };
}

/* ── 지면 조각 ─────────────────────────── */
function stamp(note) {
  if (!note) return '<span class="stamp stamp--pending">테스트 전</span>';
  return `<span class="stamp stamp--${note.ring}">${RING[note.ring].label} 판정</span>`;
}

function repoLink(repo) {
  const [owner, name] = repo.split('/');
  return `<a href="${ghUrl(repo)}" target="_blank" rel="noopener"><span class="owner">${esc(owner)}/</span>${esc(name)}</a>`;
}

const eyebrow = (it) => [QUAD[it.quad].label, it.lang].filter(Boolean).map(esc).join(' · ');
// 한국어 요약이 있으면 본문으로, 원문 설명은 보조로 둔다.
const texts = (it) => (it.ko ? { dek: it.ko, en: it.desc } : { dek: it.desc, en: '' });
const toRadar = (repo) => `<button class="to-radar" type="button" data-repo="${esc(repo)}">레이더에서 보기 ↓</button>`;

function noteBlock(note) {
  if (!note) return '';
  return `<div class="note">
    <p class="note__summary">${esc(note.summary)}</p>
    ${note.tested ? `<p class="note__line"><b>테스트</b>${esc(note.tested)}</p>` : ''}
    ${note.fit ? `<p class="note__line"><b>${esc(PROJECT_NAME)} 적용</b>${esc(note.fit)}</p>` : ''}
    ${note.date ? `<p class="note__date">${esc(dotted(note.date))} 테스트</p>` : ''}
  </div>`;
}

function renderDateline(ctx) {
  const updated = new Date(ctx.week.updatedAt);
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(updated);
  const time = new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(updated);
  $('#dateline').textContent = `${date} ${time} 갱신 · ${issueLabel(ctx.issueNo)}`;
  $('#issue-meta').textContent = [
    issueLabel(ctx.issueNo),
    weekLabel(ctx.week.week),
    `${monthDay(ctx.week.start)}–${monthDay(ctx.week.end)}`,
    isOpen(ctx.week) ? '진행 중, 일요일 마감' : '마감',
  ].join(' · ');
}

function bars(entries, total) {
  const max = Math.max(...entries.map(([, n]) => n));
  return entries
    .map(([label, n]) => `<div class="bar${n === max ? ' bar--max' : ''}">
      <span class="bar__label">${esc(label)}</span>
      <span class="bar__track"><i style="width:${((n / total) * 100).toFixed(1)}%"></i></span>
      <span class="bar__n">${n}</span>
    </div>`)
    .join('');
}

function renderFront(ctx) {
  const [lead, ...briefs] = ctx.top;
  const leadText = texts(lead);
  $('#lead').innerHTML = `
    <div class="lead__rank reveal" style="--i:0" aria-label="${lead.rank}위">${lead.rank}</div>
    <div class="lead__body reveal" style="--i:1">
      <p class="eyebrow">${eyebrow(lead)}</p>
      <h3 class="lead__title">${repoLink(lead.repo)}</h3>
      ${leadText.dek ? `<p class="lead__dek">${esc(leadText.dek)}</p>` : ''}
      ${leadText.en ? `<p class="lead__en">${esc(leadText.en)}</p>` : ''}
      <p class="byline">
        <span class="gain">이번 주 +${num.format(lead.gained)}★</span>
        <span>누적 ${short.format(lead.stars)}★</span>
        <span>포크 ${short.format(lead.forks)}</span>
        ${stamp(lead.note)}
        ${toRadar(lead.repo)}
      </p>
      ${noteBlock(lead.note)}
    </div>`;

  $('#briefs').innerHTML = briefs
    .map((it, i) => {
      const t = texts(it);
      return `<li class="brief reveal" style="--i:${i + 2}">
        <div class="brief__top"><span class="brief__rank" aria-label="${it.rank}위">${it.rank}</span>${stamp(it.note)}</div>
        <p class="eyebrow">${eyebrow(it)}</p>
        <h3 class="brief__title">${repoLink(it.repo)}</h3>
        ${t.dek ? `<p class="brief__dek">${esc(t.dek)}</p>` : ''}
        ${t.en ? `<p class="brief__en">${esc(t.en)}</p>` : ''}
        <p class="byline"><span class="gain">+${num.format(it.gained)}★</span><span>누적 ${short.format(it.stars)}★</span>${toRadar(it.repo)}</p>
        ${noteBlock(it.note)}
      </li>`;
    })
    .join('');

  if (ctx.rest.length) {
    $('#more').hidden = false;
    $('#more-label').textContent = `${TOP_N + 1}–${ctx.items.length}위 보기`;
    $('#rest').innerHTML = ctx.rest
      .map((it) => `<li class="rest__item">
        <span class="rest__rank">${it.rank}</span>
        <span class="rest__name">${repoLink(it.repo)}</span>
        <span class="rest__desc">${esc(it.ko || it.desc)}</span>
        <span class="rest__gain">+${num.format(it.gained)}★</span>
      </li>`)
      .join('');
  }

  const s = ctx.strongest;
  $('#numbers').innerHTML = `
    <h3 class="box__title">이번 호 숫자</h3>
    <div class="figure reveal" style="--i:2">
      <span class="figure__label">누적 기록</span><span class="figure__value">${ctx.index.weeks.length}<small>호</small></span>
      <span class="figure__note">${esc(dotted(ctx.index.since))} 기록 시작</span>
    </div>
    <div class="figure reveal" style="--i:3">
      <span class="figure__label">누적 TOP 7 레포</span><span class="figure__value">${Object.keys(ctx.index.repos).length}<small>개</small></span>
    </div>
    <div class="figure reveal" style="--i:4">
      <span class="figure__label">직접 테스트</span><span class="figure__value">${ctx.noteByRepo.size}<small>건</small></span>
    </div>
    <div class="figure reveal" style="--i:5">
      <span class="figure__label">이번 주 ★ 최다 증가</span><span class="figure__value">+${num.format(s.gained)}</span>
      <span class="figure__note">${esc(s.repo)} · 트렌딩 ${s.rank}위</span>
    </div>
    <div class="bars reveal" style="--i:6"><p class="bars__title">TOP 7 분야</p>${bars(countBy(ctx.top, (it) => QUAD[it.quad].label), ctx.top.length)}</div>
    <div class="bars reveal" style="--i:7"><p class="bars__title">TOP 7 언어</p>${bars(countBy(ctx.top, (it) => it.lang ?? '미표기'), ctx.top.length)}</div>`;
}

// 제호 아래 속보 띠 — 모두 이번 호 실제 숫자
function renderBreaking(ctx) {
  const [first] = ctx.top;
  const s = ctx.strongest;
  const quads = countBy(ctx.top, (it) => QUAD[it.quad].label);
  const items = [
    `<b>이번 주 1위</b> ${esc(first.repo)} <em>+${num.format(first.gained)}★</em>`,
    `<b>★ 최다 증가</b> ${esc(s.repo)} <em>+${num.format(s.gained)}</em> · 트렌딩 ${s.rank}위`,
    `<b>흐름</b> TOP ${ctx.top.length} 중 ${quads[0][1]}개가 ${esc(quads[0][0])}`,
    ...[...ctx.noteByRepo.values()].map((n) => `<b>판정</b> ${esc(n.repo)} → ${RING[n.ring].label}`),
    '<b>다음 갱신</b> 매일 21:17 (KST)',
  ];
  const group = items.map((html) => `<span class="breaking__item">${html}</span>`).join('');
  $('#breaking').innerHTML = `<div class="breaking__group">${group}</div><div class="breaking__group" aria-hidden="true">${group}</div>`;
}

// § 이번 주 급상승 — 주간 트렌딩 전체를 늘어난 별 순으로
function renderMovers(ctx, onPick) {
  const list = [...ctx.items].sort((a, b) => b.gained - a.gained);
  const max = list[0]?.gained || 1;
  const topRepos = new Set(ctx.top.map((it) => it.repo));
  const el = $('#movers-list');
  el.innerHTML = list
    .map((it, i) => {
      const [owner, name] = it.repo.split('/');
      const cls = ['mover', topRepos.has(it.repo) ? 'mover--top' : '', i === 0 ? 'mover--max' : ''].filter(Boolean).join(' ');
      return `<li class="${cls}" style="--i:${i}">
        <span class="mover__no">${i + 1}</span>
        <button class="mover__name" type="button" data-repo="${esc(it.repo)}" title="${esc(it.repo)} — 레이더에서 보기"><span class="owner">${esc(owner)}/</span>${esc(name)}</button>
        <span class="mover__bar"><i style="--w:${((it.gained / max) * 100).toFixed(1)}%"></i></span>
        <span class="mover__val">+${num.format(it.gained)}</span>
        <span class="mover__meta">트렌딩 ${it.rank}위${it.note ? ` <span class="stamp stamp--${it.note.ring}">${RING[it.note.ring].label}</span>` : ''}</span>
      </li>`;
    })
    .join('');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.mover__name');
    if (b) onPick(b.dataset.repo);
  });
}

/* ── 레이더 계기 ─────────────────────── */
function renderRingKey() {
  $('#ring-key').innerHTML = RINGS.map((r) => `<li><b>${symbol(r.key)}${r.label}</b>${esc(r.desc)}</li>`).join('');
}

function renderCard(t) {
  const card = $('#target-card');
  if (!t) {
    card.innerHTML = '<p class="target-card__empty"><b>표적 대기</b>레이더의 점이나 아래 목록을 누르면 표적을 록온하고, 이곳에 자세한 내용을 싣습니다.</p>';
    return;
  }
  const it = t.item;
  const note = t.note;
  const pending = t.verdict === 'weak' ? '약한 신호 — 이번 주 8위 아래로 잡힌 레포입니다.' : '판정 대기 — 아직 직접 테스트하지 않은 표적입니다.';
  card.innerHTML = `
    <p class="target-card__eyebrow"><span class="target-card__lock">LOCK</span>${esc(t.id)}${t.rank ? ` · 이번 주 ${t.rank}위` : ''} · 방위 ${brg(t.bearing)} · ${esc(QUAD[t.quad].label)}</p>
    <h3 class="target-card__title">${repoLink(t.repo)}</h3>
    ${it.ko ? `<p class="target-card__dek">${esc(it.ko)}</p>` : ''}
    ${it.desc ? `<p class="${it.ko ? 'target-card__en' : 'target-card__dek'}">${esc(it.desc)}</p>` : ''}
    <p class="target-card__stats"><span class="gain">이번 주 +${num.format(it.gained ?? 0)}★</span><span>누적 ${short.format(it.stars ?? 0)}★</span><span>${esc(it.lang ?? '언어 미표기')}</span>${stamp(note)}</p>
    ${note ? noteBlock(note) : `<div class="note"><p class="note__summary">${pending}</p></div>`}
    <div class="target-card__actions">
      <a class="btn btn--solid" href="${ghUrl(t.repo)}" target="_blank" rel="noopener">GitHub에서 열기 ↗</a>
      <button class="btn" type="button" data-step="1">다음 표적 →</button>
    </div>`;
  if (MOTION) {
    card.classList.remove('is-in');
    void card.offsetWidth;
    card.classList.add('is-in');
  }
}

function initRadar(ctx, { tracks, weak }) {
  const radar = createRadar($('#radar-canvas'), { rings: RINGS, reducedMotion: !MOTION });
  const crt = $('#crt');
  const hits = $('#radar-hits');
  const tip = $('#radar-tip');
  const lcd = $('#radar-lcd');
  const legend = $('#radar-legend');
  const section = $('#radar');
  const st = { selected: null, hover: null, weak: false, gain: 1, speed: 1, tx: true };
  const all = () => (st.weak ? [...tracks, ...weak] : tracks);
  const find = (id) => tracks.find((t) => t.id === id) ?? weak.find((t) => t.id === id);
  const verdictText = (t) => (t.note ? `${RING[t.verdict].label} 판정` : t.verdict === 'weak' ? '약한 신호' : '포착');
  const metaText = (t) => (t.note ? `${RING[t.verdict].label} 판정 · ${dotted(t.note.date)}` : `포착 · 이번 주 ${t.rank}위`);

  function renderLegend() {
    legend.innerHTML = `<div class="legend">${QUADRANTS.map((q) => {
      const list = tracks.filter((t) => t.quad === q.key);
      const items = list
        .map((t) => `<li><button class="legend__item" type="button" data-id="${t.id}">
            ${symbol(t.verdict, 'legend__sym')}
            <span class="legend__repo">${esc(t.repo)}</span>
            <span class="legend__meta">${esc(metaText(t))}</span>
          </button></li>`)
        .join('');
      return `<section class="legend__group"><h3>${esc(q.label)}<span>${list.length}</span></h3>${list.length ? `<ol>${items}</ol>` : '<p class="legend__empty">아직 없음</p>'}</section>`;
    }).join('')}</div>`;
  }

  function mark() {
    legend.querySelectorAll('.legend__item').forEach((b) => {
      b.classList.toggle('is-locked', b.dataset.id === st.selected);
      b.classList.toggle('is-hover', b.dataset.id === st.hover);
      b.setAttribute('aria-pressed', String(b.dataset.id === st.selected));
    });
  }

  function renderHits() {
    hits.innerHTML = all()
      .map((t) => {
        const p = radar.toPercent(t);
        return `<button class="blip-hit" type="button" data-id="${t.id}" style="left:${p.left.toFixed(2)}%;top:${p.top.toFixed(2)}%" aria-label="${esc(`${t.id} ${t.repo} · ${verdictText(t)}`)}"></button>`;
      })
      .join('');
  }

  function lcdIdle() {
    const t = find(st.selected);
    lcd.textContent = t
      ? `${t.id} LOCK · BRG ${brg(t.bearing)} · ${RING[t.verdict].label} 링 · ${QUAD[t.quad].label}`
      : 'EBL ---.-° · VRM -.-- · 표적 없음';
  }

  function showTip(t) {
    if (!t) {
      tip.hidden = true;
      return;
    }
    const p = radar.toPercent(t);
    tip.innerHTML = `<b>${esc(t.repo)}</b>${esc(t.id)} · ${verdictText(t)}<br>BRG ${brg(t.bearing)} · 이번 주 +${num.format(t.item.gained ?? 0)}★`;
    tip.style.left = `${p.left}%`;
    tip.style.top = `${p.top}%`;
    tip.classList.toggle('is-left', p.left > 55);
    tip.hidden = false;
  }

  function hover(id) {
    if (st.hover === id) return;
    st.hover = id;
    radar.setHover(id);
    mark();
    showTip(id ? find(id) : null);
  }

  function lock(id) {
    const t = find(id);
    if (!t) return;
    st.selected = id;
    radar.setSelected(id);
    mark();
    lcdIdle();
    renderCard(t);
  }

  function unlock() {
    st.selected = null;
    radar.setSelected(null);
    mark();
    lcdIdle();
    renderCard(null);
  }

  function step(dir) {
    const order = all();
    if (!order.length) return;
    const i = order.findIndex((t) => t.id === st.selected);
    const next = i < 0 ? order[dir > 0 ? 0 : order.length - 1] : order[(i + dir + order.length) % order.length];
    lock(next.id);
  }

  // 다이얼과 스위치
  const knobGain = $('#knob-gain');
  const knobRange = $('#knob-range');
  const knobSweep = $('#knob-sweep');
  const toggleTx = $('#toggle-tx');
  const setKnob = (el, turn, value, label) => {
    el.querySelector('.knob__cap').style.setProperty('--turn', `${turn}deg`);
    el.querySelector('.knob__value').textContent = value;
    el.setAttribute('aria-label', label);
  };
  const setGain = (level) => {
    st.gain = level;
    radar.setGain(level);
    setKnob(knobGain, [-110, 0, 110][level], GAIN_LABELS[level], `감도 ${GAIN_LABELS[level]} — 누르면 바뀝니다`);
  };
  const setRange = (on) => {
    st.weak = on;
    if (!on && find(st.selected)?.verdict === 'weak') unlock();
    radar.setTargets(all());
    renderHits();
    const value = on ? `TOP ${ctx.items.length}` : `TOP ${ctx.top.length}`;
    setKnob(knobRange, on ? 70 : -70, value, `범위 ${value} — 누르면 8위 아래 약한 신호를 ${on ? '숨깁니다' : '보여 줍니다'}`);
  };
  const setSpeed = (i) => {
    st.speed = i;
    radar.setRpm(SPEEDS[i]);
    setKnob(knobSweep, [-110, 0, 110][i], `${SPEEDS[i]} RPM`, `회전 속도 ${SPEEDS[i]} RPM — 누르면 바뀝니다`);
  };
  const setTx = (on) => {
    st.tx = on;
    radar.setTransmit(on);
    toggleTx.setAttribute('aria-pressed', String(on));
    toggleTx.querySelector('.knob__value').textContent = on ? 'ON' : 'STBY';
    toggleTx.setAttribute('aria-label', on ? '송신 중 — 누르면 대기' : '대기 — 누르면 송신');
    $('#led-tx').classList.toggle('is-on', on);
  };
  knobGain.addEventListener('click', () => setGain((st.gain + 1) % 3));
  knobRange.addEventListener('click', () => setRange(!st.weak));
  knobSweep.addEventListener('click', () => setSpeed((st.speed + 1) % SPEEDS.length));
  toggleTx.addEventListener('click', () => setTx(!st.tx));
  if (!MOTION) {
    knobGain.hidden = true;
    knobSweep.hidden = true;
    toggleTx.hidden = true;
  }

  // EBL/VRM — 마우스 위치의 방위선과 거리원
  crt.addEventListener('pointermove', (e) => {
    const p = radar.pointAt(e.clientX, e.clientY);
    if (p.r > 1.04) {
      radar.setPointer(null);
      lcdIdle();
      return;
    }
    radar.setPointer(p);
    const ring = RINGS.find((g) => p.r <= g.outer) ?? RINGS.at(-1);
    const quad = QUADRANTS.find((q) => p.bearing >= q.sector[0] && p.bearing < q.sector[1]) ?? QUADRANTS[0];
    lcd.textContent = `EBL ${brg(p.bearing)} · VRM ${Math.min(p.r, 1).toFixed(2)} · ${ring.label} 링 · ${quad.label}`;
  });
  crt.addEventListener('pointerleave', () => {
    radar.setPointer(null);
    lcdIdle();
  });

  hits.addEventListener('click', (e) => {
    const b = e.target.closest('.blip-hit');
    if (b) lock(b.dataset.id);
  });
  hits.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.blip-hit');
    if (b) hover(b.dataset.id);
  });
  hits.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget?.closest?.('.blip-hit')) hover(null);
  });
  hits.addEventListener('focusin', (e) => {
    const b = e.target.closest('.blip-hit');
    if (b) hover(b.dataset.id);
  });
  hits.addEventListener('focusout', () => hover(null));
  legend.addEventListener('click', (e) => {
    const b = e.target.closest('.legend__item');
    if (b) lock(b.dataset.id);
  });
  legend.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.legend__item');
    if (b) hover(b.dataset.id);
  });
  legend.addEventListener('pointerleave', () => hover(null));
  $('#target-card').addEventListener('click', (e) => {
    if (e.target.closest('[data-step]')) step(1);
  });
  $$('.instrument__quad').forEach((el) => {
    const q = QUAD[el.dataset.quad];
    el.querySelector('b').textContent = tracks.filter((t) => t.quad === q.key).length;
    el.addEventListener('pointerenter', () => radar.setSector(q.sector));
    el.addEventListener('pointerleave', () => radar.setSector(null));
  });

  // 레이더가 화면에 있을 때만 ← → / Esc
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    const r = section.getBoundingClientRect();
    if (!(r.top < innerHeight * 0.65 && r.bottom > innerHeight * 0.35)) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Escape') {
      unlock();
    }
  });

  radar.on('ping', (id) => {
    if (!MOTION) return;
    const b = legend.querySelector(`.legend__item[data-id="${id}"]`);
    if (!b) return;
    b.classList.remove('is-ping');
    void b.offsetWidth;
    b.classList.add('is-ping');
  });
  radar.on('resize', () => {
    renderHits();
    if (st.hover) showTip(find(st.hover));
  });

  renderLegend();
  renderRingKey();
  renderCard(null);
  setGain(1);
  setSpeed(1);
  setTx(true);
  setRange(false);
  lcdIdle();

  return {
    focusRepo(repo) {
      const t = tracks.find((x) => x.repo === repo) ?? weak.find((x) => x.repo === repo);
      if (!t) return false;
      if (t.verdict === 'weak' && !st.weak) setRange(true);
      section.scrollIntoView({ behavior: MOTION ? 'smooth' : 'auto', block: 'start' });
      setTimeout(() => lock(t.id), MOTION ? 550 : 0);
      return true;
    },
    autoLock() {
      const first = tracks.find((t) => t.note) ?? tracks[0];
      if (first) lock(first.id);
    },
  };
}

/* ── 지난 호 · 전달용 요약 · 판권 ──────── */
function renderArchive(ctx) {
  const { index } = ctx;
  const streak = (repo) => {
    const n = index.repos[repo]?.weeks.length ?? 0;
    return n > 1 ? `<span class="streak" title="TOP 7에 오른 주 수">${n}주</span>` : '';
  };
  $('#issues-body').innerHTML = index.weeks
    .map((w, i) => ({ w, no: i + 1 }))
    .reverse()
    .map(({ w, no }) => `<tr>
      <td class="issue-no">${issueLabel(no)}</td>
      <td class="issue-week">${weekLabel(w.id)}<span>${monthDay(w.start)}–${monthDay(w.end)}</span></td>
      <td><ol class="issue-top">${w.top
        .map((repo, k) => `<li><b>${k + 1}</b><a href="${ghUrl(repo)}" target="_blank" rel="noopener" title="${esc(repo)}">${esc(repo.split('/')[1])}</a>${streak(repo)}</li>`)
        .join('')}</ol></td>
      <td class="issue-state">${isOpen(w) ? '<span class="live">진행 중</span>' : '마감'}</td>
    </tr>`)
    .join('');

  const repeaters = Object.entries(index.repos)
    .filter(([, r]) => r.weeks.length > 1)
    .sort((a, b) => b[1].weeks.length - a[1].weeks.length || a[1].bestRank - b[1].bestRank)
    .slice(0, 10);
  $('#repeaters').innerHTML = repeaters.length
    ? `<ol class="repeat-list">${repeaters
        .map(([repo, r]) => `<li><span class="repeat-n">${r.weeks.length}주</span>${repoLink(repo)}<span class="muted">최고 ${r.bestRank}위</span></li>`)
        .join('')}</ol>`
    : '<p class="muted">두 번째 호부터, 두 주 이상 TOP 7에 오른 레포를 여기에 모읍니다.</p>';
}

function buildDigest(ctx) {
  const { week, top } = ctx;
  const lines = [
    `[DEV RADAR ${issueLabel(ctx.issueNo)}] GitHub 주간 트렌딩 TOP ${top.length}`,
    `${weekLabel(week.week)} · ${dotted(week.start)}~${monthDay(week.end)}${isOpen(week) ? ' (진행 중)' : ''}`,
    '',
  ];
  for (const it of top) {
    lines.push(`${it.rank}. ${it.repo} — ${it.lang ?? '언어 미표기'}, 이번 주 +${num.format(it.gained)}★`);
    if (it.ko || it.desc) lines.push(`   ${it.ko || it.desc}`);
  }

  const quads = countBy(top, (it) => QUAD[it.quad].label);
  const [leadQuad, leadCount] = quads[0];
  lines.push('', '■ 이번 주 흐름');
  lines.push(
    leadCount > top.length / 2
      ? `- TOP ${top.length} 중 ${leadCount}개가 ${leadQuad} 분야`
      : `- 분야: ${quads.map(([k, n]) => `${k} ${n}`).join(', ')}`,
  );
  lines.push(`- 언어: ${countBy(top, (it) => it.lang ?? '미표기').map(([k, n]) => `${k} ${n}`).join(', ')}`);
  const s = ctx.strongest;
  lines.push(`- 이번 주 ★ 최다 증가: ${s.repo} +${num.format(s.gained)} (트렌딩 ${s.rank}위)`);

  lines.push('', '■ 직접 테스트');
  const weekNotes = ctx.notes.filter((n) => n.date >= week.start && n.date <= week.end);
  if (weekNotes.length) weekNotes.forEach((n) => lines.push(`- ${n.repo} → ${RING[n.ring].label}: ${n.summary}`));
  else lines.push('- 이번 주 테스트 기록 없음');

  lines.push('', '■ 다음 테스트 후보');
  const next = top.filter((it) => !ctx.noteByRepo.has(it.repo)).slice(0, 3).map((it) => it.repo);
  lines.push(next.length ? `- ${next.join(', ')}` : `- 이번 주 TOP ${top.length} 모두 테스트 완료`);

  if (location.protocol === 'https:') lines.push('', `전체 기록: ${location.origin}${location.pathname}`);
  return lines.join('\n');
}

function renderDigest(ctx) {
  const text = buildDigest(ctx);
  const pre = $('#digest-text');
  const status = $('#copy-status');
  pre.textContent = text;
  $('#copy-digest').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = '복사했습니다. 주간보고에 붙여 넣으세요.';
    } catch {
      pre.textContent = text;
      const range = document.createRange();
      range.selectNodeContents(pre);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = '텍스트를 선택해 두었습니다. ⌘C(Ctrl+C)로 복사하세요.';
    }
  });
  return {
    // 화면에 들어올 때 타자 치듯 찍어 낸다(누르면 바로 끝까지).
    type() {
      if (!MOTION || pre.dataset.typed) return;
      pre.dataset.typed = '1';
      let i = 0;
      pre.textContent = '';
      pre.classList.add('is-typing');
      pre.addEventListener('click', () => (i = text.length), { once: true });
      const step = () => {
        i = Math.min(text.length, i + 8);
        pre.textContent = text.slice(0, i);
        if (i < text.length) requestAnimationFrame(step);
        else pre.classList.remove('is-typing');
      };
      requestAnimationFrame(step);
    },
  };
}

function renderColophon(ctx) {
  const updated = new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ctx.week.updatedAt));
  $('#colophon').innerHTML = `
    <p><b>DEV RADAR</b> · 개발팀 주간 기술 브리핑</p>
    <p>데이터 <a href="https://github.com/trending?since=weekly" target="_blank" rel="noopener">GitHub 주간 트렌딩</a>(전체 언어) · 마지막 갱신 ${esc(updated)} · 기록 시작 ${esc(dotted(ctx.index.since))}</p>`;
}

/* ── 지면 효과 ─────────────────────────── */
function initProgress() {
  const bar = $('#progress');
  let queued = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : '0');
    queued = false;
  };
  addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }, { passive: true });
  addEventListener('resize', update);
  update();
}

function initSections(digest) {
  const sections = $$('.reveal-section');
  const enter = (el) => {
    el.classList.add('is-in');
    if (el.id === 'movers') $('#movers-list').classList.add('is-in');
    if (el.id === 'digest') digest.type();
  };
  if (!MOTION || !('IntersectionObserver' in window)) {
    sections.forEach(enter);
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        enter(entry.target);
        io.unobserve(entry.target);
      }
    },
    { threshold: 0, rootMargin: '0px 0px -12% 0px' },
  );
  sections.forEach((el) => io.observe(el));
}

function renderError() {
  $('#dateline').textContent = '데이터 없음';
  $('#lead').innerHTML = `<div class="error">
    <p class="error__title">데이터를 불러오지 못했습니다.</p>
    <p>파일을 직접 열었다면 <code>node scripts/serve.mjs</code>로 띄운 뒤 <code>http://localhost:4318</code>에서 열어 주세요.</p>
  </div>`;
}

async function main() {
  if (MOTION) document.documentElement.classList.add('motion');
  $$('[data-project]').forEach((el) => (el.textContent = PROJECT_NAME));
  let ctx;
  try {
    const index = await getJson('data/index.json');
    const latest = index.weeks.at(-1);
    if (!latest) throw new Error('기록된 주차가 없습니다.');
    const [week, notes, summaries] = await Promise.all([
      getJson(`data/weeks/${latest.id}.json`),
      getJson('data/notes.json', []),
      getJson('data/summaries.json', {}),
    ]);
    if (!week.items?.length) throw new Error('이번 주 기록이 비어 있습니다.');
    ctx = buildContext(index, week, notes, summaries);
  } catch (err) {
    console.error(err);
    renderError();
    return;
  }
  const targets = buildTargets(ctx);
  renderDateline(ctx);
  renderFront(ctx);
  renderBreaking(ctx);
  const radar = initRadar(ctx, targets);
  renderMovers(ctx, (repo) => {
    if (!radar.focusRepo(repo)) window.open(ghUrl(repo), '_blank', 'noopener');
  });
  renderArchive(ctx);
  const digest = renderDigest(ctx);
  renderColophon(ctx);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.to-radar');
    if (b) radar.focusRepo(b.dataset.repo);
  });
  $('#print-btn').addEventListener('click', () => window.print());
  initProgress();
  initSections(digest);
  radar.autoLock();
}

main();
