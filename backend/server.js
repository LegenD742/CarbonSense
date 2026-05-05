
const express = require('express');
const cors = require('cors');
const path = require('path');

const { executeCode }           = require('./modules/codeExecutor');
const { calculateEnergyAndCO2, getCarbonIntensity: getLocalIntensity, rateCO2 } = require('./modules/energyCalculator');
const { getCarbonIntensity, getAllCountries } = require('./modules/carbonIntensityFetcher');
const { logToDataset, readDataset, getDatasetStats } = require('./modules/datasetLogger');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Request logger ──────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Health check ────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ────────────────────────────────────────────────────────────────
// MODULE 1: Code Carbon Analyzer
// POST /api/execute
// Body: { code, language, countryCode?, cpuProfile? }
// ────────────────────────────────────────────────────────────────
app.post('/api/execute', async (req, res) => {
  const { code, language = 'python', countryCode = 'IN', cpuProfile = 'desktop_mid' } = req.body;

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return res.status(400).json({ error: 'code is required' });
  }

  try {
    // Step 1: Execute code and measure CPU + time
    console.log(`[Execute] Running ${language} code...`);
    const execResult = await executeCode(code, language);

    // Step 2: Get carbon intensity
    const intensityData = await getCarbonIntensity(countryCode);

    // Step 3: Compute energy + CO₂
    const energy = calculateEnergyAndCO2(
      execResult.cpuUsage,
      execResult.executionTime,
      intensityData.intensity,
      {
        cpuProfile,
        ramGB: execResult.ramTotalGB || 16,
        activity: 'coding'
      }
    );

    // Step 4: Rate the CO₂ level
    const rating = rateCO2(energy.co2Grams);

    // Step 5: Log to dataset
    if (execResult.success || execResult.executionTime > 0) {
      logToDataset({
        activity: 'coding',
        language: language.toLowerCase(),
        executionTime: energy.executionTimeSec,
        cpuUsage: energy.cpuUsagePct,
        energy: energy.energyKWh,
        co2: energy.co2Grams,
        carbonIntensity: intensityData.intensity
      });
    }

    // Step 6: Build comparison insights
    const comparisons = buildComparisons(energy.co2Grams);

    res.json({
      success: true,
      execution: {
        language,
        executionTime: execResult.executionTime,
        cpuUsage: execResult.cpuUsage,
        ramUsedGB: execResult.ramUsedGB,
        ramTotalGB: execResult.ramTotalGB,
        stdout: execResult.stdout,
        stderr: execResult.stderr,
        returnCode: execResult.returnCode,
        hasPsutil: execResult.hasPsutil
      },
      energy: {
        p_cpu: energy.p_cpu,
        p_ram: energy.p_ram,
        p_disk: energy.p_disk,
        p_total: energy.p_total,
        energyKWh: energy.energyKWh,
        energyJoules: parseFloat((energy.energyKWh * 3_600_000).toFixed(4))
      },
      carbon: {
        co2Grams: energy.co2Grams,
        co2Mg: parseFloat((energy.co2Grams * 1000).toFixed(4)),
        carbonIntensity: intensityData.intensity,
        intensitySource: intensityData.source,
        country: intensityData.country
      },
      rating,
      comparisons
    });

  } catch (err) {
    console.error('[Execute] Error:', err);
    res.status(500).json({ error: err.message || 'Execution failed' });
  }
});

// ────────────────────────────────────────────────────────────────
// MODULE 3: Manual Carbon Calculator
// POST /api/calculate
// Body: { activities: { coding, gaming, ml_training, browsing }, countryCode }
// ────────────────────────────────────────────────────────────────
app.post('/api/calculate', async (req, res) => {
  const { activities = {}, countryCode = 'IN' } = req.body;

  try {
    const intensityData = await getCarbonIntensity(countryCode);
    const results = [];
    let totalEnergy = 0;
    let totalCO2 = 0;

    const activityDefs = {
      coding:       { label: 'Coding',       cpuProfile: 'desktop_mid' },
      gaming:       { label: 'Gaming',        cpuProfile: 'desktop_high' },
      ml_training:  { label: 'ML Training',   cpuProfile: 'workstation' },
      browsing:     { label: 'Browsing',       cpuProfile: 'laptop_mid' },
      video:        { label: 'Video Streaming', cpuProfile: 'laptop_mid' }
    };

    for (const [activity, hours] of Object.entries(activities)) {
      if (!hours || parseFloat(hours) <= 0) continue;

      const seconds = parseFloat(hours) * 3600;
      const def = activityDefs[activity] || { label: activity, cpuProfile: 'desktop_mid' };

      // Use moderate CPU usage for each activity type
      const cpuMap = { coding: 42, gaming: 82, ml_training: 90, browsing: 25, video: 35 };
      const cpuUsage = cpuMap[activity] || 40;

      const energy = calculateEnergyAndCO2(
        cpuUsage,
        seconds,
        intensityData.intensity,
        { cpuProfile: def.cpuProfile, activity }
      );

      results.push({
        activity,
        label: def.label,
        hours: parseFloat(hours),
        cpuUsage,
        energyKWh: energy.energyKWh,
        co2Grams: energy.co2Grams,
        rating: rateCO2(energy.co2Grams)
      });

      totalEnergy += energy.energyKWh;
      totalCO2 += energy.co2Grams;

      // Log each activity
      logToDataset({
        activity,
        language: 'none',
        executionTime: seconds,
        cpuUsage,
        energy: energy.energyKWh,
        co2: energy.co2Grams,
        carbonIntensity: intensityData.intensity
      });
    }

    const totalRating = rateCO2(totalCO2);
    const comparisons = buildComparisons(totalCO2);

    res.json({
      success: true,
      results,
      total: {
        energyKWh: parseFloat(totalEnergy.toFixed(8)),
        co2Grams: parseFloat(totalCO2.toFixed(6)),
        rating: totalRating
      },
      carbonIntensity: intensityData.intensity,
      country: intensityData.country,
      comparisons
    });

  } catch (err) {
    console.error('[Calculate] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /api/intensity?country=IN
// ────────────────────────────────────────────────────────────────
app.get('/api/intensity', async (req, res) => {
  const { country = 'IN' } = req.query;
  try {
    const data = await getCarbonIntensity(country);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────
// GET /api/countries
// ────────────────────────────────────────────────────────────────
app.get('/api/countries', (req, res) => {
  res.json(getAllCountries());
});

// ────────────────────────────────────────────────────────────────
// GET /api/dataset/stats
// ────────────────────────────────────────────────────────────────
app.get('/api/dataset/stats', (req, res) => {
  res.json(getDatasetStats());
});

// ────────────────────────────────────────────────────────────────
// GET /api/dataset?limit=50&offset=0
// ────────────────────────────────────────────────────────────────
app.get('/api/dataset', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  const records = readDataset();
  res.json({
    total: records.length,
    records: records.slice(offset, offset + limit)
  });
});

// ── Serve frontend ──────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Error handler ────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌱 Digital Carbon Tracker Backend`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log(`   Frontend: http://localhost:${PORT}\n`);
});

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Build comparison insights for CO₂ amount
 * @param {number} co2Grams
 */
function buildComparisons(co2Grams) {
  return {
    treesNeeded: parseFloat((co2Grams / 21_000).toFixed(8)),   // 21kg CO₂ per tree/year
    kmDriven:    parseFloat((co2Grams / 120).toFixed(6)),       // ~120g CO₂/km for avg car
    phoneCharges: parseFloat((co2Grams / 8.22).toFixed(4)),     // ~8.22g per phone charge
    LEDHours:    parseFloat((co2Grams / 0.2).toFixed(2)),       // 10W LED ~0.2g/h at 500g/kWh
    equivalentML: co2Grams >= 1 ? parseFloat((co2Grams / 284000).toFixed(10)) : null // GPT-3 training ~284 tonnes
  };
}