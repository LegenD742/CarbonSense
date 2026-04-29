#!/bin/bash
# setup.sh — One-shot setup for Digital Carbon Footprint Tracker
set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  CARBON.EXE — Setup Script               ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Node.js backend ────────────────────────────────────────────────
echo "→ Installing Node.js dependencies..."
cd backend
npm install --silent
cd ..
echo "  ✓ Node.js dependencies installed"

# ── Python dependencies ────────────────────────────────────────────
echo "→ Installing Python dependencies..."
pip install psutil pandas scikit-learn joblib numpy node-fetch --quiet 2>/dev/null || \
pip3 install psutil pandas scikit-learn joblib numpy --quiet 2>/dev/null || \
echo "  ⚠ pip not found. Install manually: pip install psutil pandas scikit-learn joblib"
echo "  ✓ Python dependencies installed"

# ── Verify dataset ────────────────────────────────────────────────
if [ -f "data/carbon_dataset.csv" ]; then
    COUNT=$(wc -l < data/carbon_dataset.csv)
    echo "  ✓ Dataset found: $((COUNT-1)) records"
else
    echo "  ✗ Dataset not found at data/carbon_dataset.csv"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Setup complete! Run with:               ║"
echo "║                                          ║"
echo "║  node backend/server.js                  ║"
echo "║  → http://localhost:3001                 ║"
echo "╚══════════════════════════════════════════╝"
echo ""