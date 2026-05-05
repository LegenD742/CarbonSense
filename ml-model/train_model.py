#!/usr/bin/env python3
"""
train_model.py — Module 5: Machine Learning CO₂ Predictor
==========================================================
Trains a Random Forest Regressor on carbon_dataset.csv to
predict CO₂ emissions from computing activities.

Features:
  - executionTime    (float, seconds)
  - cpuUsage         (float, 0-100%)
  - language         (encoded: python=0, cpp=1, none=2)
  - activity         (encoded: coding=0, gaming=1, ml_training=2, ...)
  - carbonIntensity  (float, gCO₂eq/kWh)

Target:
  - co2              (float, grams)

Usage:
  pip install pandas scikit-learn joblib
  python3 train_model.py
  python3 train_model.py --predict --exec-time 5.2 --cpu 45 --lang python --activity coding --intensity 708
"""

import argparse
import json
import os
import sys
from pathlib import Path

import pandas as pd
import numpy as np

from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_absolute_error, r2_score, mean_squared_error
from sklearn.preprocessing import LabelEncoder

try:
    import joblib
    HAS_JOBLIB = True
except ImportError:
    HAS_JOBLIB = False
    print("[WARN] joblib not installed. Model will not be saved. Run: pip install joblib")

# ── Paths ────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR.parent / "data"
DATASET_PATH = DATA_DIR / "carbon_dataset.csv"
MODEL_PATH = BASE_DIR / "co2_model.pkl"
ENCODERS_PATH = BASE_DIR / "label_encoders.json"

# ── Label Maps ───────────────────────────────────────────────────
LANGUAGE_MAP = {
    "python": 0, "cpp": 1, "c++": 1,
    "javascript": 2, "java": 3, "none": 4, "other": 5
}

ACTIVITY_MAP = {
    "coding": 0, "gaming": 1, "ml_training": 2,
    "browsing": 3, "video": 4, "system_idle": 5, "other": 6
}

def encode_language(lang):
    return LANGUAGE_MAP.get(str(lang).lower(), 5)

def encode_activity(act):
    return ACTIVITY_MAP.get(str(act).lower(), 6)

# ── Data Loading & Preprocessing ────────────────────────────────
def load_dataset(path=DATASET_PATH):
    print(f"\n[Data] Loading dataset: {path}")

    if not path.exists():
        print(f"[ERROR] Dataset not found at {path}")
        sys.exit(1)

    df = pd.read_csv(path)
    print(f"[Data] Loaded {len(df)} records")
    print(f"[Data] Columns: {list(df.columns)}")
    print(f"[Data] Sample:\n{df.head(3).to_string()}\n")

    return df

def preprocess(df):
    """Clean and encode features"""
    df = df.copy()

    # Drop rows with missing critical values
    required = ['executionTime', 'cpuUsage', 'energy', 'co2', 'carbonIntensity']
    df.dropna(subset=required, inplace=True)

    # Convert to numeric
    for col in required:
        df[col] = pd.to_numeric(df[col], errors='coerce')
    df.dropna(subset=required, inplace=True)

    # Remove obvious outliers (execution time > 1 hour, CO₂ < 0)
    df = df[df['executionTime'] <= 86_400]
    df = df[df['co2'] >= 0]
    df = df[df['cpuUsage'] >= 0]
    df = df[df['cpuUsage'] <= 100]

    # Encode categorical features
    df['language_enc'] = df['language'].apply(encode_language)
    df['activity_enc'] = df['activity'].apply(encode_activity)

    print(f"[Preprocess] Clean records: {len(df)}")
    print(f"[Preprocess] CO₂ range: {df['co2'].min():.6f} — {df['co2'].max():.4f} grams")
    print(f"[Preprocess] Activities: {df['activity'].value_counts().to_dict()}")
    print(f"[Preprocess] Languages:  {df['language'].value_counts().to_dict()}\n")

    return df

# ── Feature Engineering ──────────────────────────────────────────
FEATURES = [
    'executionTime',
    'cpuUsage',
    'language_enc',
    'activity_enc',
    'carbonIntensity'
]
TARGET = 'co2'

def build_features(df):
    X = df[FEATURES].copy()
    y = df[TARGET].copy()

    # Log transform for better distribution (CO₂ is right-skewed)
    # We predict log(co2+epsilon) to handle zero values
    y_log = np.log1p(y)

    return X, y, y_log

# ── Training ─────────────────────────────────────────────────────
def train_model(X, y_log):
    print("[Train] Splitting data (80/20)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_log, test_size=0.2, random_state=42
    )

    print(f"[Train] Training: {len(X_train)} | Test: {len(X_test)}")

    # Random Forest Regressor
    model = RandomForestRegressor(
        n_estimators=150,
        max_depth=12,
        min_samples_leaf=2,
        n_jobs=-1,
        random_state=42
    )

    print("[Train] Fitting Random Forest Regressor...")
    model.fit(X_train, y_train)

    # Evaluate on test set (inverse log transform)
    y_pred_log = model.predict(X_test)
    y_pred = np.expm1(y_pred_log)
    y_true = np.expm1(y_test)

    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)

    print("\n" + "─" * 50)
    print("  MODEL EVALUATION (Test Set)")
    print("─" * 50)
    print(f"  MAE:  {mae:.6f} g CO₂")
    print(f"  RMSE: {rmse:.6f} g CO₂")
    print(f"  R²:   {r2:.4f}")
    print("─" * 50)

    # Feature importance
    importances = dict(zip(FEATURES, model.feature_importances_))
    print("\n  FEATURE IMPORTANCES:")
    for feat, imp in sorted(importances.items(), key=lambda x: -x[1]):
        bar = "█" * int(imp * 40)
        print(f"  {feat:<20} {bar} {imp:.4f}")
    print()

    return model, X_test, y_true, y_pred

# ── Save Model ────────────────────────────────────────────────────
def save_model(model):
    if not HAS_JOBLIB:
        print("[Save] Skipping model save (joblib not installed)")
        return

    joblib.dump(model, MODEL_PATH)
    print(f"[Save] Model saved to: {MODEL_PATH}")

    # Save encoding maps
    with open(ENCODERS_PATH, 'w') as f:
        json.dump({
            "language_map": LANGUAGE_MAP,
            "activity_map": ACTIVITY_MAP,
            "features": FEATURES
        }, f, indent=2)
    print(f"[Save] Encoders saved to: {ENCODERS_PATH}")

# ── Load & Predict ────────────────────────────────────────────────
def load_model_and_predict(exec_time, cpu_usage, language, activity, carbon_intensity):
    if not HAS_JOBLIB or not MODEL_PATH.exists():
        print("[Predict] Model file not found. Train first.")
        return None

    model = joblib.load(MODEL_PATH)
    print(f"[Predict] Model loaded from: {MODEL_PATH}")

    X = pd.DataFrame([{
        'executionTime':  float(exec_time),
        'cpuUsage':       float(cpu_usage),
        'language_enc':   encode_language(language),
        'activity_enc':   encode_activity(activity),
        'carbonIntensity': float(carbon_intensity)
    }])

    y_pred_log = model.predict(X)[0]
    co2_predicted = float(np.expm1(y_pred_log))

    print("\n" + "═" * 50)
    print("  ML PREDICTION")
    print("═" * 50)
    print(f"  Execution Time:    {exec_time}s")
    print(f"  CPU Usage:         {cpu_usage}%")
    print(f"  Language:          {language}")
    print(f"  Activity:          {activity}")
    print(f"  Carbon Intensity:  {carbon_intensity} gCO₂/kWh")
    print("─" * 50)
    print(f"  Predicted CO₂:     {co2_predicted:.6f} grams")
    print(f"  In milligrams:     {co2_predicted * 1000:.4f} mg")

    # Rating
    if co2_predicted < 0.01:   rating = "🌿 Minimal"
    elif co2_predicted < 0.1:  rating = "✅ Low"
    elif co2_predicted < 1.0:  rating = "⚠️  Medium"
    elif co2_predicted < 10.0: rating = "🔥 High"
    else:                      rating = "💀 Critical"
    print(f"  CO₂ Rating:        {rating}")
    print("═" * 50 + "\n")

    return co2_predicted

# ── Sample Predictions ────────────────────────────────────────────
def show_sample_predictions(model):
    print("\n" + "═" * 60)
    print("  SAMPLE PREDICTIONS")
    print("═" * 60)

    samples = [
        (0.5,    35,  "python",  "coding",      708,   "Quick Python script (India)"),
        (0.1,    65,  "cpp",     "coding",      369,   "Fast C++ binary (USA)"),
        (120,    91,  "python",  "ml_training", 708,   "2min ML training (India)"),
        (3600,   83,  "none",    "gaming",      56,    "1hr gaming (France)"),
        (5,      40,  "python",  "coding",      233,   "5s script (UK)"),
        (300,    92,  "python",  "ml_training", 26,    "5min ML training (Norway)"),
    ]

    print(f"  {'Description':<40} {'Exec(s)':>8} {'CPU%':>6} {'CO₂(g)':>12} {'Rating'}")
    print("  " + "─" * 80)

    for exec_t, cpu, lang, act, ci, desc in samples:
        X = pd.DataFrame([{
            'executionTime':  exec_t,
            'cpuUsage':       cpu,
            'language_enc':   encode_language(lang),
            'activity_enc':   encode_activity(act),
            'carbonIntensity': ci
        }])
        pred_log = model.predict(X)[0]
        co2 = float(np.expm1(pred_log))

        if co2 < 0.01:   r = "🌿 Minimal"
        elif co2 < 0.1:  r = "✅ Low"
        elif co2 < 1.0:  r = "⚠️  Medium"
        elif co2 < 10:   r = "🔥 High"
        else:            r = "💀 Critical"

        print(f"  {desc:<40} {exec_t:>8.1f} {cpu:>6.0f} {co2:>12.6f} {r}")

    print()

# ── Main ──────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="CO₂ Prediction ML Model")
    parser.add_argument("--predict", action="store_true", help="Run prediction only")
    parser.add_argument("--exec-time",   type=float, default=5.0)
    parser.add_argument("--cpu",         type=float, default=45.0)
    parser.add_argument("--lang",        default="python")
    parser.add_argument("--activity",    default="coding")
    parser.add_argument("--intensity",   type=float, default=708.0)
    args = parser.parse_args()

    if args.predict:
        load_model_and_predict(
            args.exec_time, args.cpu, args.lang,
            args.activity, args.intensity
        )
        return

    # Full train pipeline
    print("\n" + "═" * 60)
    print("  🌱  CO₂ PREDICTION MODEL — TRAINING PIPELINE")
    print("═" * 60)

    df = load_dataset()
    df = preprocess(df)

    if len(df) < 10:
        print(f"[ERROR] Need at least 10 records to train. Have {len(df)}.")
        print("[INFO]  Run the app and execute code to generate more data.")
        sys.exit(1)

    X, y, y_log = build_features(df)
    model, X_test, y_true, y_pred = train_model(X, y_log)
    save_model(model)
    show_sample_predictions(model)

    print("[Done] Training complete!")

if __name__ == "__main__":
    main()