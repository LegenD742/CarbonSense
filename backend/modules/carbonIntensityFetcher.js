/**
 * carbonIntensityFetcher.js
 * Fetch real-time carbon intensity from https://api.carbonintensity.org.uk/intensity
 * Falls back to local dataset if API unavailable.
 * Caches result for 5 minutes to avoid hammering the API.
 */

const fs = require('fs');
const path = require('path');

const localData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../data/carbonIntensity.json'), 'utf8')
);

// In-memory cache
let cache = {
  value: null,
  fetchedAt: 0,
  ttlMs: 5 * 60 * 1000 // 5 minutes
};

/**
 * Fetch from UK Carbon Intensity API (public, no key needed)
 * Returns intensity in gCO2eq/kWh
 */
async function fetchFromAPI() {
  try {
    // Dynamic import for node-fetch v2 compatibility
    const fetch = require('node-fetch');
    const response = await fetch('https://api.carbonintensity.org.uk/intensity', {
      timeout: 4000,
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const data = await response.json();
    const actual = data?.data?.[0]?.intensity?.actual;
    const forecast = data?.data?.[0]?.intensity?.forecast;
    const intensity = actual || forecast;

    if (typeof intensity !== 'number') throw new Error('Invalid API response structure');

    console.log(`[CarbonAPI] Live UK intensity: ${intensity} gCO₂/kWh`);
    return {
      intensity,
      source: 'live_api',
      country: 'United Kingdom (live)',
      grid: 'mixed_renewable'
    };
  } catch (err) {
    console.warn('[CarbonAPI] Fetch failed, using fallback:', err.message);
    return null;
  }
}

/**
 * Get carbon intensity — tries API first, falls back to local dataset
 * @param {string} countryCode - ISO country code (default: 'GLOBAL')
 * @param {boolean} forceLocal - Skip API call
 */
async function getCarbonIntensity(countryCode = 'GLOBAL', forceLocal = false) {
  const now = Date.now();

  // Return cached value if fresh
  if (cache.value && (now - cache.fetchedAt) < cache.ttlMs) {
    return { ...cache.value, cached: true };
  }

  // Try live API for UK data (only API available without key)
  if (!forceLocal && (countryCode === 'GB' || countryCode === 'GLOBAL')) {
    const liveData = await fetchFromAPI();
    if (liveData) {
      cache = { value: liveData, fetchedAt: now, ttlMs: cache.ttlMs };
      return { ...liveData, cached: false };
    }
  }

  // Fallback to local dataset
  const code = countryCode.toUpperCase();
  const entry = localData.countries[code] || localData.countries['GLOBAL'];

  const result = {
    intensity: entry.intensity,
    source: 'local_dataset',
    country: entry.name,
    grid: entry.grid,
    cached: false
  };

  cache = { value: result, fetchedAt: now, ttlMs: cache.ttlMs };
  return result;
}

/**
 * Get all available countries from local dataset
 */
function getAllCountries() {
  return Object.entries(localData.countries).map(([code, data]) => ({
    code,
    name: data.name,
    intensity: data.intensity,
    grid: data.grid
  }));
}

module.exports = { getCarbonIntensity, getAllCountries };