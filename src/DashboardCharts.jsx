// Grafik dashboard (recharts) dipisah ke modul sendiri agar di-LAZY LOAD —
// recharts (library berat) tidak ikut bundle awal, hanya dimuat saat
// dashboard portofolio benar-benar dibuka.
import React from 'react';
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';

const C = {
  cream: '#F4EFE6', cream2: '#EBE3D3', ink: '#1A2A20', inkSoft: '#3A4A40',
  forest: '#1F3B2D', sage: '#6B8E5A', cuan: '#C49B3C', cuanBright: '#E5B842',
  rust: '#B85C38', red: '#C0392B', green: '#2E7D4F',
};
const fmtRp = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

// Nominal Rp disembunyikan saat mode privasi; PERSENTASE tetap tampil
// (konsisten dgn StatCard: "Rp ••••••" + persen tetap terlihat).
const MASK = 'Rp ••••••';

function PerfTooltip({ active, payload, hideBalance }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: C.ink, borderRadius: 8, padding: '8px 11px', fontSize: 12 }}>
      <div style={{ color: C.cream, marginBottom: 3 }}>{p.label}</div>
      <div style={{ color: C.cuanBright, fontWeight: 600 }}>{hideBalance ? MASK : fmtRp(p.value)}</div>
      {p.pct != null && (
        <div style={{ color: p.pct >= 0 ? '#6BCF8F' : '#F47766', fontWeight: 600, marginTop: 2 }}>
          Porto {fmtPct(p.pct)}
        </div>
      )}
      {p.ihsgPct != null && (
        <div style={{ color: 'rgba(244,239,230,0.7)', marginTop: 2 }}>
          IHSG {fmtPct(p.ihsgPct)}
        </div>
      )}
    </div>
  );
}

// Grafik performa portofolio vs IHSG
export function PerfChart({ perfData, todayLabel, hasIhsg, hideBalance }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={perfData}>
        <defs>
          <linearGradient id="cuanGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.cuan} stopOpacity={0.4} />
            <stop offset="100%" stopColor={C.cuan} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" hide />
        <YAxis hide domain={[(min) => min * 0.999, (max) => max * 1.001]} />
        <Tooltip content={<PerfTooltip hideBalance={hideBalance} />} />
        <ReferenceLine x={todayLabel} stroke={C.inkSoft} strokeDasharray="3 3" label={{ value: 'Hari ini', position: 'insideTopRight', fontSize: 10, fill: C.inkSoft }} />
        <Area type="linear" dataKey="value" stroke={C.cuan} strokeWidth={2.5} fill="url(#cuanGrad)" />
        {hasIhsg && <Area type="linear" dataKey="ihsg" stroke={C.inkSoft} strokeWidth={1.5} strokeDasharray="4 3" fill="none" dot={false} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Pie alokasi sektor
export function SectorPie({ sectorData, sectorColors, hideBalance }) {
  // Saat privasi aktif: jangan tampilkan nominal. Tampilkan PORSI (%) saja —
  // tetap berguna dan tidak membocorkan nilai portofolio.
  const total = (sectorData || []).reduce((s, d) => s + (Number(d.value) || 0), 0);
  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie data={sectorData} dataKey="value" cx="50%" cy="50%" innerRadius={42} outerRadius={70} paddingAngle={2}>
          {sectorData.map((_, i) => <Cell key={i} fill={sectorColors[i % sectorColors.length]} />)}
        </Pie>
        <Tooltip
          contentStyle={{ background: C.ink, border: 'none', borderRadius: 8, fontSize: 12, color: C.cream }}
          itemStyle={{ color: C.cream }}
          formatter={(v) => (hideBalance
            ? (total > 0 ? `${((Number(v) / total) * 100).toFixed(1)}% dari porto` : MASK)
            : fmtRp(v))}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
