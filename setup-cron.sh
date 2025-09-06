#!/bin/bash
# Example cron job setup for Docker Health Monitor
# 
# This file shows different ways to schedule the Docker health monitor
#
# To install:
# 1. Make this script executable: chmod +x setup-cron.sh
# 2. Run it: ./setup-cron.sh
# 3. Or manually add one of the entries below to your crontab (crontab -e)

echo "🕐 Setting up Docker Health Monitor cron job..."

# Get the absolute path to the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/corn.py"

echo "📍 Script location: $SCRIPT_PATH"

# Check if script exists
if [[ ! -f "$SCRIPT_PATH" ]]; then
    echo "❌ Script not found at $SCRIPT_PATH"
    exit 1
fi

# Create logs directory
mkdir -p "$SCRIPT_DIR/logs"

echo ""
echo "📋 Choose a schedule and add to crontab (crontab -e):"
echo ""

echo "# Every 5 minutes (frequent monitoring):"
echo "*/5 * * * * cd $SCRIPT_DIR && python3 corn.py >> logs/cron.log 2>&1"
echo ""

echo "# Every 15 minutes (recommended):"
echo "*/15 * * * * cd $SCRIPT_DIR && python3 corn.py >> logs/cron.log 2>&1"
echo ""

echo "# Every 30 minutes:"
echo "*/30 * * * * cd $SCRIPT_DIR && python3 corn.py >> logs/cron.log 2>&1"
echo ""

echo "# Every hour:"
echo "0 * * * * cd $SCRIPT_DIR && python3 corn.py >> logs/cron.log 2>&1"
echo ""

echo "# Every 6 hours:"
echo "0 */6 * * * cd $SCRIPT_DIR && python3 corn.py >> logs/cron.log 2>&1"
echo ""

# Ask user if they want to install automatically
read -p "Do you want to install the 15-minute cron job automatically? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Add to crontab
    (crontab -l 2>/dev/null; echo "*/15 * * * * cd $SCRIPT_DIR && python3 corn.py >> logs/cron.log 2>&1") | crontab -
    echo "✅ Cron job installed! Monitor will run every 15 minutes."
    echo "📝 View logs: tail -f $SCRIPT_DIR/logs/cron.log"
    echo "🔍 Check cron jobs: crontab -l"
else
    echo "ℹ️  Manual installation required. Copy one of the lines above to your crontab."
fi

echo ""
echo "🔧 Next steps:"
echo "1. Configure email settings in .env file (copy from .env.example)"
echo "2. Test email: python3 corn.py --test-email"
echo "3. Test monitoring: python3 corn.py"
echo "4. Check cron logs: tail -f logs/cron.log"
