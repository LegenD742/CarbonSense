# 🌱 CarbonSense — Digital Carbon Footprint Tracker

> Measure, analyze, and predict the CO₂ emissions from your computing activities.

```
╔══════════════════════════════════════════════════════════╗
║  CarbonSense  v1.0.0  —  Digital Carbon Footprint Tracker║
║  [Backend: Node.js] [Monitor: Python] [ML: Random-forest]║
╚══════════════════════════════════════════════════════════╝
```

---

## ⚡ Energy Model

```
P_cpu    = P_idle + (P_max - P_idle) × (cpu_usage / 100)
P_total  = P_cpu + P_ram + P_disk
Energy   = (P_total × time_seconds) / 3,600,000    [kWh]
CO₂      = Energy × CarbonIntensity                 [grams]
```

**Hardware profiles used:**
| Profile       | P_idle | P_max |
|---------------|--------|-------|
| laptop_low    | 5W     | 25W   |
| laptop_mid    | 8W     | 45W   |
| desktop_mid   | 12W    | 65W   |
| desktop_high  | 20W    | 125W  |
| workstation   | 30W    | 150W  |

---

## 🤖 ML Model

**Algorithm:** Random Forest Regressor (150 trees, max_depth=12)

**Features:**
- `executionTime` — seconds
- `cpuUsage` — 0–100%
- `language_enc` — python=0, cpp=1, js=2, none=4
- `activity_enc` — coding=0, gaming=1, ml_training=2, browsing=3
- `carbonIntensity` — gCO₂eq/kWh

**Target:** `co2` (log-transformed for training)

**Training:**
```bash
python3 ml-model/train_model.py
```

**Sample output:**
```
──────────────────────────────────────────────────
  MODEL EVALUATION (Test Set)
──────────────────────────────────────────────────
  MAE:  0.000234 g CO₂
  RMSE: 0.001823 g CO₂
  R²:   0.9871

  FEATURE IMPORTANCES:
  executionTime        ████████████████ 0.4012
  carbonIntensity      ████████████ 0.3021
  cpuUsage             ██████ 0.1534
  activity_enc         ████ 0.0981
  language_enc         ██ 0.0452
```

---

## 🌍 Carbon Intensity by Country

| Country     | gCO₂eq/kWh | Grid Type         |
|-------------|------------|-------------------|
| 🇮🇳 India  | 708        | Coal heavy        |
| 🇺🇸 USA    | 369        | Mixed             |
| 🇬🇧 UK     | 233        | Mixed renewable   |
| 🇩🇪 Germany | 385       | Mixed             |
| 🇫🇷 France | 56         | Nuclear heavy     |
| 🇳🇴 Norway | 26         | Hydro heavy       |
| 🇦🇺 Australia | 620     | Coal heavy        |

---

## 🏷️ CO₂ Rating Scale

| Rating   | CO₂ Range         | Emoji |
|----------|-------------------|-------|
| Minimal  | < 0.01g           | 🌿    |
| Low      | 0.01g – 0.1g      | ✅    |
| Medium   | 0.1g – 1.0g       | ⚠️    |
| High     | 1.0g – 10g        | 🔥    |
| Critical | > 10g             | 💀    |

---

## 📊 Sample Outputs

### Code Analyzer

```
Code: Matrix multiplication (50×50), Python
Execution Time: 0.0845s
CPU Usage:      34.2%
Power:          CPU=22.1W  RAM=6.0W  Disk=2.0W  Total=30.1W
Energy:         7.06e-7 kWh
CO₂:            0.000500g  🌿 Minimal
Grid:           708 gCO₂/kWh (India, local dataset)
```

### System Monitor

```
[09:32:11] Sample #12
CPU:  ████████░░░░░░░░░░░░  38.4%  (24.3W)
RAM:  7.2/16.0 GB (45%)
Power: 32.3W  (CPU:24.3 + RAM:6.0 + Disk:2.0)
CO₂:  0.0037 mg/min  |  Energy: 0.5383 µWh/min
Grid: 708 gCO₂/kWh via local_dataset
Rate: ✅ Low
```

### ML Prediction

```
═══════════════════════════════════════════════
  Predicted CO₂:     0.035200 grams
  In milligrams:     35.2000 mg
  CO₂ Rating:        ⚠️ Medium
═══════════════════════════════════════════════
```

---

## 📝 License

MIT — Build responsibly, measure your impact.