// DEV RADAR — data/ 아래 JSON만 읽어 그리는 정적 사이트.
const PROJECT_NAME = '러브오피스'; // 사이트 문구에 들어가는 우리 프로젝트 이름
const TOP_N = 7;
const TZ = 'Asia/Seoul';

// 분야(레이더 사분면). 레포 이름+설명에서 키워드가 가장 많이 걸리는 분야로 자동 분류한다.
// 같은 점수면 위에 있는 분야가 우선. notes.json의 quadrant로 직접 지정할 수도 있다.
const QUADRANTS = [
  {
    key: 'agent', label: '에이전트 · 자동화', from: 180,
    words: ['agent', 'agents', 'agentic', 'multi-agent', 'subagent', 'subagents', 'bot', 'bots', 'automation', 'automate',
      'autonomous', 'mcp', 'skill', 'skills', 'claude code', 'codex', 'copilot', 'computer use', 'workflow', 'workflows',
      'assistant', 'orchestration', '에이전트', '자동화', '智能体'],
  },
  {
    key: 'model', label: 'AI 모델 · 데이터', from: 270,
    words: ['ai', 'llm', 'llms', 'model', 'models', 'inference', 'rag', 'embedding', 'embeddings', 'vector', 'ontology',
      'semantic', 'graph', 'reasoning', 'data', 'dataset', 'datasets', 'scraping', 'scraper', 'crawl', 'crawler', 'ml',
      'machine learning', 'deep learning', 'training', 'fine-tuning', 'diffusion', 'vision', 'speech', 'voice', 'tts', 'asr',
      'transcription', 'dictation', 'ocr', 'gpt', 'llama', 'gemini', 'qwen', 'deepseek', 'grok', '인공지능', '모델', '模型'],
  },
  {
    key: 'tools', label: '개발 도구', from: 90,
    words: ['cli', 'git', 'worktree', 'worktrees', 'editor', 'ide', 'terminal', 'shell', 'vim', 'neovim', 'vscode', 'lint',
      'linter', 'formatter', 'test', 'testing', 'debug', 'debugger', 'build', 'compiler', 'devtools', 'code review', 'pr',
      'review', 'reviewer', 'refactor', 'productivity', 'dotfiles', 'commit', 'package manager'],
  },
  {
    key: 'web', label: '웹 · 인프라', from: 0,
    words: ['web', 'website', 'react', 'vue', 'svelte', 'nextjs', 'next.js', 'ui', 'ux', 'css', 'tailwind', 'frontend',
      'component', 'components', 'browser', 'server', 'backend', 'api', 'database', 'sql', 'postgres', 'redis', 'cloud',
      'docker', 'kubernetes', 'k8s', 'serverless', 'deploy', 'hosting', 'network', 'proxy', 'security', 'audit', 'auth',
      'infra', 'infrastructure', 'monitoring', 'observability'],
  },
];

// 판정 링 (안쪽부터). 반지름은 640×640 차트 기준.
const RINGS = [
  { key: 'adopt', label: '도입', inner: 0, outer: 92, desc: '검증 완료. 바로 써도 됩니다.' },
  { key: 'trial', label: '시험', inner: 92, outer: 158, desc: '작은 범위에서 실제로 써 보는 중입니다.' },
  { key: 'assess', label: '검토', inner: 158, outer: 212, desc: '가능성이 있어 더 지켜봅니다.' },
  { key: 'hold', label: '보류', inner: 212, outer: 250, desc: '지금은 쓰지 않기로 했습니다.' },
  { key: 'detected', label: '포착', inner: 250, outer: 300, desc: '트렌딩에 올랐고 아직 테스트 전입니다.' },
];

const QUAD = Object.fromEntries(QUADRANTS.map((q, order) => [q.key, { ...q, order }]));
const RING = Object.fromEntries(RINGS.map((r, order) => [r.key, { ...r, order }]));

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = new Intl.NumberFormat('ko-KR');
const short = new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 });
const todayKST = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());

const ghUrl = (repo) => `https://github.com/${repo.split('/').map(encodeURIComponent).join('/')}`;
const dotted = (ymd) => String(ymd ?? '').replaceAll('-', '.');
const monthDay = (ymd) => ymd.slice(5).replace('-', '.');
const weekLabel = (id) => `${id.slice(0, 4)}년 ${Number(id.slice(6))}주차`;
const issueLabel = (no) => (no === 1 ? '창간호' : `제${no}호`);
const isOpen = (week) => todayKST <= week.end;

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

function buildContext(index, week, notes, summaries) {
  const validNotes = (Array.isArray(notes) ? notes : [])
    .filter((n) => n?.repo && RING[n.ring] && n.ring !== 'detected')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const noteByRepo = new Map(validNotes.map((n) => [n.repo, n])); // 같은 레포는 가장 최근 기록
  const items = week.items.map((it) => {
    const note = noteByRepo.get(it.repo) ?? null;
    return { ...it, quad: quadrantOf(it, note?.quadrant), ko: summaries[it.repo] ?? '', note };
  });
  return {
    index,
    week,
    notes: validNotes,
    noteByRepo,
    items,
    top: items.slice(0, TOP_N),
    rest: items.slice(TOP_N),
    issueNo: index.weeks.findIndex((w) => w.id === week.week) + 1,
    strongest: items.reduce((a, b) => (b.gained > a.gained ? b : a)),
  };
}

/* ── 공통 조각 ─────────────────────────── */
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

function noteBlock(note) {
  if (!note) return '';
  return `<div class="note">
    <p class="note__summary">${esc(note.summary)}</p>
    ${note.tested ? `<p class="note__line"><b>테스트</b>${esc(note.tested)}</p>` : ''}
    ${note.fit ? `<p class="note__line"><b>${esc(PROJECT_NAME)} 적용</b>${esc(note.fit)}</p>` : ''}
    ${note.date ? `<p class="note__date">${esc(dotted(note.date))} 테스트</p>` : ''}
  </div>`;
}

/* ── 렌더링 ───────────────────────────── */
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
        <p class="byline"><span class="gain">+${num.format(it.gained)}★</span><span>누적 ${short.format(it.stars)}★</span></p>
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

function placeBlips(blips, center) {
  const placed = [];
  for (const blip of blips) {
    const ring = RING[blip.ring];
    const rand = seeded(hash(`${blip.repo}:${blip.ring}`));
    const inner = Math.max(ring.inner, 24);
    let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = ((QUAD[blip.quad].from + 14 + rand() * 62) * Math.PI) / 180;
      const radius = inner + (ring.outer - inner) * (0.2 + rand() * 0.6);
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      const gap = placed.reduce((min, p) => Math.min(min, Math.hypot(p.x - x, p.y - y)), Infinity);
      if (!best || gap > best.gap) best = { x, y, gap };
      if (gap >= 30) break;
    }
    Object.assign(blip, { x: best.x, y: best.y });
    placed.push(blip);
  }
}

function renderRadar(ctx) {
  const C = 320;
  const blips = [];
  for (const note of ctx.noteByRepo.values()) {
    const known = ctx.items.find((it) => it.repo === note.repo) ?? { repo: note.repo, desc: ctx.index.repos[note.repo]?.desc ?? '' };
    const when = note.date ? ` · ${dotted(note.date)}` : '';
    blips.push({ repo: note.repo, ring: note.ring, quad: quadrantOf(known, note.quadrant), meta: `${RING[note.ring].label} 판정${when}` });
  }
  for (const it of ctx.top) {
    if (!ctx.noteByRepo.has(it.repo)) blips.push({ repo: it.repo, ring: 'detected', quad: it.quad, meta: `포착 · 이번 주 ${it.rank}위` });
  }
  blips.sort((a, b) => QUAD[a.quad].order - QUAD[b.quad].order || RING[a.ring].order - RING[b.ring].order || a.repo.localeCompare(b.repo));
  blips.forEach((b, i) => (b.id = String(i + 1)));
  placeBlips(blips, C);

  const point = (radius, deg) => {
    const rad = (deg * Math.PI) / 180;
    return [(C + radius * Math.cos(rad)).toFixed(1), (C + radius * Math.sin(rad)).toFixed(1)];
  };
  const [sx0, sy0] = point(300, -90);
  const [sx1, sy1] = point(300, -62);
  const corners = { agent: [14, 24, 'start'], model: [626, 24, 'end'], tools: [14, 630, 'start'], web: [626, 630, 'end'] };

  $('#radar-svg').innerHTML = [
    `<g class="r-sweep" aria-hidden="true"><path d="M${C} ${C} L${sx0} ${sy0} A300 300 0 0 1 ${sx1} ${sy1} Z"/><line x1="${C}" y1="${C}" x2="${sx1}" y2="${sy1}"/></g>`,
    ...RINGS.map((r) => `<circle class="r-ring r-ring--${r.key}" cx="${C}" cy="${C}" r="${r.outer}"/>`),
    `<line class="r-axis" x1="${C - 300}" y1="${C}" x2="${C + 300}" y2="${C}"/>`,
    `<line class="r-axis" x1="${C}" y1="${C - 300}" x2="${C}" y2="${C + 300}"/>`,
    ...RINGS.map((r) => `<text class="r-ring-label" x="${C}" y="${C - (r.inner + r.outer) / 2}" text-anchor="middle" dominant-baseline="central">${r.label}</text>`),
    ...QUADRANTS.map((q) => {
      const [x, y, anchor] = corners[q.key];
      return `<text class="r-quad" x="${x}" y="${y}" text-anchor="${anchor}">${esc(q.label)}</text>`;
    }),
    ...blips.map((b, i) => `<g class="blip blip--${b.ring}" data-id="${b.id}" data-repo="${esc(b.repo)}" transform="translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})" style="--d:${i}" tabindex="0" role="link" aria-label="${esc(`${b.id}. ${b.repo} — ${b.meta}`)}">
      <title>${esc(`${b.repo} — ${b.meta}`)}</title><circle r="11"/><text>${b.id}</text></g>`),
  ].join('');

  $('#radar-legend').innerHTML = `<div class="legend">${QUADRANTS.map((q) => {
    const list = blips.filter((b) => b.quad === q.key);
    const items = list
      .map((b) => `<li class="legend__item" data-id="${b.id}">
        <span class="legend__num legend__num--${b.ring}">${b.id}</span>
        <a class="legend__repo" href="${ghUrl(b.repo)}" target="_blank" rel="noopener">${esc(b.repo)}</a>
        <span class="legend__meta">${esc(b.meta)}</span>
      </li>`)
      .join('');
    return `<section class="legend__group"><h3>${esc(q.label)}<span>${list.length}</span></h3>${list.length ? `<ol>${items}</ol>` : '<p class="legend__empty">아직 없음</p>'}</section>`;
  }).join('')}</div>`;

  $('#ring-key').innerHTML = RINGS.map((r) => `<li><b><i class="key-dot key-dot--${r.key}"></i>${r.label}</b>${esc(r.desc)}</li>`).join('');

  const root = $('#radar');
  const activate = (id) => root.querySelectorAll('[data-id]').forEach((el) => el.classList.toggle('is-active', el.dataset.id === id));
  const open = (target) => {
    const blip = target.closest('.blip');
    if (blip) window.open(ghUrl(blip.dataset.repo), '_blank', 'noopener');
  };
  root.addEventListener('mouseover', (e) => activate(e.target.closest('[data-id]')?.dataset.id ?? null));
  root.addEventListener('mouseleave', () => activate(null));
  root.addEventListener('focusin', (e) => activate(e.target.closest('[data-id]')?.dataset.id ?? null));
  root.addEventListener('click', (e) => open(e.target));
  root.addEventListener('keydown', (e) => e.key === 'Enter' && open(e.target));
}

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
  const pre = $('#digest-text');
  pre.textContent = buildDigest(ctx);
  const status = $('#copy-status');
  $('#copy-digest').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent);
      status.textContent = '복사했습니다. 주간보고에 붙여 넣으세요.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = '텍스트를 선택해 두었습니다. ⌘C(Ctrl+C)로 복사하세요.';
    }
  });
}

function renderColophon(ctx) {
  const updated = new Intl.DateTimeFormat('ko-KR', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ctx.week.updatedAt));
  $('#colophon').innerHTML = `
    <p><b>DEV RADAR</b> · 개발팀 주간 기술 브리핑</p>
    <p>데이터 <a href="https://github.com/trending?since=weekly" target="_blank" rel="noopener">GitHub 주간 트렌딩</a>(전체 언어) · 마지막 갱신 ${esc(updated)} · 기록 시작 ${esc(dotted(ctx.index.since))}</p>`;
}

function renderError() {
  $('#dateline').textContent = '데이터 없음';
  $('#lead').innerHTML = `<div class="error">
    <p class="error__title">데이터를 불러오지 못했습니다.</p>
    <p>파일을 직접 열었다면 <code>node scripts/serve.mjs</code>로 띄운 뒤 <code>http://localhost:4318</code>에서 열어 주세요.</p>
  </div>`;
}

async function main() {
  document.querySelectorAll('[data-project]').forEach((el) => (el.textContent = PROJECT_NAME));
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
  if (document.visibilityState === 'visible') document.documentElement.classList.add('motion');
  renderDateline(ctx);
  renderFront(ctx);
  renderRadar(ctx);
  renderArchive(ctx);
  renderDigest(ctx);
  renderColophon(ctx);
}

main();
