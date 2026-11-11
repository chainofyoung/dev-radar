// DEV RADAR 레이더 계기 — 실제 PPI 레이더처럼 그리는 캔버스 엔진
// · 빔이 지나간 자리에만 반사 신호가 찍히고(형광체 잔광), 흰빛으로 번쩍였다가 녹색으로 식으며 사라진다.
// · 가까운 거리의 바다 잡음, 흩어진 잡음, 비구름 반사, 선수선, 방위 눈금
// · 추적 중인 표적은 ARPA 기호처럼 위에 겹쳐 그린다(판정별 모양). 마우스로 EBL/VRM(방위선·거리원)을 잰다.
const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;
const EDGE = 30; // 방위 눈금이 들어갈 가장자리 폭(px)
const PERSIST = 2.4; // 잔광 시간 상수(초)
const MAX_DOTS = 4200;
const GAIN = [
  { label: 'LO', clutter: 1.4, noise: 0.3, rain: 3, echo: 0.8 },
  { label: 'MID', clutter: 2.8, noise: 0.65, rain: 6, echo: 1 },
  { label: 'HI', clutter: 5, noise: 1.2, rain: 10, echo: 1 },
];
const RAIN_CELLS = [
  { b0: 112, b1: 140, r0: 0.5, r1: 0.66 },
  { b0: 196, b1: 214, r0: 0.62, r1: 0.74 },
];

export const CRT_COLORS = {
  adopt: '#62ff96',
  trial: '#5fd6ff',
  assess: '#ffc24a',
  hold: '#ff6f5e',
  detected: '#c8ffd6',
  weak: '#9be8b0',
};
export const GAIN_LABELS = GAIN.map((g) => g.label);

function mulberry(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const howMany = (x) => Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0);

export function createRadar(canvas, { rings, reducedMotion = false }) {
  const ctx = canvas.getContext('2d');
  const s = {
    size: 0, dpr: 1, cx: 0, cy: 0, R: 0, P: 0,
    angle: 40, rpm: 10, gain: 1, transmit: true,
    targets: [], hoverId: null, selectedId: null, selectedAt: 0, sector: null, pointer: null,
    dots: [], echoes: [], layer: null, glass: null, raf: 0, last: 0,
  };
  const handlers = { ping: new Set(), resize: new Set() };
  const emit = (type, payload) => handlers[type].forEach((fn) => fn(payload));

  const xy = (bearing, r) => {
    const a = rad(bearing - 90);
    return [s.cx + r * Math.cos(a), s.cy + r * Math.sin(a)];
  };
  const position = (t) => {
    const [x, y] = xy(t.bearing, t.rFrac * s.P);
    return { x, y };
  };
  const fade = (age) => (reducedMotion ? 1 : Math.exp(-age / PERSIST));

  function resize() {
    const width = canvas.getBoundingClientRect().width;
    if (!width) return;
    const size = Math.round(width);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    Object.assign(s, { size, dpr, cx: size / 2, cy: size / 2, R: size / 2, P: size / 2 - EDGE });
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    buildLayers();
    emit('resize');
    redraw();
  }

  function layerCanvas() {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    const g = c.getContext('2d');
    g.scale(s.dpr, s.dpr);
    return [c, g];
  }

  // 움직이지 않는 부분: CRT 바탕, 형광체 입자, 거리 링, 방위 눈금, 선수선 / 유리 반사
  function buildLayers() {
    const { size, cx, cy, R, P } = s;
    const [layer, g] = layerCanvas();

    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    bg.addColorStop(0, '#0b1f12');
    bg.addColorStop(0.7, '#06120a');
    bg.addColorStop(1, '#020603');
    g.fillStyle = bg;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.fill();

    const rand = mulberry(46);
    for (let i = 0; i < size * 5; i++) {
      const rr = R * Math.sqrt(rand());
      const aa = rand() * TAU;
      g.fillStyle = `rgba(110,255,150,${(0.012 + rand() * 0.035).toFixed(3)})`;
      g.fillRect(cx + rr * Math.cos(aa), cy + rr * Math.sin(aa), 1, 1);
    }

    g.lineWidth = 1;
    for (const ring of rings) {
      if (ring.key === 'weak') continue;
      g.setLineDash(ring.key === 'detected' ? [3, 5] : []);
      g.strokeStyle = ring.key === 'detected' ? 'rgba(140,255,170,.32)' : 'rgba(140,255,170,.17)';
      g.beginPath();
      g.arc(cx, cy, ring.outer * P, 0, TAU);
      g.stroke();
    }
    g.setLineDash([]);

    g.strokeStyle = 'rgba(150,255,180,.42)';
    g.beginPath();
    g.arc(cx, cy, P + 2, 0, TAU);
    g.stroke();
    for (let d = 0; d < 360; d++) {
      const len = d % 30 === 0 ? 10 : d % 10 === 0 ? 7 : d % 5 === 0 ? 4.5 : 2.2;
      const [x0, y0] = xy(d, P + 2);
      const [x1, y1] = xy(d, P + 2 + len);
      g.strokeStyle = d % 10 === 0 ? 'rgba(160,255,190,.62)' : 'rgba(150,255,180,.28)';
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }
    g.fillStyle = 'rgba(170,255,195,.78)';
    g.font = '500 9.5px "IBM Plex Mono", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 30) {
      const [x, y] = xy(d, P + 21);
      g.fillText(String(d).padStart(3, '0'), x, y);
    }

    // 선수선(000°) — 실제 선박 레이더의 SHM
    g.strokeStyle = 'rgba(190,255,210,.45)';
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx, cy - P);
    g.stroke();

    g.textAlign = 'left';
    g.fillStyle = 'rgba(160,255,190,.45)';
    g.font = '600 9.5px "IBM Plex Sans KR", sans-serif';
    for (const ring of rings) {
      if (ring.key === 'weak') continue;
      g.fillText(ring.label, cx + 5, cy - ((ring.inner + ring.outer) / 2) * P);
    }
    s.layer = layer;

    const [glass, gg] = layerCanvas();
    const hi = gg.createRadialGradient(cx - R * 0.38, cy - R * 0.48, 0, cx - R * 0.38, cy - R * 0.48, R * 1.15);
    hi.addColorStop(0, 'rgba(255,255,255,.11)');
    hi.addColorStop(0.32, 'rgba(255,255,255,.035)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = hi;
    gg.beginPath();
    gg.arc(cx, cy, R, 0, TAU);
    gg.fill();
    const vg = gg.createRadialGradient(cx, cy, R * 0.62, cx, cy, R);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.6)');
    gg.fillStyle = vg;
    gg.beginPath();
    gg.arc(cx, cy, R, 0, TAU);
    gg.fill();
    s.glass = glass;
  }

  function addDot(bearing, r, intensity, size, now) {
    const a = rad(bearing);
    s.dots.push({ x: r * Math.sin(a), y: -r * Math.cos(a), I: intensity, sz: size, t0: now });
  }

  // 빔이 prev에서 step만큼 돌 때 그 부채꼴에 새 반사 신호를 찍는다.
  function paint(prev, step, now) {
    const g = GAIN[s.gain];
    for (let i = howMany(g.clutter * step); i > 0; i--) {
      const r = 0.34 * Math.random() ** 1.7;
      addDot(prev + Math.random() * step, r, (0.25 + Math.random() * 0.6) * (1 - r / 0.36), 1.3 + Math.random() * 1.1, now);
    }
    for (let i = howMany(g.noise * step); i > 0; i--) {
      addDot(prev + Math.random() * step, 0.06 + Math.random() * 0.94, 0.08 + Math.random() * 0.24, 1.2, now);
    }
    for (let i = howMany(g.rain * step); i > 0; i--) {
      const b = (prev + Math.random() * step) % 360;
      const cell = RAIN_CELLS.find((c) => b >= c.b0 && b <= c.b1);
      if (cell) addDot(b, cell.r0 + Math.random() * (cell.r1 - cell.r0), 0.12 + Math.random() * 0.28, 1.4, now);
    }
    for (const t of s.targets) {
      if ((t.bearing - prev + 360) % 360 > step) continue;
      s.echoes.push({ b: t.bearing, r: t.rFrac, t0: now, I: t.verdict === 'weak' ? 0.55 : g.echo, weak: t.verdict === 'weak' });
      emit('ping', t.id);
    }
    if (s.dots.length > MAX_DOTS) s.dots.splice(0, s.dots.length - MAX_DOTS);
  }

  function drawReturns(now) {
    const { cx, cy, P } = s;
    const limit = PERSIST * 3000;
    s.dots = s.dots.filter((d) => now - d.t0 < limit);
    s.echoes = s.echoes.filter((e) => now - e.t0 < limit);
    for (const fresh of [false, true]) {
      ctx.fillStyle = fresh ? '#eafff2' : '#74ff92';
      for (const d of s.dots) {
        const age = (now - d.t0) / 1000;
        if ((age < 0.18) !== fresh) continue;
        const a = d.I * fade(age);
        if (a < 0.02) continue;
        ctx.globalAlpha = a;
        ctx.fillRect(cx + d.x * P, cy + d.y * P, d.sz, d.sz);
      }
    }
    ctx.lineCap = 'round';
    for (const e of s.echoes) {
      const age = (now - e.t0) / 1000;
      const a = e.I * fade(age);
      if (a < 0.02) continue;
      const rr = e.r * P;
      const half = (Math.min(9, Math.max(5, rr * 0.06)) / rr) * (180 / Math.PI);
      ctx.globalAlpha = a;
      ctx.strokeStyle = age < 0.22 ? '#f2fff8' : age < 0.8 ? '#b4ffc8' : '#6dff8c';
      ctx.shadowColor = '#5dff8f';
      ctx.shadowBlur = 12 * a;
      ctx.lineWidth = e.weak ? 3 : 5.5;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, rad(e.b - half - 90), rad(e.b + half - 90));
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawBeam() {
    const { cx, cy, P } = s;
    const beam = rad(s.angle - 90);
    if (ctx.createConicGradient) {
      const span = 26;
      const k = span / 360;
      const grad = ctx.createConicGradient(beam - rad(span), cx, cy);
      grad.addColorStop(0, 'rgba(120,255,160,0)');
      grad.addColorStop(k, 'rgba(120,255,160,0.13)');
      grad.addColorStop(Math.min(k + 0.002, 1), 'rgba(120,255,160,0)');
      grad.addColorStop(1, 'rgba(120,255,160,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, P, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(225,255,235,.9)';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = 'rgba(120,255,160,.9)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + P * Math.cos(beam), cy + P * Math.sin(beam));
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawSymbol(t, now) {
    const { x, y } = position(t);
    const color = CRT_COLORS[t.verdict] ?? CRT_COLORS.detected;
    const hovered = t.id === s.hoverId;
    const selected = t.id === s.selectedId;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = hovered || selected ? 1 : t.verdict === 'detected' ? 0.55 : 0.82;
    ctx.beginPath();
    switch (t.verdict) {
      case 'adopt':
        ctx.arc(0, 0, 8, 0, TAU);
        ctx.moveTo(12, 0);
        ctx.arc(0, 0, 12, 0, TAU);
        break;
      case 'trial':
        ctx.rect(-9, -9, 18, 18);
        break;
      case 'assess':
        ctx.moveTo(0, -12);
        ctx.lineTo(12, 0);
        ctx.lineTo(0, 12);
        ctx.lineTo(-12, 0);
        ctx.closePath();
        break;
      case 'hold':
        ctx.arc(0, 0, 9, 0, TAU);
        ctx.moveTo(-7, 7);
        ctx.lineTo(7, -7);
        break;
      case 'weak':
        if (hovered || selected) ctx.arc(0, 0, 7, 0, TAU);
        break;
      default:
        ctx.arc(0, 0, 9, 0, TAU);
    }
    ctx.stroke();
    if (t.verdict !== 'weak' || hovered || selected) {
      ctx.font = '600 9.5px "IBM Plex Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.code, 15, -11);
    }
    if (hovered && !selected) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#f2fff7';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (selected) {
      const p = Math.min(1, (now - s.selectedAt) / 450);
      const ease = 1 - (1 - p) ** 3;
      const d = 15 + 16 * (1 - ease);
      const arm = 6;
      ctx.globalAlpha = 0.35 + 0.65 * ease;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.moveTo(sx * d, sy * d + -sy * arm);
        ctx.lineTo(sx * d, sy * d);
        ctx.lineTo(sx * d + -sx * arm, sy * d);
      }
      ctx.stroke();
      if (!reducedMotion) {
        ctx.globalAlpha = 0.5 * ease;
        ctx.setLineDash([2, 4]);
        ctx.lineDashOffset = -now / 60;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  function drawPointer() {
    const p = s.pointer;
    if (!p) return;
    const { cx, cy, P } = s;
    const [ex, ey] = xy(p.bearing, P);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,190,80,.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(1, p.r) * P, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function draw(now) {
    const { size, dpr, cx, cy, R, P } = s;
    if (!size) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (s.layer) ctx.drawImage(s.layer, 0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, P + 1, 0, TAU);
    ctx.clip();
    if (s.sector) {
      ctx.fillStyle = 'rgba(140,255,170,.06)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, P, rad(s.sector[0] - 90), rad(s.sector[1] - 90));
      ctx.closePath();
      ctx.fill();
    }
    drawReturns(now);
    if (s.transmit && !reducedMotion) drawBeam();
    ctx.restore();

    drawPointer();
    for (const t of s.targets) drawSymbol(t, now);

    if (!s.transmit) {
      ctx.save();
      ctx.globalAlpha = Math.floor(now / 600) % 2 ? 0.95 : 0.35;
      ctx.fillStyle = '#ffc24a';
      ctx.font = '700 15px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('STBY', cx, cy + 26);
      ctx.restore();
    }
    if (s.glass) ctx.drawImage(s.glass, 0, 0, size, size);
    void R;
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - s.last) / 1000);
    s.last = now;
    if (s.transmit && dt > 0) {
      const prev = s.angle;
      const step = s.rpm * 6 * dt; // 1 RPM = 6°/초
      s.angle = (prev + step) % 360;
      paint(prev, step, now);
    }
    draw(now);
    s.raf = requestAnimationFrame(tick);
  }

  const redraw = () => {
    if (!s.raf) draw(performance.now());
  };

  new ResizeObserver(resize).observe(canvas);
  document.fonts?.ready.then(() => {
    if (!s.size) return;
    buildLayers();
    redraw();
  });
  resize();

  if (reducedMotion) {
    // 움직임을 줄인 화면: 한 바퀴 돈 직후처럼 정지 화면을 칠해 둔다.
    const now = performance.now();
    paint(0, 359.9, now);
  } else {
    s.raf = requestAnimationFrame((now) => {
      s.last = now;
      tick(now);
    });
  }

  return {
    setTargets(list) {
      s.targets = list;
      if (reducedMotion) paint(0, 359.9, performance.now());
      redraw();
    },
    setHover(id) { s.hoverId = id; redraw(); },
    setSelected(id) { s.selectedId = id; s.selectedAt = performance.now(); redraw(); },
    setSector(range) { s.sector = range; redraw(); },
    setPointer(p) { s.pointer = p; redraw(); },
    setGain(level) { s.gain = level; },
    setRpm(value) { s.rpm = value; },
    setTransmit(on) { s.transmit = on; redraw(); },
    toPercent(t) {
      if (!s.size) return { left: 50, top: 50 };
      const p = position(t);
      return { left: (p.x / s.size) * 100, top: (p.y / s.size) * 100 };
    },
    pointAt(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * (s.size / rect.width) - s.cx;
      const y = (clientY - rect.top) * (s.size / rect.height) - s.cy;
      return { bearing: ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360, r: Math.hypot(x, y) / s.P };
    },
    on(type, fn) { handlers[type].add(fn); },
  };
}
