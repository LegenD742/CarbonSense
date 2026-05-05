
const fs = require('fs');
const path = require('path');

// Load hardware power profiles
const hardwarePower = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../data/hardwarePower.json'), 'utf8')
);

// Load carbon intensity dataset
const carbonIntensityData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../data/carbonIntensity.json'), 'utf8')
);

/**
 * Get CPU power profile (defaults to mid-range desktop)
 */
function getCpuProfile(profileName = 'desktop_mid') {
  return hardwarePower.cpu_profiles[profileName] || hardwarePower.cpu_profiles['default'];
}

/**
 * Compute RAM power based on system RAM
 * @param {number} ramGB - System RAM in GB (default 16)
 */
function computeRamPower(ramGB = 16) {
  return ramGB * hardwarePower.ram_per_gb_w;
}

/**
 * Get disk power (default SSD)
 * @param {string} diskType - 'ssd', 'hdd', or 'nvme'
 */
function getDiskPower(diskType = 'ssd') {
  return hardwarePower.disk[`${diskType}_w`] || hardwarePower.disk.ssd_w;
}

/**
 * Main energy calculation
 * @param {number} cpuUsagePct - CPU usage 0–100
 * @param {number} executionTimeSec - Duration in seconds
 * @param {number} carbonIntensity - gCO₂eq/kWh
 * @param {object} options - Optional overrides
 */
function calculateEnergyAndCO2(cpuUsagePct, executionTimeSec, carbonIntensity, options = {}) {
  const {
    cpuProfile = 'desktop_mid',
    ramGB = 16,
    diskType = 'ssd',
    activity = 'coding'
  } = options;

  const cpuFraction = Math.max(0, Math.min(100, cpuUsagePct)) / 100;
  const profile = getCpuProfile(cpuProfile);

  // Dynamic CPU power model
  const p_cpu = profile.idle_w + (profile.max_w - profile.idle_w) * cpuFraction;

  // RAM power (constant regardless of load)
  const p_ram = computeRamPower(ramGB);

  // Disk power
  const p_disk = getDiskPower(diskType);

  // Activity overhead multiplier
  const overhead = hardwarePower.activity_overheads[activity] || 1.0;

  // Total system power in watts
  const p_total = (p_cpu * overhead) + p_ram + p_disk;

  // Energy in kWh: (watts × seconds) / 3,600,000
  const energyKWh = (p_total * executionTimeSec) / 3_600_000;

  // CO₂ in grams
  const co2Grams = energyKWh * carbonIntensity;

  return {
    p_cpu: parseFloat(p_cpu.toFixed(3)),
    p_ram: parseFloat(p_ram.toFixed(3)),
    p_disk: parseFloat(p_disk.toFixed(3)),
    p_total: parseFloat(p_total.toFixed(3)),
    energyKWh: parseFloat(energyKWh.toFixed(8)),
    co2Grams: parseFloat(co2Grams.toFixed(6)),
    carbonIntensity,
    executionTimeSec: parseFloat(executionTimeSec.toFixed(4)),
    cpuUsagePct: parseFloat(cpuUsagePct.toFixed(2))
  };
}

/**
 * Get carbon intensity from dataset for a country code
 * @param {string} countryCode - ISO 2-letter country code
 */
function getCarbonIntensity(countryCode = 'GLOBAL') {
  const code = countryCode.toUpperCase();
  const entry = carbonIntensityData.countries[code] || carbonIntensityData.countries['GLOBAL'];
  return {
    intensity: entry.intensity,
    country: entry.name,
    grid: entry.grid
  };
}

/**
 * Rate CO₂ emission level
 * @param {number} co2Grams
 */
function rateCO2(co2Grams) {
  if (co2Grams < 0.01) return { rating: 'Minimal', color: '#22c55e', emoji: '🌿' };
  if (co2Grams < 0.1)  return { rating: 'Low',     color: '#86efac', emoji: '✅' };
  if (co2Grams < 1.0)  return { rating: 'Medium',  color: '#fbbf24', emoji: '⚠️' };
  if (co2Grams < 10.0) return { rating: 'High',    color: '#f97316', emoji: '🔥' };
  return                        { rating: 'Critical', color: '#ef4444', emoji: '💀' };
}

module.exports = {
  calculateEnergyAndCO2,
  getCarbonIntensity,
  getCpuProfile,
  rateCO2
};