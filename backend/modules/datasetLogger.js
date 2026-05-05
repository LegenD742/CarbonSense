/**
 * datasetLogger.js
 * Module 4: Append execution results to CSV dataset for ML training
 * Fields: timestamp, activity, language, executionTime, cpuUsage,
 *         energy, co2, carbonIntensity
 */

const fs = require('fs');
const path = require('path');

const DATASET_PATH = path.join(__dirname, '../../data/carbon_dataset.csv');

const CSV_HEADER = 'timestamp,activity,language,executionTime,cpuUsage,energy,co2,carbonIntensity\n';

/**
 * Ensure CSV file exists with header
 */
function ensureDataset() {
  if (!fs.existsSync(DATASET_PATH)) {
    fs.writeFileSync(DATASET_PATH, CSV_HEADER, 'utf8');
    console.log('[Logger] Dataset created:', DATASET_PATH);
  }
}

/**
 * Append a record to the CSV dataset
 * @param {object} record - Data record to log
 */
function logToDataset(record) {
  ensureDataset();

  const {
    activity = 'coding',
    language = 'python',
    executionTime = 0,
    cpuUsage = 0,
    energy = 0,
    co2 = 0,
    carbonIntensity = 475
  } = record;

  const timestamp = new Date().toISOString();

  // Build CSV row — sanitize strings to prevent injection
  const sanitize = (val) => String(val).replace(/,/g, ';').replace(/\n/g, '');

  const row = [
    timestamp,
    sanitize(activity),
    sanitize(language),
    parseFloat(executionTime).toFixed(6),
    parseFloat(cpuUsage).toFixed(2),
    parseFloat(energy).toFixed(8),
    parseFloat(co2).toFixed(6),
    parseFloat(carbonIntensity).toFixed(1)
  ].join(',') + '\n';

  fs.appendFileSync(DATASET_PATH, row, 'utf8');

  console.log(`[Logger] Logged: ${activity}/${language} | CO₂=${co2.toFixed(4)}g`);
  return { logged: true, timestamp, path: DATASET_PATH };
}

/**
 * Read all records from dataset (for display/ML)
 */
function readDataset() {
  ensureDataset();
  const raw = fs.readFileSync(DATASET_PATH, 'utf8');
  const lines = raw.trim().split('\n');
  const headers = lines[0].split(',');

  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = values[i]?.trim(); });
    return obj;
  }).filter(row => row.timestamp); // skip empty rows
}

/**
 * Get dataset stats
 */
function getDatasetStats() {
  const records = readDataset();
  if (records.length === 0) return { count: 0 };

  const co2Values = records.map(r => parseFloat(r.co2) || 0);
  const totalCO2 = co2Values.reduce((a, b) => a + b, 0);

  const activities = {};
  records.forEach(r => {
    activities[r.activity] = (activities[r.activity] || 0) + 1;
  });

  return {
    count: records.length,
    totalCO2Grams: parseFloat(totalCO2.toFixed(4)),
    avgCO2Grams: parseFloat((totalCO2 / records.length).toFixed(6)),
    activities,
    latestTimestamp: records[records.length - 1]?.timestamp
  };
}

module.exports = { logToDataset, readDataset, getDatasetStats };