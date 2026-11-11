// DEV RADAR — 기술 관제 레이더. data/ 아래 JSON만 읽어 그린다.
import { createScope, VERDICT_COLORS } from './scope.js';

const PROJECT_NAME = '러브오피스'; // 사이트 문구에 들어가는 우리 프로젝트 이름
const TOP_N = 7;
const TZ = 'Asia/Seoul';
const SPEEDS = [6, 10, 15]; // 스윕 속도(RPM)
const MOTION = !matchMedia('(prefers-reduced-motion: reduce)').matches; // 동작 줄이기 설정이면 레이더를 멈춘 화면으로

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

// 판정 = 레이더 링(거리). 반지름은 레이더 반지름 대비 비율.
const RINGS = [
  { key: 'adopt', label: '도입', inner: 0.07, outer: 0.27, desc: '검증 완료. 바로 써도 됩니다.' },
  { key: 'trial', label: '시험', inner: 0.27, outer: 0.47, desc: '작은 범위에서 실제로 써 보는 중입니다.' },
  { key: 'assess', label: '검토', inner: 0.47, outer: 0.64, desc: '가능성이 있어 더 지켜봅니다.' },
  { key: 'hold', label: '보류', inner: 0.64, outer: 0.77, desc: '지금은 쓰지 않기로 했습니다.' },
  { key: 'detected', label: '포착', inner: 0.77, outer: 0.92, desc: '이번 주 TOP 7에 올랐고 아직 테스트 전입니다.' },
  { key: 'weak', label: '약한 신호', inner: 0.92, outer: 0.985, desc: '이번 주 8위 아래로 잡힌 신호입니다.' },
];

const QUAD = Object.fromEntries(QUADRANTS.map((q, order) => [q.key, { ...q, order }]));
const RING = Object.fromEntries(RINGS.map((r, order) => [r.key, { ...r, order }]));

const SYMBOLS = {
  adopt: '<svg viewBox="-12 -12 24 24" aria-hidden="true"><circle r="4.7" fill="currentColor"/><circle r="10" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  trial: '<svg viewBox="-12 -12 24 24" aria-hidden="true"><rect x="-6.5" y="-6.5" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="-2.9" y="-2.9" width="5.8" height="5.8" fill="currentColor"/></svg>',
  assess: '<svg viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0 -9 L9 0 L0 9 L-9 0 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle r="2.2" fill="currentColor"/></svg>',
  hold: '<svg viewBox="-12 -12 24 24" aria-hidden="true"><circle r="7.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M-3.9 -3.9 L3.9 3.9 M3.9 -3.9 L-3.9 3.9" stroke="currentColor" stroke-width="1.6"/></svg>',
  detected: '<svg viewBox="-12 -12 24 24" aria-hidden="true"><circle r="6.5" fill="currentColor" fill-opacity=".2" stroke="currentColor" stroke-width="1.6"/></svg>',
  weak: '<svg viewBox="-12 -12 24 24" aria-hidden="true"><circle r="2.4" fill="currentColor"/></svg>',
};

/* ── 공통 도구 ─────────────────────────── */
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const num = new Intl.NumberFormat('ko-KR');
const short = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
const todayKST = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
const pad2 = (n) => String(n).padStart(2, '0');
const pad3 = (deg) => String(Math.round(deg) % 360).padStart(3, '0');
const ghUrl = (repo) => `https://github.com/${repo.split('/').map(encodeURIComponent).join('/')}`;
const dotted = (ymd) => String(ymd ?? '').replaceAll('-', '.');
const monthDay = (ymd) => ymd.slice(5).replace('-', '.');
const weekLabel = (id) => `${id.slice(0, 4)}년 ${Number(id.slice(6))}주차`;
const issueLabel = (no) => (no === 1 ? '창간호' : `제${no}호`);
const isOpen = (week) => todayKST <= week.end;
const stamp = (iso) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso)).slice(5).replace('-', '.');

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
  const valid = (Array.isArray(notes) ? notes : [])
    .filter((n) => n?.repo && RING[n.ring] && !['detected', 'weak'].includes(n.ring))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const noteByRepo = new Map(valid.map((n) => [n.repo, n])); // 같은 레포는 가장 최근 기록
  const items = week.items.map((it) => {
    const note = noteByRepo.get(it.repo) ?? null;
    return { ...it, quad: quadrantOf(it, note?.quadrant), ko: summaries[it.repo] ?? '', note };
  });
  return {
    index,
    week,
    summaries,
    notes: valid,
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

/* ── 효과 ─────────────────────────────── */
function countTo(el, to, prefix = '') {
  if (!MOTION) {
    el.textContent = prefix + num.format(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 800);
    el.textContent = prefix + num.format(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// 글자가 뒤섞이다가 제자리를 찾는 효과
function scramble(el, owner, name) {
  const final = `${owner}/${name}`;
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/_-#';
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 520);
    const shown = Math.floor(final.length * k);
    let out = '';
    for (let i = 0; i < final.length; i++) out += i < shown ? final[i] : glyphs[(Math.random() * glyphs.length) | 0];
    el.textContent = out;
    if (k < 1) requestAnimationFrame(step);
    else el.innerHTML = `<span class="owner">${esc(owner)}/</span>${esc(name)}`;
  };
  requestAnimationFrame(step);
}

function startBoot() {
  const root = document.documentElement;
  if (!root.classList.contains('booting')) return { finish: async () => {}, fail() {} };
  try {
    sessionStorage.setItem('dev-radar-boot', '1');
  } catch {
    /* 저장이 막혀 있어도 부팅 화면은 그대로 진행 */
  }
  const box = $('#boot');
  const log = $('#boot-log');
  let skipped = false;
  const end = () => {
    if (box.classList.contains('is-done')) return;
    box.classList.add('is-done');
    setTimeout(() => root.classList.remove('booting'), 500);
  };
  const skip = () => {
    skipped = true;
    end();
  };
  window.addEventListener('keydown', skip, { once: true });
  box.addEventListener('click', skip, { once: true });
  const type = async (text) => {
    if (skipped) return;
    const line = document.createElement('div');
    log.append(line);
    for (let i = 2; i < text.length; i += 2) {
      if (skipped) return;
      line.textContent = text.slice(0, i);
      await wait(9);
    }
    line.textContent = text;
  };
  const head = (async () => {
    await type('DEV RADAR // 개발팀 기술 관제 시스템');
    await type('> 수신기 예열 ................. OK');
  })();
  return {
    async finish(ctx) {
      await head;
      await type(`> GitHub 주간 트렌딩 수신 ...... ${ctx.items.length} 신호`);
      await type(`> TOP ${ctx.top.length} 표적 분류 ............. OK`);
      await type(`> 직접 테스트 판정 ............. ${ctx.noteByRepo.size}건`);
      await type('> 스코프 보정 ................. OK');
      if (!skipped) await wait(380);
      window.removeEventListener('keydown', skip);
      end();
    },
    fail() {
      window.removeEventListener('keydown', skip);
      end();
    },
  };
}

/* ── 레이더 콘솔 ─────────────────────── */
function verdictText(t) {
  if (t.verdict === 'detected') return '포착';
  if (t.verdict === 'weak') return '약신호';
  return RING[t.verdict].label;
}

function verdictHtml(t) {
  const n = t.note;
  if (!n) {
    return `<div class="verdict verdict--${t.verdict}">
      <p class="verdict__head"><span class="verdict__badge">${t.verdict === 'weak' ? '약한 신호' : '판정 대기'}</span></p>
      <p class="verdict__line">아직 직접 테스트하지 않은 표적입니다.</p>
    </div>`;
  }
  return `<div class="verdict verdict--${n.ring}">
    <p class="verdict__head"><span class="verdict__badge">${RING[n.ring].label} 판정</span>${n.date ? `<span>${esc(dotted(n.date))} 테스트</span>` : ''}</p>
    <p class="verdict__summary">${esc(n.summary)}</p>
    ${n.tested ? `<p class="verdict__line"><b>테스트</b>${esc(n.tested)}</p>` : ''}
    ${n.fit ? `<p class="verdict__line"><b>${esc(PROJECT_NAME)} 적용</b>${esc(n.fit)}</p>` : ''}
  </div>`;
}

function renderTarget(t) {
  const box = $('#target');
  if (!t) {
    box.innerHTML = '<div class="target__empty"><strong>표적 대기</strong>레이더의 점이나 목록을 누르면 록온합니다.<br>← → 키로 표적을 넘겨 볼 수 있어요.</div>';
    return;
  }
  const it = t.item;
  const [owner, name] = t.repo.split('/');
  box.innerHTML = `
    <p class="target__id"><span class="target__lock">LOCKED</span>${esc(t.id)}${t.rank ? ` · 이번 주 ${t.rank}위` : ''} · 방위 ${pad3(t.bearing)}°</p>
    <h3 class="target__name"><a href="${ghUrl(t.repo)}" target="_blank" rel="noopener"><span class="owner">${esc(owner)}/</span>${esc(name)}</a></h3>
    ${it.ko ? `<p class="target__ko">${esc(it.ko)}</p>` : ''}
    ${it.desc ? `<p class="target__en">${esc(it.desc)}</p>` : ''}
    <dl class="target__grid">
      <div><dt>이번 주 ★</dt><dd class="is-hot" data-count="${it.gained ?? 0}" data-prefix="+">+${num.format(it.gained ?? 0)}</dd></div>
      <div><dt>누적 ★</dt><dd data-count="${it.stars ?? 0}">${num.format(it.stars ?? 0)}</dd></div>
      <div><dt>포크</dt><dd data-count="${it.forks ?? 0}">${num.format(it.forks ?? 0)}</dd></div>
      <div><dt>언어</dt><dd>${esc(it.lang ?? '미표기')}</dd></div>
      <div><dt>분야</dt><dd>${esc(QUAD[t.quad].label)}</dd></div>
      <div><dt>링</dt><dd>${esc(RING[t.verdict].label)}</dd></div>
    </dl>
    ${verdictHtml(t)}
    <div class="target__actions">
      <a class="ctl ctl--solid" href="${ghUrl(t.repo)}" target="_blank" rel="noopener">GitHub에서 열기 ↗</a>
      <button class="ctl" type="button" data-step="1">다음 표적 →</button>
    </div>`;
  if (!MOTION) return;
  scramble(box.querySelector('.target__name a'), owner, name);
  box.querySelectorAll('[data-count]').forEach((dd) => countTo(dd, Number(dd.dataset.count) || 0, dd.dataset.prefix ?? ''));
  box.classList.remove('is-in');
  void box.offsetWidth;
  box.classList.add('is-in');
}

function initRadar(ctx, { tracks, weak }) {
  const scope = createScope($('#scope-canvas'), { rings: RINGS, reducedMotion: !MOTION });
  const list = $('#tracks');
  const hits = $('#scope-hits');
  const tip = $('#scope-tip');
  const reticle = $('#reticle');
  const readout = $('#scope-readout');
  if (matchMedia('(hover: none)').matches) readout.textContent = '레이더의 점이나 목록을 누르면 록온합니다';
  const idleText = readout.textContent;
  const st = { selected: null, hover: null, weak: false, paused: false, speed: 1 };
  const all = () => (st.weak ? [...tracks, ...weak] : tracks);
  const find = (id) => tracks.find((t) => t.id === id) ?? weak.find((t) => t.id === id);

  function markRows() {
    list.querySelectorAll('.track').forEach((b) => {
      b.classList.toggle('is-locked', b.dataset.id === st.selected);
      b.classList.toggle('is-hover', b.dataset.id === st.hover);
      b.setAttribute('aria-pressed', String(b.dataset.id === st.selected));
    });
  }

  function renderList() {
    const row = (t) => `<li><button class="track track--${t.verdict}" type="button" data-id="${t.id}">
        <span class="track__id">${t.id}</span>
        <span class="track__name"><span class="track__repo">${esc(t.repo)}</span><small>${esc(QUAD[t.quad].label)}${t.item.lang ? ` · ${esc(t.item.lang)}` : ''}</small></span>
        <span class="track__brg">${pad3(t.bearing)}°</span>
        <span class="track__gain">▲${short.format(t.item.gained ?? 0)}</span>
        <span class="pill pill--${t.verdict}">${verdictText(t)}</span>
      </button></li>`;
    const weakRows = st.weak && weak.length
      ? `<li class="tracks__sub">약한 신호 · ${weak[0].rank}–${weak.at(-1).rank}위</li>${weak.map(row).join('')}`
      : '';
    list.innerHTML = tracks.map(row).join('') + weakRows;
    $('#tracks-meta').textContent = `표적 ${tracks.length} · 판정 ${tracks.filter((t) => t.note).length}${st.weak ? ` · 약신호 ${weak.length}` : ''}`;
    markRows();
  }

  function renderHits() {
    hits.innerHTML = all()
      .map((t) => {
        const p = scope.toPercent(t);
        return `<button class="blip-hit" type="button" data-id="${t.id}" style="left:${p.left.toFixed(2)}%;top:${p.top.toFixed(2)}%" aria-label="${esc(`${t.id} ${t.repo} · ${verdictText(t)}`)}"></button>`;
      })
      .join('');
  }

  function placeReticle() {
    const t = find(st.selected);
    if (!t) {
      reticle.hidden = true;
      return;
    }
    const p = scope.toPercent(t);
    reticle.style.left = `${p.left}%`;
    reticle.style.top = `${p.top}%`;
    reticle.hidden = false;
  }

  function showTip(t) {
    if (!t) {
      tip.hidden = true;
      return;
    }
    const p = scope.toPercent(t);
    tip.innerHTML = `<b>${esc(t.repo)}</b>${esc(t.id)} · ${verdictText(t)}${t.note ? ' 판정' : ''}<br>방위 ${pad3(t.bearing)}° · 이번 주 ▲${num.format(t.item.gained ?? 0)}★`;
    tip.style.left = `${p.left}%`;
    tip.style.top = `${p.top}%`;
    tip.classList.toggle('is-left', p.left > 58);
    tip.hidden = false;
  }

  function hover(id) {
    if (st.hover === id) return;
    st.hover = id;
    scope.setHover(id);
    markRows();
    showTip(id ? find(id) : null);
  }

  function lock(id) {
    const t = find(id);
    if (!t) return;
    st.selected = id;
    scope.setSelected(id);
    markRows();
    placeReticle();
    $('#reticle-tag').textContent = `${t.id} LOCK`;
    reticle.classList.remove('is-locking');
    void reticle.offsetWidth;
    reticle.classList.add('is-locking');
    $('#target-status').innerHTML = `<span class="live"><span class="dot"></span>록온 ${esc(t.id)}</span>`;
    renderTarget(t);
  }

  function unlock() {
    st.selected = null;
    scope.setSelected(null);
    markRows();
    reticle.hidden = true;
    $('#target-status').textContent = '대기';
    renderTarget(null);
  }

  function step(dir) {
    const order = all();
    if (!order.length) return;
    const i = order.findIndex((t) => t.id === st.selected);
    const next = i < 0 ? order[dir > 0 ? 0 : order.length - 1] : order[(i + dir + order.length) % order.length];
    lock(next.id);
  }

  list.addEventListener('click', (e) => {
    const b = e.target.closest('.track');
    if (b) lock(b.dataset.id);
  });
  list.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.track');
    if (b) hover(b.dataset.id);
  });
  list.addEventListener('pointerleave', () => hover(null));
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
  $('#target').addEventListener('click', (e) => {
    if (e.target.closest('[data-step]')) step(1);
  });

  const scopeEl = $('#scope');
  scopeEl.addEventListener('pointermove', (e) => {
    const { bearing, r } = scope.pointAt(e.clientX, e.clientY);
    if (r > 1) {
      readout.textContent = '레이더 밖';
      return;
    }
    const ring = RINGS.find((g) => r <= g.outer) ?? RINGS.at(-1);
    const quad = QUADRANTS.find((q) => bearing >= q.sector[0] && bearing < q.sector[1]) ?? QUADRANTS[0];
    readout.textContent = `커서 방위 ${pad3(bearing)}° · 거리 ${r.toFixed(2)} · ${ring.label} 링 · ${quad.label}`;
  });
  scopeEl.addEventListener('pointerleave', () => {
    readout.textContent = idleText;
  });
  $$('.scope__quad').forEach((el) => {
    const q = QUAD[el.dataset.quad];
    el.addEventListener('pointerenter', () => scope.setSector(q.sector));
    el.addEventListener('pointerleave', () => scope.setSector(null));
  });

  const btnSweep = $('#ctl-sweep');
  const btnSpeed = $('#ctl-speed');
  const btnWeak = $('#ctl-weak');
  const setPaused = (value) => {
    st.paused = value;
    scope.setPaused(value);
    btnSweep.setAttribute('aria-pressed', String(value));
    btnSweep.textContent = value ? '스윕 재개' : '스윕 정지';
  };
  btnSweep.addEventListener('click', () => setPaused(!st.paused));
  btnSpeed.addEventListener('click', () => {
    st.speed = (st.speed + 1) % SPEEDS.length;
    scope.setRpm(SPEEDS[st.speed]);
    btnSpeed.textContent = `속도 ${SPEEDS[st.speed]} RPM`;
  });
  btnWeak.addEventListener('click', () => {
    st.weak = !st.weak;
    btnWeak.setAttribute('aria-pressed', String(st.weak));
    if (!st.weak && find(st.selected)?.verdict === 'weak') unlock();
    scope.setTargets(all());
    renderList();
    renderHits();
  });
  if (!MOTION) {
    btnSweep.hidden = true;
    btnSpeed.hidden = true;
  }

  const consoleEl = $('#console');
  document.addEventListener('keydown', (e) => {
    if (document.documentElement.classList.contains('booting')) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Escape') {
      unlock();
    } else if (e.key === ' ' && MOTION && !e.target.closest?.('button, a')) {
      const r = consoleEl.getBoundingClientRect();
      if (r.top < innerHeight * 0.6 && r.bottom > innerHeight * 0.3) {
        e.preventDefault();
        setPaused(!st.paused);
      }
    }
  });

  scope.on('ping', (id) => {
    if (!MOTION) return;
    const b = list.querySelector(`.track[data-id="${id}"]`);
    if (!b) return;
    b.classList.remove('is-ping');
    void b.offsetWidth;
    b.classList.add('is-ping');
  });
  scope.on('resize', () => {
    renderHits();
    placeReticle();
    if (st.hover) showTip(find(st.hover));
  });

  for (const q of QUADRANTS) {
    const el = $(`.scope__quad[data-quad="${q.key}"] b`);
    if (el) el.textContent = tracks.filter((t) => t.quad === q.key).length;
  }
  scope.setTargets(all());
  renderList();
  renderHits();
  renderTarget(null);

  return {
    autoLock() {
      const first = tracks.find((t) => t.note) ?? tracks[0];
      if (first) lock(first.id);
    },
  };
}

/* ── 나머지 화면 ─────────────────────── */
function renderHud(ctx) {
  countTo($('#stat-contacts'), ctx.top.length);
  countTo($('#stat-tracks'), ctx.noteByRepo.size);
  $('#stat-issue').textContent = `${issueLabel(ctx.issueNo)} · ${Number(ctx.week.week.slice(6))}주차`;
  $('#stat-scan').textContent = stamp(ctx.week.updatedAt);
  const clock = $('#stat-clock');
  const time = new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const tickClock = () => {
    clock.textContent = time.format(new Date());
  };
  tickClock();
  setInterval(tickClock, 1000);
  $('#issue-meta').textContent = [
    weekLabel(ctx.week.week),
    `${monthDay(ctx.week.start)}–${monthDay(ctx.week.end)}`,
    isOpen(ctx.week) ? '진행 중' : '마감',
  ].join(' · ');
}

function renderTicker(ctx) {
  const group = ctx.items
    .map((it) => `<span class="tick"><b>${pad2(it.rank)}</b>${esc(it.repo)}<em>▲${num.format(it.gained)}★</em>${it.note ? `<span class="pill pill--${it.note.ring}">${RING[it.note.ring].label}</span>` : ''}</span>`)
    .join('');
  $('#ticker').innerHTML = `<div class="ticker__group">${group}</div><div class="ticker__group" aria-hidden="true">${group}</div>`;
}

function renderLog(ctx) {
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
      <td class="issue-state">${isOpen(w) ? '<span class="live"><span class="dot"></span>LIVE</span>' : '마감'}</td>
    </tr>`)
    .join('');
  const repeaters = Object.entries(index.repos)
    .filter(([, r]) => r.weeks.length > 1)
    .sort((a, b) => b[1].weeks.length - a[1].weeks.length || a[1].bestRank - b[1].bestRank)
    .slice(0, 10);
  $('#repeaters').innerHTML = repeaters.length
    ? `<ol class="repeat-list">${repeaters.map(([repo, r]) => `<li>${r.weeks.length}주 · ${esc(repo)} · 최고 ${r.bestRank}위</li>`).join('')}</ol>`
    : '<p>두 번째 호부터, 두 주 이상 TOP 7에 오른 레포를 여기에 모읍니다.</p>';
}

function renderLegend() {
  $('#legend-list').innerHTML = RINGS.map(
    (r) => `<li style="color:${VERDICT_COLORS[r.key]}">${SYMBOLS[r.key]}<b>${r.label}</b><span>${esc(r.desc)}</span></li>`,
  ).join('');
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
  lines.push(leadCount > top.length / 2 ? `- TOP ${top.length} 중 ${leadCount}개가 ${leadQuad} 분야` : `- 분야: ${quads.map(([k, n]) => `${k} ${n}`).join(', ')}`);
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

function renderBriefing(ctx) {
  const text = buildDigest(ctx);
  const pre = $('#briefing-text');
  const status = $('#copy-status');
  pre.textContent = text;
  $('#copy-briefing').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = '복사 완료 · 주간보고에 붙여 넣으세요';
    } catch {
      pre.textContent = text;
      const range = document.createRange();
      range.selectNodeContents(pre);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = '선택해 두었어요 · ⌘C(Ctrl+C)로 복사';
    }
  });
  return {
    type() {
      if (!MOTION || pre.dataset.typed) return;
      pre.dataset.typed = '1';
      let i = 0;
      pre.textContent = '';
      pre.classList.add('is-typing');
      pre.addEventListener('click', () => (i = text.length), { once: true });
      const step = () => {
        i = Math.min(text.length, i + 9);
        pre.textContent = text.slice(0, i);
        if (i < text.length) requestAnimationFrame(step);
        else pre.classList.remove('is-typing');
      };
      requestAnimationFrame(step);
    },
  };
}

function renderFooter(ctx) {
  $('#footer').innerHTML = `
    <p><b>DEV RADAR</b> · 개발팀 기술 관제 · 주간 기술 브리핑</p>
    <p>데이터 <a href="https://github.com/trending?since=weekly" target="_blank" rel="noopener">GitHub 주간 트렌딩</a>(전체 언어) · 마지막 갱신 ${esc(stamp(ctx.week.updatedAt))} · 기록 시작 ${esc(dotted(ctx.index.since))}</p>`;
}

function initReveal(briefing) {
  const panels = $$('.reveal');
  if (!MOTION || !('IntersectionObserver' in window)) {
    panels.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        if (entry.target.id === 'briefing') briefing.type();
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.12 },
  );
  panels.forEach((el) => io.observe(el));
}

function renderError() {
  $('#stat-contacts').textContent = '0';
  $('#scope-readout').textContent = '데이터 없음';
  $('#target').innerHTML = `<div class="error">데이터를 불러오지 못했습니다.<br>파일을 직접 열었다면 <code>node scripts/serve.mjs</code>로 띄운 뒤 <code>http://localhost:4318</code>에서 열어 주세요.</div>`;
}

async function main() {
  if (MOTION) document.documentElement.classList.add('motion');
  $$('[data-project]').forEach((el) => (el.textContent = PROJECT_NAME));
  const boot = startBoot();
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
    boot.fail();
    renderError();
    return;
  }
  const targets = buildTargets(ctx);
  renderHud(ctx);
  const radar = initRadar(ctx, targets);
  renderTicker(ctx);
  renderLog(ctx);
  renderLegend();
  const briefing = renderBriefing(ctx);
  renderFooter(ctx);
  initReveal(briefing);
  await boot.finish(ctx);
  radar.autoLock();
}

main();
