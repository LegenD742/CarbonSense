'use strict';

const API_BASE = 'http://localhost:3001/api';

const SAMPLES = {
  python: `# Fibonacci sequence — O(n) dynamic programming
def fibonacci(n):
    if n <= 1:
        return n
    dp = [0] * (n + 1)
    dp[1] = 1
    for i in range(2, n + 1):
        dp[i] = dp[i-1] + dp[i-2]
    return dp[n]

# Compute first 30 Fibonacci numbers
results = [fibonacci(i) for i in range(30)]
print("Fibonacci sequence:")
for i, val in enumerate(results):
    print(f"  F({i:2d}) = {val}")

# Matrix multiplication simulation
import time
size = 50
matrix_a = [[i * j for j in range(size)] for i in range(size)]
matrix_b = [[i + j for j in range(size)] for i in range(size)]

start = time.time()
result = [[sum(matrix_a[i][k] * matrix_b[k][j] 
               for k in range(size)) 
           for j in range(size)] 
          for i in range(size)]
elapsed = time.time() - start
print(f"\\nMatrix multiply ({size}x{size}): {elapsed:.4f}s")
print(f"Result[0][0] = {result[0][0]}")`,

  cpp: `#include <iostream>
#include <vector>
#include <chrono>
#include <numeric>

// Sieve of Eratosthenes
std::vector<int> sieve(int limit) {
    std::vector<bool> is_prime(limit + 1, true);
    std::vector<int> primes;
    is_prime[0] = is_prime[1] = false;
    for (int i = 2; i <= limit; i++) {
        if (is_prime[i]) {
            primes.push_back(i);
            for (long long j = (long long)i * i; j <= limit; j += i)
                is_prime[j] = false;
        }
    }
    return primes;
}

int main() {
    auto start = std::chrono::high_resolution_clock::now();
    
    // Find primes up to 100000
    auto primes = sieve(100000);
    
    auto end = std::chrono::high_resolution_clock::now();
    double ms = std::chrono::duration<double, std::milli>(end - start).count();
    
    std::cout << "Primes up to 100,000: " << primes.size() << std::endl;
    std::cout << "Largest prime: " << primes.back() << std::endl;
    std::cout << "Time: " << ms << " ms" << std::endl;
    
    // Sum of primes
    long long sum = std::accumulate(primes.begin(), primes.end(), 0LL);
    std::cout << "Sum of all primes: " << sum << std::endl;
    
    return 0;
}`
};

// ── State ────────────────────────────────────────────────────────
let isRunning = false;
let lastResult = null;

// ── DOM helpers ──────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function setHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

// ── Tab system ───────────────────────────────────────────────────
function switchTab(tab) {
  ['analyzer', 'calculator', 'history', 'about'].forEach(t => {
    $(`tab-content-${t}`).classList.add('hidden');
    $(`tab-${t}`).classList.remove('active');
  });
  $(`tab-content-${tab}`).classList.remove('hidden');
  $(`tab-${tab}`).classList.add('active');

  if (tab === 'history') loadDataset();
}

// ── Clock ────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  setText('header-time', now.toLocaleTimeString('en-US', { hour12: false }));
}
setInterval(updateClock, 1000);
updateClock();

// ── Health check ─────────────────────────────────────────────────
async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      setText('header-status', 'Backend connected');
      $('header-status').previousElementSibling.style.background = '#28c840';
    }
  } catch {
    setText('header-status', 'Backend offline — start server');
    $('header-status').previousElementSibling.style.background = '#ff5f57';
  }
}
checkHealth();

// ── Load sample code ─────────────────────────────────────────────
function loadSample() {
  const lang = $('lang-select').value;
  $('code-input').value = SAMPLES[lang] || SAMPLES.python;
  setText('terminal-output', '// Sample code loaded. Press RUN to analyze.');
}

// ── Format numbers ───────────────────────────────────────────────
function fmtNum(val, decimals = 4) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const n = parseFloat(val);
  if (n === 0) return '0';
  if (Math.abs(n) < 0.0001) return n.toExponential(3);
  return n.toFixed(decimals);
}

function fmtTime(sec) {
  if (!sec && sec !== 0) return '—';
  if (sec < 0.001) return (sec * 1000000).toFixed(0) + 'µs';
  if (sec < 1) return (sec * 1000).toFixed(2) + 'ms';
  if (sec < 60) return sec.toFixed(4) + 's';
  return (sec / 60).toFixed(2) + 'min';
}

// ── CO₂ rating HTML ──────────────────────────────────────────────
function ratingHTML(rating) {
  if (!rating) return '';
  const colors = {
    Minimal:  '#22c55e',
    Low:      '#86efac',
    Medium:   '#fbbf24',
    High:     '#f97316',
    Critical: '#ef4444'
  };
  const c = colors[rating.rating] || '#888';
  return `<span class="rating-badge" style="color:${c};border-color:${c}">
    ${rating.emoji} ${rating.rating}
  </span>`;
}

// ── Update carbon intensity display ─────────────────────────────
function updateIntensityDisplay() {
  // Intensity is already baked into country select labels
}

// ── MODULE 1: Execute Code ────────────────────────────────────────
async function executeCode() {
  const code = $('code-input').value.trim();
  if (!code) {
    alert('Please enter some code first.');
    return;
  }
  if (isRunning) return;

  isRunning = true;
  const btn = $('run-btn');
  btn.disabled = true;

  // Reset UI
  setText('run-status', '');
  setHTML('co2-display', '<span class="spinner"></span>');
  setText('co2-unit', 'measuring...');
  setHTML('rating-display', '');
  setText('terminal-output', '// Executing code...\n// Measuring CPU usage via psutil...');
  setText('return-code-badge', '');
  ['m-exec-time', 'm-cpu', 'm-energy', 'm-power'].forEach(id => setText(id, '—'));
  $('cpu-bar').style.width = '0%';
  setHTML('power-breakdown', '<div class="text-xs mono" style="color:var(--text-muted)">Computing...</div>');
  setHTML('comparisons-display', '<div class="text-xs mono" style="color:var(--text-muted)">Computing...</div>');

  const startTs = Date.now();

  try {
    const payload = {
      code,
      language: $('lang-select').value,
      countryCode: $('country-select').value,
      cpuProfile: 'desktop_mid'
    };

    const res = await fetch(`${API_BASE}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Server error ${res.status}`);
    }

    lastResult = data;
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(2);

    // ── Terminal output ──
    let termOut = '';
    if (data.execution.stdout) termOut += data.execution.stdout;
    if (data.execution.stderr) termOut += '\n[stderr] ' + data.execution.stderr;
    if (!termOut) termOut = '(no output)';
    setText('terminal-output', termOut.trim());

    // Return code badge
    const rc = data.execution.returnCode;
    setHTML('return-code-badge',
      `<span class="mono text-xs" style="color:${rc === 0 ? '#28c840' : '#ff5f57'}">
        exit: ${rc}
      </span>`
    );

    // ── CO₂ display ──
    const co2 = data.carbon.co2Grams;
    const co2Display = co2 < 0.001
      ? (co2 * 1_000_000).toFixed(2) + ' µg'
      : co2 < 1
      ? (co2 * 1000).toFixed(3) + ' mg'
      : co2.toFixed(4) + ' g';

    setHTML('co2-display',
      `<span class="fade-in">${co2 < 0.001 ? (co2 * 1_000_000).toFixed(2) : co2 < 1 ? (co2 * 1000).toFixed(3) : co2.toFixed(4)}</span>`
    );
    setText('co2-unit', co2 < 0.001 ? 'micrograms CO₂eq' : co2 < 1 ? 'milligrams CO₂eq' : 'grams CO₂eq');
    setHTML('rating-display', ratingHTML(data.rating));

    // Apply glow color by rating
    const glowColors = { Minimal: '#22c55e', Low: '#86efac', Medium: '#fbbf24', High: '#f97316', Critical: '#ef4444' };
    $('co2-display').style.color = glowColors[data.rating?.rating] || 'var(--accent-green)';

    // ── Metrics ──
    setText('m-exec-time', fmtTime(data.execution.executionTime));
    setText('m-cpu', data.execution.cpuUsage.toFixed(1) + '%');
    setText('m-energy', data.energy.energyKWh.toExponential(3));
    setText('m-power', data.energy.p_total.toFixed(1));
    $('cpu-bar').style.width = Math.min(100, data.execution.cpuUsage) + '%';

    // ── Power breakdown ──
    const pb = data.energy;
    setHTML('power-breakdown', `
      <div class="space-y-2">
        ${powerRow('CPU', pb.p_cpu, pb.p_total)}
        ${powerRow('RAM', pb.p_ram, pb.p_total)}
        ${powerRow('Disk', pb.p_disk, pb.p_total)}
        <div class="flex justify-between mono text-xs pt-2" style="border-top:1px solid var(--border);color:var(--text-muted)">
          <span>Total</span>
          <span style="color:var(--accent-green)">${pb.p_total.toFixed(2)}W</span>
        </div>
        <div class="mono text-xs" style="color:var(--text-muted)">
          Grid: ${data.carbon.carbonIntensity} gCO₂/kWh (${data.carbon.country})
        </div>
      </div>
    `);

    // ── Comparisons ──
    renderComparisons('comparisons-display', data.comparisons, data.carbon.co2Grams);

    setText('run-status', `✓ Completed in ${elapsed}s`);
    $('run-status').style.color = 'var(--accent-green)';

    // Update footer count
    loadFooterCount();

  } catch (err) {
    console.error('Execute error:', err);
    setHTML('co2-display', '<span style="color:var(--accent-red)">ERR</span>');
    setText('terminal-output', `[ERROR] ${err.message}\n\nMake sure the backend is running:\n  cd backend && npm install && node server.js`);
    setText('run-status', '✗ Failed');
    $('run-status').style.color = 'var(--accent-red)';
  } finally {
    isRunning = false;
    btn.disabled = false;
  }
}

function powerRow(label, watts, total) {
  const pct = total > 0 ? (watts / total * 100) : 0;
  return `
    <div>
      <div class="flex justify-between mono text-xs mb-1" style="color:var(--text-muted)">
        <span>${label}</span>
        <span>${watts.toFixed(2)}W (${pct.toFixed(0)}%)</span>
      </div>
      <div class="progress-track" style="height:3px">
        <div class="progress-fill" style="width:${pct}%;background:var(--accent-teal)"></div>
      </div>
    </div>
  `;
}

function renderComparisons(containerId, cmp, co2Grams) {
  if (!cmp) return;
  const items = [
    { icon: '🚗', label: 'km by car', value: cmp.kmDriven, unit: 'km', thresh: 0.001 },
    { icon: '📱', label: 'phone charges', value: cmp.phoneCharges, unit: '', thresh: 0.1 },
    { icon: '💡', label: 'LED bulb hours', value: cmp.LEDHours, unit: 'h', thresh: 0.01 },
    { icon: '🌳', label: 'tree-seconds', value: cmp.treesNeeded * 3.154e7, unit: 's', thresh: 1 },
  ];

  const html = items.map(item => {
    const v = parseFloat(item.value);
    if (v < 1e-10) return '';
    const display = v < 0.001 ? v.toExponential(2) : v < 1 ? v.toFixed(4) : v.toFixed(3);
    return `
      <div class="flex items-center gap-2 mono text-xs" style="color:var(--text-muted)">
        <span>${item.icon}</span>
        <span style="flex:1">${item.label}</span>
        <span style="color:var(--accent-teal)">${display}${item.unit}</span>
      </div>`;
  }).join('');

  setHTML(containerId, html || '<div class="mono text-xs" style="color:var(--text-muted)">Emissions too small to compare meaningfully.</div>');
}

// ── MODULE 3: Activity Calculator ────────────────────────────────
async function calculateActivities() {
  const activities = {};
  const mapping = {
    coding:      $('calc-coding').value,
    gaming:      $('calc-gaming').value,
    ml_training: $('calc-ml').value,
    browsing:    $('calc-browsing').value,
    video:       $('calc-video').value
  };

  let hasActivity = false;
  for (const [key, val] of Object.entries(mapping)) {
    const v = parseFloat(val);
    if (v > 0) {
      activities[key] = v;
      hasActivity = true;
    }
  }

  if (!hasActivity) {
    alert('Please enter at least one activity duration.');
    return;
  }

  setHTML('calc-total-co2', '<span class="spinner"></span>');
  setHTML('calc-activity-bars', '<div class="mono text-xs" style="color:var(--text-muted)">Calculating...</div>');

  try {
    const res = await fetch(`${API_BASE}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activities,
        countryCode: $('calc-country').value
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Calculation failed');

    // Total
    const co2 = data.total.co2Grams;
    const display = co2 > 1000 ? (co2/1000).toFixed(2) + ' kg' : co2.toFixed(2) + ' g';
    setHTML('calc-total-co2', `<span class="fade-in">${co2 > 1000 ? (co2/1000).toFixed(2) : co2.toFixed(2)}</span>`);
    $('calc-total-co2').nextElementSibling.textContent = co2 > 1000 ? 'kg CO₂ total' : 'grams CO₂ total';
    setHTML('calc-rating', ratingHTML(data.total.rating));

    // Activity breakdown bars
    const maxCO2 = Math.max(...data.results.map(r => r.co2Grams), 0.0001);
    const barsHTML = data.results.map(r => {
      const pct = (r.co2Grams / maxCO2 * 100).toFixed(0);
      const co2Str = r.co2Grams > 1000
        ? (r.co2Grams/1000).toFixed(2) + ' kg'
        : r.co2Grams.toFixed(4) + ' g';
      return `
        <div class="mb-3">
          <div class="flex justify-between mono text-xs mb-1" style="color:var(--text-muted)">
            <span>${r.label} (${r.hours}h)</span>
            <span style="color:var(--accent-amber)">${co2Str}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%;background:var(--accent-amber)"></div>
          </div>
        </div>`;
    }).join('');

    setHTML('calc-activity-bars', barsHTML);

    // Comparisons
    renderComparisons('calc-comparisons', data.comparisons, co2);

  } catch (err) {
    console.error('Calculator error:', err);
    setHTML('calc-total-co2', '<span style="color:var(--accent-red)">ERR</span>');
    setHTML('calc-activity-bars', `<div class="mono text-xs" style="color:var(--accent-red)">${err.message}</div>`);
  }
}

// ── MODULE 4: Dataset Viewer ──────────────────────────────────────
async function loadDataset() {
  try {
    // Load stats
    const statsRes = await fetch(`${API_BASE}/dataset/stats`);
    const stats = await statsRes.json();

    setText('stat-count', stats.count || '0');
    setText('stat-co2', stats.totalCO2Grams ? stats.totalCO2Grams.toFixed(4) : '0');
    setText('stat-avg', stats.avgCO2Grams ? stats.avgCO2Grams.toFixed(6) : '0');
    setText('stat-latest', stats.latestTimestamp
      ? new Date(stats.latestTimestamp).toLocaleString().split(',')[0]
      : '—');

    // Load records
    const dataRes = await fetch(`${API_BASE}/dataset?limit=100`);
    const data = await dataRes.json();

    setText('table-count', `${data.total} records`);
    setText('footer-count', data.total);

    const ratingMap = {
      co2: (g) => {
        g = parseFloat(g);
        if (g < 0.01)  return '<span style="color:#22c55e">🌿</span>';
        if (g < 0.1)   return '<span style="color:#86efac">✅</span>';
        if (g < 1.0)   return '<span style="color:#fbbf24">⚠️</span>';
        if (g < 10)    return '<span style="color:#f97316">🔥</span>';
        return '<span style="color:#ef4444">💀</span>';
      }
    };

    const rows = [...data.records].reverse().map(r => `
      <tr>
        <td style="color:var(--text-muted)">${r.timestamp?.substring(0,19) || '—'}</td>
        <td><span style="color:var(--accent-teal)">${r.activity || '—'}</span></td>
        <td>${r.language || '—'}</td>
        <td>${parseFloat(r.executionTime || 0).toFixed(3)}</td>
        <td>${parseFloat(r.cpuUsage || 0).toFixed(1)}%</td>
        <td>${parseFloat(r.energy || 0).toExponential(3)}</td>
        <td style="color:var(--accent-green)">${parseFloat(r.co2 || 0).toFixed(6)}</td>
        <td>${parseFloat(r.carbonIntensity || 0).toFixed(0)}</td>
        <td>${ratingMap.co2(r.co2 || 0)}</td>
      </tr>
    `).join('');

    setHTML('dataset-tbody', rows || '<tr><td colspan="9" style="color:var(--text-muted);padding:20px;text-align:center">No records yet. Run some code!</td></tr>');

  } catch (err) {
    console.error('Dataset load error:', err);
    setHTML('dataset-tbody', `<tr><td colspan="9" style="color:var(--accent-red);padding:20px">Backend offline: ${err.message}</td></tr>`);
  }
}

async function loadFooterCount() {
  try {
    const res = await fetch(`${API_BASE}/dataset/stats`);
    const stats = await res.json();
    setText('footer-count', stats.count || '—');
    setText('stat-count', stats.count || '0');
  } catch {}
}

// ── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Load initial footer count
  loadFooterCount();

  // Allow Tab key in code editor
  $('code-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      e.target.value = e.target.value.substring(0, start) + '    ' + e.target.value.substring(end);
      e.target.selectionStart = e.target.selectionEnd = start + 4;
    }
  });

  // Ctrl+Enter to run
  $('code-input')?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      executeCode();
    }
  });

  // Refresh header status every 30s
  setInterval(checkHealth, 30000);
});