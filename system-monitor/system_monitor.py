# #!/usr/bin/env python3
# """
# system_monitor.py — Module 2: Live System Monitor
# =================================================
# Real-time CPU + RAM tracking using psutil.
# Estimates power consumption and CO₂ per minute.
# Fetches live carbon intensity from API with local fallback.

# Usage:
#     python3 system_monitor.py
#     python3 system_monitor.py --country IN --interval 5 --duration 60
# """

# import time
# import json
# import os
# import sys
# import signal
# import argparse
# from datetime import datetime
# from pathlib import Path

# # ── Third-party imports with graceful fallback ──────────────────
# try:
#     import psutil
#     HAS_PSUTIL = True
# except ImportError:
#     print("[WARN] psutil not installed. Install with: pip install psutil")
#     print("[WARN] Using simulated values.")
#     HAS_PSUTIL = False

# try:
#     import urllib.request
#     HAS_URLLIB = True
# except ImportError:
#     HAS_URLLIB = False

# # ── Paths ───────────────────────────────────────────────────────
# SCRIPT_DIR = Path(__file__).parent
# DATA_DIR = SCRIPT_DIR.parent / "data"
# INTENSITY_FILE = DATA_DIR / "carbonIntensity.json"
# HARDWARE_FILE = DATA_DIR / "hardwarePower.json"
# DATASET_FILE = DATA_DIR / "carbon_dataset.csv"

# # ── Load local datasets ─────────────────────────────────────────
# def load_json(path):
#     try:
#         with open(path, 'r') as f:
#             return json.load(f)
#     except Exception as e:
#         print(f"[ERROR] Cannot load {path}: {e}")
#         return {}

# carbon_data = load_json(INTENSITY_FILE)
# hardware_data = load_json(HARDWARE_FILE)

# # ── Carbon Intensity ────────────────────────────────────────────
# def fetch_live_intensity():
#     """Fetch live UK carbon intensity from carbonintensity.org.uk"""
#     if not HAS_URLLIB:
#         return None
#     try:
#         url = "https://api.carbonintensity.org.uk/intensity"
#         req = urllib.request.Request(url, headers={"Accept": "application/json"})
#         with urllib.request.urlopen(req, timeout=4) as resp:
#             data = json.loads(resp.read())
#             actual = data["data"][0]["intensity"]["actual"]
#             forecast = data["data"][0]["intensity"]["forecast"]
#             value = actual if actual is not None else forecast
#             if isinstance(value, (int, float)):
#                 return {"intensity": value, "source": "live_api", "country": "United Kingdom"}
#     except Exception as e:
#         pass
#     return None

# def get_carbon_intensity(country_code="IN"):
#     """Get carbon intensity with API fallback"""
#     # Try live API (UK only — free, no key)
#     if country_code.upper() in ("GB", "UK"):
#         live = fetch_live_intensity()
#         if live:
#             return live

#     # Local dataset fallback
#     countries = carbon_data.get("countries", {})
#     code = country_code.upper()
#     entry = countries.get(code, countries.get("GLOBAL", {"intensity": 475, "name": "Global"}))
#     return {
#         "intensity": entry["intensity"],
#         "source": "local_dataset",
#         "country": entry["name"]
#     }

# # ── System Metrics ──────────────────────────────────────────────
# def get_cpu_usage(interval=0.5):
#     """Get CPU usage percentage"""
#     if HAS_PSUTIL:
#         return psutil.cpu_percent(interval=interval)
#     # Simulate moderate load
#     import random
#     return round(20 + random.gauss(15, 5), 1)

# def get_ram_info():
#     """Get RAM usage"""
#     if HAS_PSUTIL:
#         mem = psutil.virtual_memory()
#         return {
#             "used_gb": round(mem.used / (1024**3), 2),
#             "total_gb": round(mem.total / (1024**3), 2),
#             "percent": mem.percent
#         }
#     return {"used_gb": 6.0, "total_gb": 16.0, "percent": 37.5}

# def get_cpu_freq():
#     """Get CPU frequency"""
#     if HAS_PSUTIL:
#         try:
#             freq = psutil.cpu_freq()
#             return round(freq.current / 1000, 2) if freq else None
#         except Exception:
#             return None
#     return None

# # ── Power Calculation ────────────────────────────────────────────
# def compute_power(cpu_percent, ram_total_gb, profile="desktop_mid"):
#     """
#     Dynamic CPU power model:
#     P_cpu = P_idle + (P_max - P_idle) × cpu_fraction
#     P_total = P_cpu + P_ram + P_disk
#     """
#     profiles = hardware_data.get("cpu_profiles", {})
#     p = profiles.get(profile, profiles.get("default", {"idle_w": 10, "max_w": 65}))

#     cpu_fraction = max(0, min(100, cpu_percent)) / 100
#     p_cpu = p["idle_w"] + (p["max_w"] - p["idle_w"]) * cpu_fraction
#     p_ram = ram_total_gb * hardware_data.get("ram_per_gb_w", 0.375)
#     p_disk = hardware_data.get("disk", {}).get("ssd_w", 2.0)
#     p_total = p_cpu + p_ram + p_disk

#     return {
#         "p_cpu_w": round(p_cpu, 2),
#         "p_ram_w": round(p_ram, 2),
#         "p_disk_w": round(p_disk, 2),
#         "p_total_w": round(p_total, 2)
#     }

# def compute_co2_per_minute(power_w, carbon_intensity):
#     """Compute CO₂ in grams for 1 minute of operation"""
#     energy_kwh = (power_w * 60) / 3_600_000
#     co2_grams = energy_kwh * carbon_intensity
#     return round(co2_grams, 6), round(energy_kwh, 9)

# # ── Dataset Logging ──────────────────────────────────────────────
# def append_to_dataset(record):
#     """Append one monitoring record to CSV"""
#     header = "timestamp,activity,language,executionTime,cpuUsage,energy,co2,carbonIntensity"
#     write_header = not DATASET_FILE.exists() or DATASET_FILE.stat().st_size == 0
#     try:
#         with open(DATASET_FILE, "a") as f:
#             if write_header:
#                 f.write(header + "\n")
#             row = ",".join([
#                 record["timestamp"],
#                 record["activity"],
#                 "none",
#                 str(record["execution_time"]),
#                 str(record["cpu_usage"]),
#                 str(record["energy_kwh"]),
#                 str(record["co2_grams"]),
#                 str(record["carbon_intensity"])
#             ])
#             f.write(row + "\n")
#     except Exception as e:
#         print(f"[WARN] Could not write to dataset: {e}")

# # ── CO₂ Rating ────────────────────────────────────────────────────
# def rate_co2(co2_grams_per_minute):
#     if co2_grams_per_minute < 0.001: return "🌿 Minimal"
#     if co2_grams_per_minute < 0.01:  return "✅ Low"
#     if co2_grams_per_minute < 0.05:  return "⚠️  Medium"
#     if co2_grams_per_minute < 0.2:   return "🔥 High"
#     return "💀 Critical"

# # ── Display ───────────────────────────────────────────────────────
# def print_header():
#     print("\n" + "═" * 60)
#     print("  🌱  DIGITAL CARBON FOOTPRINT — LIVE SYSTEM MONITOR")
#     print("═" * 60)
#     print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
#     print(f"  psutil:  {'✓ Available' if HAS_PSUTIL else '✗ Not found (simulated)'}")
#     print("═" * 60 + "\n")

# def print_sample(sample_num, cpu, ram, power, co2, energy, intensity_info):
#     ts = datetime.now().strftime('%H:%M:%S')
#     bar_len = int(cpu / 5)
#     cpu_bar = "█" * bar_len + "░" * (20 - bar_len)
#     print(f"  [{ts}] Sample #{sample_num}")
#     print(f"  CPU:  {cpu_bar} {cpu:5.1f}%  ({power['p_cpu_w']:.1f}W)")
#     print(f"  RAM:  {ram['used_gb']:.1f}/{ram['total_gb']:.0f} GB ({ram['percent']:.0f}%)")
#     print(f"  Power: {power['p_total_w']:.2f}W  "
#           f"(CPU:{power['p_cpu_w']:.1f} + RAM:{power['p_ram_w']:.1f} + Disk:{power['p_disk_w']:.1f})")
#     print(f"  CO₂:  {co2*1000:.4f} mg/min  |  Energy: {energy*1e6:.4f} µWh/min")
#     print(f"  Grid: {intensity_info['intensity']} gCO₂/kWh via {intensity_info['source']}")
#     print(f"  Rate: {rate_co2(co2)}")
#     print()

# def detect_activity(cpu_percent):
#     """
#     Auto-detect likely activity based on CPU usage level.
#     Since we can't know the exact app, we infer from load.
#     """
#     if cpu_percent < 10:
#         return "idle"
#     elif cpu_percent < 25:
#         return "browsing"
#     elif cpu_percent < 45:
#         return "coding"
#     elif cpu_percent < 65:
#         return "video"
#     elif cpu_percent < 80:
#         return "gaming"
#     else:
#         return "ml_training"

# # ── Main Monitor Loop ────────────────────────────────────────────
# def run_monitor(country="IN", interval_sec=5, duration_sec=None, log_dataset=True):
#     print_header()

#     intensity_info = get_carbon_intensity(country)
#     print(f"  Country:  {intensity_info['country']}")
#     print(f"  Intensity: {intensity_info['intensity']} gCO₂eq/kWh")
#     print(f"  Source:   {intensity_info['source']}\n")
#     print("  Press Ctrl+C to stop\n")
#     print("─" * 60)

#     running = True
#     total_co2 = 0.0
#     total_energy = 0.0
#     sample_num = 0
#     start_time = time.time()

#     def handle_sigint(sig, frame):
#         nonlocal running
#         running = False

#     signal.signal(signal.SIGINT, handle_sigint)

#     while running:
#         if duration_sec and (time.time() - start_time) >= duration_sec:
#             break

#         sample_num += 1
#         cpu_pct = get_cpu_usage(interval=min(interval_sec * 0.5, 1.0))
#         ram = get_ram_info()
#         power = compute_power(cpu_pct, ram["total_gb"])
#         co2, energy = compute_co2_per_minute(power["p_total_w"], intensity_info["intensity"])

#         total_co2 += co2
#         total_energy += energy

#         print_sample(sample_num, cpu_pct, ram, power, co2, energy, intensity_info)

#         if log_dataset:
#             append_to_dataset({
#                 "timestamp": datetime.utcnow().isoformat() + "Z",
#                 "activity":  detect_activity(cpu_pct),
#                 "execution_time": interval_sec,
#                 "cpu_usage": cpu_pct,
#                 "energy_kwh": energy,
#                 "co2_grams": co2,
#                 "carbon_intensity": intensity_info["intensity"]
#             })

#         # Refresh intensity every 5 minutes
#         if sample_num % (300 // interval_sec) == 0:
#             intensity_info = get_carbon_intensity(country)

#         time.sleep(max(0, interval_sec - 1.0))

#     # Session summary
#     elapsed = time.time() - start_time
#     print("\n" + "═" * 60)
#     print("  SESSION SUMMARY")
#     print("═" * 60)
#     print(f"  Duration:     {elapsed:.0f} seconds")
#     print(f"  Samples:      {sample_num}")
#     print(f"  Total CO₂:    {total_co2 * 1000:.4f} mg")
#     print(f"  Total Energy: {total_energy * 1e6:.2f} µWh")
#     print(f"  Avg CO₂/min:  {(total_co2/elapsed*60)*1000:.4f} mg/min" if elapsed > 0 else "")
#     print("═" * 60 + "\n")

# # ── Entry Point ──────────────────────────────────────────────────
# if __name__ == "__main__":
#     parser = argparse.ArgumentParser(description="Live Carbon Footprint System Monitor")
#     parser.add_argument("--country", default="IN", help="Country code (e.g., IN, US, GB)")
#     parser.add_argument("--interval", type=int, default=5, help="Sample interval in seconds")
#     parser.add_argument("--duration", type=int, default=None, help="Auto-stop after N seconds")
#     parser.add_argument("--no-log", action="store_true", help="Do not write to dataset CSV")
#     args = parser.parse_args()

#     run_monitor(
#         country=args.country,
#         interval_sec=args.interval,
#         duration_sec=args.duration,
#         log_dataset=not args.no_log
#     )




#!/usr/bin/env python3

import time
import json
import signal
import argparse
from datetime import datetime
from pathlib import Path

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    print("[WARN] psutil not installed. Install with: pip install psutil")
    HAS_PSUTIL = False

try:
    import urllib.request
    HAS_URLLIB = True
except ImportError:
    HAS_URLLIB = False


SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"

INTENSITY_FILE = DATA_DIR / "carbonIntensity.json"
HARDWARE_FILE = DATA_DIR / "hardwarePower.json"
DATASET_FILE = DATA_DIR / "carbon_dataset.csv"


def load_json(path):
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except:
        return {}

carbon_data = load_json(INTENSITY_FILE)
hardware_data = load_json(HARDWARE_FILE)


# ── Carbon Intensity ────────────────────────────────
def fetch_live_intensity():
    try:
        url = "https://api.carbonintensity.org.uk/intensity"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read())
            val = data["data"][0]["intensity"]["actual"]
            if val is None:
                val = data["data"][0]["intensity"]["forecast"]
            return val
    except:
        return None


def get_carbon_intensity(country="IN"):
    if country.upper() in ["UK", "GB"]:
        live = fetch_live_intensity()
        if live:
            return live

    return carbon_data.get(country.upper(), 475)


# ── System Metrics ──────────────────────────────────
def get_cpu_usage():
    if HAS_PSUTIL:
        return psutil.cpu_percent(interval=0.5)
    return 20


def get_ram_info():
    if HAS_PSUTIL:
        mem = psutil.virtual_memory()
        return mem.total / (1024**3), mem.percent
    return 16, 40


# ── Activity Mapping ───────────────────────────────
def map_activity(name):

    if "chrome" in name or "edge" in name or "firefox" in name:
        return "browsing"

    elif "code" in name or "pycharm" in name:
        return "coding"

    elif "vlc" in name:
        return "video"

    elif "valorant" in name or "bfv" in name or "steam" in name or "game" in name:
        return "gaming"

    elif "python" in name or "jupyter" in name:
        return "python coding"

    else:
        return "other"


# ── Top 3 Process Detection ────────────────────────
def detect_top_processes():

    if not HAS_PSUTIL:
        return []

    # initialize CPU measurement
    for p in psutil.process_iter():
        try:
            p.cpu_percent()
        except:
            continue

    time.sleep(0.5)

    processes = []

    for proc in psutil.process_iter(['name', 'cpu_percent']):
        try:
            name = proc.info['name']
            cpu = proc.info['cpu_percent']

            if name and cpu > 0 and name.lower() not in ["system idle process", "idle"]:
                processes.append((name.lower(), cpu))

        except:
            continue

    processes.sort(key=lambda x: x[1], reverse=True)

    return processes[:3]


# ── Power Model ─────────────────────────────────────
def compute_power(cpu, ram_total):

    P_idle = hardware_data.get("cpu_idle", 12)
    P_max = hardware_data.get("cpu_max", 75)

    cpu_power = P_idle + (P_max - P_idle) * (cpu / 100)
    ram_power = ram_total * 0.3
    disk_power = 2

    return cpu_power + ram_power + disk_power


# ── CO₂ Calculation ────────────────────────────────
def compute_co2(power, intensity):

    energy_kwh = (power * 60) / 3600000
    co2 = energy_kwh * intensity

    return co2, energy_kwh


# ── Dataset Logging ─────────────────────────────────
def append_to_dataset(record):

    header = "timestamp,activity,language,executionTime,cpuUsage,energy,co2,carbonIntensity"

    write_header = not DATASET_FILE.exists()

    with open(DATASET_FILE, "a") as f:
        if write_header:
            f.write(header + "\n")

        row = ",".join([
            record["timestamp"],
            record["activity"],
            "none",
            str(record["execution_time"]),
            str(record["cpu_usage"]),
            str(record["energy"]),
            str(record["co2"]),
            str(record["intensity"])
        ])

        f.write(row + "\n")


# ── Monitor Loop ───────────────────────────────────
def run_monitor(interval=5, country="IN"):

    print("\n🌱 Live Carbon Monitor\n")

    while True:

        cpu = get_cpu_usage()
        ram_total, ram_pct = get_ram_info()

        top3 = detect_top_processes()

        intensity = get_carbon_intensity(country)

        power = compute_power(cpu, ram_total)
        co2, energy = compute_co2(power, intensity)

        print("CPU:", cpu, "%")
        print("RAM:", ram_pct, "%")

        print("\nTop 3 Processes:")
        for name, cpu_p in top3:
            activity = map_activity(name)
            print(f"  {name} → {cpu_p}% → {activity}")

        print("Power:", round(power, 2), "W")
        print("Carbon Intensity:", intensity)
        print("CO2/min:", round(co2, 6), "g")
        print("-------------------------")

        # 🔥 STORE ALL 3 AS SEPARATE ROWS
        for name, cpu_p in top3:
            activity = map_activity(name)

            append_to_dataset({
                "timestamp": datetime.utcnow().isoformat(),
                "activity": activity,
                "execution_time": interval,
                "cpu_usage": cpu,
                "energy": energy,
                "co2": co2,
                "intensity": intensity
            })

        time.sleep(interval)


# ── Main ───────────────────────────────────────────
if __name__ == "__main__":

    parser = argparse.ArgumentParser()
    parser.add_argument("--interval", type=int, default=5)
    parser.add_argument("--country", default="IN")

    args = parser.parse_args()

    run_monitor(args.interval, args.country)