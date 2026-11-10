#!/usr/bin/env node
// GitHub 주간 트렌딩 수집기
// - github.com/trending?since=weekly (전체 언어)를 읽어 이번 주 파일(data/weeks/YYYY-Www.json)에 저장한다.
// - 같은 주에 여러 번 돌면 그 주 파일을 최신으로 덮어쓴다. 주가 바뀌면 새 파일이 생기고 지난주 기록은 그대로 남는다.
// - 마지막에 모든 주 파일로 data/index.json(주차 목록 + TOP 7 누적 기록)을 다시 만든다.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const WEEKS_DIR = path.join(DATA_DIR, 'weeks');
const TOP_N = 7;
const SOURCE_URL = 'https://github.com/trending?since=weekly';

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ISO 주차 (월요일 시작). 예: 2026-11-11 → { id: '2026-W46', start: '2026-11-09', end: '2026-11-15' }
function weekOf(ymd) {
  const date = new Date(`${ymd}T00:00:00Z`);
  const dayIndex = (date.getUTCDay() + 6) % 7;
  const shift = (base, days) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  };
  const monday = shift(date, -dayIndex);
  const thursday = shift(monday, 3);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const firstThursday = shift(jan4, 3 - ((jan4.getUTCDay() + 6) % 7));
  const week = 1 + Math.round((thursday - firstThursday) / (7 * 86400000));
  const ymdOf = (d) => d.toISOString().slice(0, 10);
  return { id: `${isoYear}-W${String(week).padStart(2, '0')}`, start: ymdOf(monday), end: ymdOf(shift(monday, 6)) };
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
const toText = (html) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const toNumber = (s) => (s ? Number(s.replace(/[^\d]/g, '')) : 0);

function parseTrending(html) {
  const rows = html.split(/<article\b[^>]*class="[^"]*\bBox-row\b/).slice(1);
  const items = [];
  for (const row of rows) {
    const repo = row.match(/<h2[\s\S]*?href="\/([\w.-]+\/[\w.-]+)"/)?.[1];
    if (!repo) continue;
    const desc = row.match(/<p\b[^>]*class="[^"]*\bcol-9\b[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1];
    items.push({
      rank: items.length + 1,
      repo,
      desc: desc ? toText(desc) : '',
      lang: row.match(/itemprop="programmingLanguage">([^<]+)</)?.[1].trim() ?? null,
      color: row.match(/repo-language-color"[^>]*style="background-color:\s*([^;"]+)/)?.[1].trim() ?? null,
      stars: toNumber(row.match(/\/stargazers"[\s\S]*?<\/svg>\s*([\d,]+)/)?.[1]),
      forks: toNumber(row.match(/\/forks"[\s\S]*?<\/svg>\s*([\d,]+)/)?.[1]),
      gained: toNumber(row.match(/([\d,]+)\s+stars?\s+this week/)?.[1]),
    });
  }
  return items;
}

async function fetchWeeklyTrending() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(SOURCE_URL, {
        headers: { 'User-Agent': 'dev-radar-collector', 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseTrending(await res.text());
      if (items.length < TOP_N) throw new Error(`레포 ${items.length}개만 읽힘 (페이지 구조가 바뀌었을 수 있음)`);
      return items;
    } catch (err) {
      console.warn(`시도 ${attempt}/3 실패: ${err.message}`);
      if (attempt < 3) await sleep(5000 * attempt);
    }
  }
  throw new Error('GitHub 트렌딩을 읽지 못했습니다.');
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function rebuildIndex(updatedAt) {
  const files = (await readdir(WEEKS_DIR)).filter((f) => /^\d{4}-W\d{2}\.json$/.test(f)).sort();
  const weeks = [];
  const repos = {};
  for (const file of files) {
    const wk = JSON.parse(await readFile(path.join(WEEKS_DIR, file), 'utf8'));
    const top = wk.items.slice(0, TOP_N);
    weeks.push({ id: wk.week, start: wk.start, end: wk.end, updatedAt: wk.updatedAt, top: top.map((it) => it.repo) });
    for (const it of top) {
      const entry = (repos[it.repo] ??= { weeks: [], bestRank: it.rank });
      entry.weeks.push(wk.week);
      entry.bestRank = Math.min(entry.bestRank, it.rank);
      Object.assign(entry, { lang: it.lang, color: it.color, desc: it.desc.slice(0, 200), stars: it.stars });
    }
  }
  // since = 처음 수집한 날. 한 번 정해지면 유지한다.
  const previous = await readJson(path.join(DATA_DIR, 'index.json'), {});
  const index = { since: previous.since ?? today, updatedAt, topN: TOP_N, weeks, repos };
  await writeFile(path.join(DATA_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

async function main() {
  const week = weekOf(today);
  const items = await fetchWeeklyTrending();
  const updatedAt = new Date().toISOString();

  await mkdir(WEEKS_DIR, { recursive: true });
  const record = { week: week.id, start: week.start, end: week.end, collectedOn: today, updatedAt, source: SOURCE_URL, items };
  await writeFile(path.join(WEEKS_DIR, `${week.id}.json`), `${JSON.stringify(record, null, 2)}\n`);

  const notesFile = path.join(DATA_DIR, 'notes.json');
  if ((await readJson(notesFile, null)) === null) await writeFile(notesFile, '[]\n');

  const index = await rebuildIndex(updatedAt);
  console.log(`${week.id} (${week.start} ~ ${week.end}) 갱신: 트렌딩 ${items.length}개 중 TOP ${TOP_N}`);
  items.slice(0, TOP_N).forEach((it) => console.log(`  ${it.rank}. ${it.repo}  +${it.gained.toLocaleString()}★  ${it.lang ?? '-'}`));
  console.log(`누적: ${index.weeks.length}주, TOP ${TOP_N} 레포 ${Object.keys(index.repos).length}개`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
