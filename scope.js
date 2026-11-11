// DEV RADAR 스코프 — 캔버스로 그리는 PPI 레이더 화면
// 회전 스윕 + 잔광, 바닥 잡음(클러터), 스윕이 지나갈 때 표적 반짝임·파문(핑)
const TAU = Math.PI * 2;
const rad = (deg) => (deg * Math.PI) / 180;
const MARGIN = 34; // 바깥 방위 숫자가 들어갈 자리(px)

export const VERDICT_COLORS = {
  adopt: '#44ff9a',
  trial: '#4fe3ff',
  assess: '#ffbe3d',
  hold: '#ff5c50',
  detected: '#44ff9a',
  weak: '#3fbf7f',
};

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function createScope(canvas, { rings, reducedMotion = false }) {
  const ctx = canvas.getContext('2d');
  const s = {
    size: 0, dpr: 1, cx: 0, cy: 0, R: 0,
    angle: 38, rpm: 10, paused: false,
    targets: [], hoverId: null, selectedId: null, sector: null,
    lastHit: new Map(), ripples: [], layer: null, raf: 0, last: 0,
  };
  const handlers = { ping: new Set(), resize: new Set() };
  const emit = (type, payload) => handlers[type].forEach((fn) => fn(payload));

  const position = (t) => {
    const a = rad(t.bearing - 90);
    return { x: s.cx + t.rFrac * s.R * Math.cos(a), y: s.cy + t.rFrac * s.R * Math.sin(a) };
  };

  function resize() {
    const width = canvas.getBoundingClientRect().width;
    if (!width) return;
    const size = Math.round(width);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    Object.assign(s, { size, dpr, cx: size / 2, cy: size / 2, R: size / 2 - MARGIN });
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    buildLayer();
    emit('resize');
    redraw();
  }

  // 움직이지 않는 부분(화면 바탕·링·눈금)은 한 번만 그려 둔다.
  function buildLayer() {
    const { dpr, cx, cy, R } = s;
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const g = layer.getContext('2d');
    g.scale(dpr, dpr);

    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    bg.addColorStop(0, '#0b2a19');
    bg.addColorStop(0.65, '#06170e');
    bg.addColorStop(1, '#020905');
    g.fillStyle = bg;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.fill();

    g.lineWidth = 1;
    for (let d = 0; d < 360; d += 30) {
      const a = rad(d - 90);
      g.strokeStyle = d % 90 === 0 ? 'rgba(68,255,154,.2)' : 'rgba(68,255,154,.07)';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
      g.stroke();
    }

    for (const ring of rings) {
      if (ring.key === 'weak') continue;
      g.setLineDash(ring.key === 'detected' ? [2, 5] : []);
      g.strokeStyle = ring.key === 'detected' ? 'rgba(68,255,154,.42)' : 'rgba(68,255,154,.2)';
      g.beginPath();
      g.arc(cx, cy, ring.outer * R, 0, TAU);
      g.stroke();
    }
    g.setLineDash([]);

    g.strokeStyle = 'rgba(68,255,154,.55)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.stroke();
    for (let d = 0; d < 360; d++) {
      const len = d % 30 === 0 ? 11 : d % 10 === 0 ? 7 : d % 5 === 0 ? 4.5 : 2;
      const a = rad(d - 90);
      g.strokeStyle = d % 10 === 0 ? 'rgba(68,255,154,.62)' : 'rgba(68,255,154,.26)';
      g.lineWidth = d % 30 === 0 ? 1.4 : 1;
      g.beginPath();
      g.moveTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
      g.lineTo(cx + (R - len) * Math.cos(a), cy + (R - len) * Math.sin(a));
      g.stroke();
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(159,216,184,.9)';
    g.font = '500 10px "IBM Plex Mono", monospace';
    for (let d = 0; d < 360; d += 30) {
      const a = rad(d - 90);
      g.fillText(String(d).padStart(3, '0'), cx + (R + 16) * Math.cos(a), cy + (R + 16) * Math.sin(a));
    }

    g.textAlign = 'left';
    g.fillStyle = 'rgba(159,216,184,.55)';
    g.font = '600 10px "IBM Plex Sans KR", sans-serif';
    for (const ring of rings) {
      if (ring.key === 'weak') continue;
      g.fillText(ring.label, cx + 6, cy - ((ring.inner + ring.outer) / 2) * R);
    }

    g.strokeStyle = 'rgba(190,255,220,.85)';
    g.beginPath();
    g.arc(cx, cy, 3, 0, TAU);
    g.stroke();
    s.layer = layer;
  }

  function drawSymbol(t, size) {
    switch (t.verdict) {
      case 'adopt':
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.72, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, size + 3.5, 0, TAU);
        ctx.stroke();
        break;
      case 'trial':
        ctx.strokeRect(-size, -size, size * 2, size * 2);
        ctx.fillRect(-size * 0.45, -size * 0.45, size * 0.9, size * 0.9);
        break;
      case 'assess':
        ctx.beginPath();
        ctx.moveTo(0, -size - 2.5);
        ctx.lineTo(size + 2.5, 0);
        ctx.lineTo(0, size + 2.5);
        ctx.lineTo(-size - 2.5, 0);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 2.2, 0, TAU);
        ctx.fill();
        break;
      case 'hold':
        ctx.beginPath();
        ctx.arc(0, 0, size + 1, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-size * 0.6, -size * 0.6);
        ctx.lineTo(size * 0.6, size * 0.6);
        ctx.moveTo(size * 0.6, -size * 0.6);
        ctx.lineTo(-size * 0.6, size * 0.6);
        ctx.stroke();
        break;
      case 'weak':
        ctx.beginPath();
        ctx.arc(0, 0, 2.4, 0, TAU);
        ctx.fill();
        break;
      default:
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha *= 0.2;
        ctx.fill();
    }
  }

  function drawTarget(t, now) {
    const { x, y } = position(t);
    const color = VERDICT_COLORS[t.verdict] ?? VERDICT_COLORS.detected;
    const hit = s.lastHit.get(t.id);
    const glow = reducedMotion ? 1 : hit === undefined ? 0 : Math.exp(-(now - hit) / 2300);
    const base = t.verdict === 'weak' ? 0.24 : t.verdict === 'detected' ? 0.45 : 0.6;
    const emphasis = t.id === s.hoverId || t.id === s.selectedId;
    const size = 6.5;

    ctx.save();
    ctx.translate(x, y);
    if (t.id === s.hoverId && t.id !== s.selectedId) {
      ctx.strokeStyle = 'rgba(242,255,247,.7)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, size + 10, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = emphasis ? 1 : Math.min(1, base + (1 - base) * glow);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 5 + 13 * (emphasis ? 1 : glow);
    drawSymbol(t, size);
    ctx.restore();

    if (t.verdict !== 'weak' || emphasis) {
      ctx.save();
      ctx.globalAlpha = emphasis ? 1 : 0.55 + 0.45 * glow;
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = emphasis ? '#f2fff7' : rgba(color, 0.9);
      ctx.fillText(t.code, x + size + 8, y - size - 3);
      ctx.restore();
    }
  }

  function draw(now) {
    const { size, dpr, cx, cy, R } = s;
    if (!size) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    if (s.layer) ctx.drawImage(s.layer, 0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, 0, TAU);
    ctx.clip();

    if (s.sector) {
      ctx.fillStyle = 'rgba(68,255,154,.07)';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, rad(s.sector[0] - 90), rad(s.sector[1] - 90));
      ctx.closePath();
      ctx.fill();
    }

    // 스윕 꼬리 잔광
    const beam = rad(s.angle - 90);
    const trail = 110;
    if (ctx.createConicGradient) {
      const k = trail / 360;
      const grad = ctx.createConicGradient(beam - rad(trail), cx, cy);
      grad.addColorStop(0, 'rgba(68,255,154,0)');
      grad.addColorStop(k * 0.55, 'rgba(68,255,154,0.04)');
      grad.addColorStop(k * 0.9, 'rgba(68,255,154,0.15)');
      grad.addColorStop(k, 'rgba(68,255,154,0.34)');
      grad.addColorStop(Math.min(k + 0.002, 1), 'rgba(68,255,154,0)');
      grad.addColorStop(1, 'rgba(68,255,154,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    } else {
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = `rgba(68,255,154,${(0.3 * (1 - i / 24) ** 2).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, beam - rad(trail) * ((i + 1) / 24), beam - rad(trail) * (i / 24));
        ctx.closePath();
        ctx.fill();
      }
    }

    // 바닥 잡음(클러터)과 빔 앞 잡음
    if (!reducedMotion) {
      for (let i = 0; i < 46; i++) {
        const r = R * 0.34 * Math.random() ** 1.6;
        const a = Math.random() * TAU;
        ctx.fillStyle = `rgba(68,255,154,${(Math.random() * 0.22).toFixed(3)})`;
        ctx.fillRect(cx + r * Math.cos(a), cy + r * Math.sin(a), 1.4, 1.4);
      }
      for (let i = 0; i < 14; i++) {
        const r = R * (0.1 + Math.random() * 0.88);
        const a = beam - Math.random() * rad(5);
        ctx.fillStyle = `rgba(150,255,200,${(Math.random() * 0.35).toFixed(3)})`;
        ctx.fillRect(cx + r * Math.cos(a), cy + r * Math.sin(a), 1.6, 1.6);
      }
    }

    ctx.strokeStyle = 'rgba(190,255,220,.95)';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(68,255,154,.95)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(beam), cy + R * Math.sin(beam));
    ctx.stroke();
    ctx.restore();

    s.ripples = s.ripples.filter((p) => now - p.t0 < 1100);
    for (const p of s.ripples) {
      const k = (now - p.t0) / 1100;
      ctx.strokeStyle = rgba(p.color, (1 - k) * 0.8);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7 + k * 26, 0, TAU);
      ctx.stroke();
    }

    for (const t of s.targets) drawTarget(t, now);
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - s.last) / 1000);
    s.last = now;
    if (!s.paused && dt > 0) {
      const prev = s.angle;
      const step = s.rpm * 6 * dt; // 1 RPM = 6°/초
      s.angle = (prev + step) % 360;
      for (const t of s.targets) {
        if ((t.bearing - prev + 360) % 360 > step) continue;
        s.lastHit.set(t.id, now);
        if (t.verdict !== 'weak') {
          const p = position(t);
          s.ripples.push({ x: p.x, y: p.y, t0: now, color: VERDICT_COLORS[t.verdict] });
        }
        emit('ping', t.id);
      }
    }
    draw(now);
    s.raf = requestAnimationFrame(tick);
  }

  const redraw = () => {
    if (!s.raf) draw(performance.now());
  };

  new ResizeObserver(resize).observe(canvas);
  document.fonts?.ready.then(() => {
    if (s.size) {
      buildLayer();
      redraw();
    }
  });
  resize();
  if (!reducedMotion) {
    s.raf = requestAnimationFrame((now) => {
      s.last = now;
      tick(now);
    });
  }

  return {
    setTargets(list) { s.targets = list; redraw(); },
    setHover(id) { s.hoverId = id; redraw(); },
    setSelected(id) { s.selectedId = id; redraw(); },
    setSector(range) { s.sector = range; redraw(); },
    setPaused(value) { s.paused = value; },
    setRpm(value) { s.rpm = value; },
    toPercent(t) {
      const p = position(t);
      return { left: (p.x / s.size) * 100, top: (p.y / s.size) * 100 };
    },
    pointAt(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) * (s.size / rect.width) - s.cx;
      const y = (clientY - rect.top) * (s.size / rect.height) - s.cy;
      return { bearing: ((Math.atan2(y, x) * 180) / Math.PI + 90 + 360) % 360, r: Math.hypot(x, y) / s.R };
    },
    on(type, fn) { handlers[type].add(fn); },
  };
}
