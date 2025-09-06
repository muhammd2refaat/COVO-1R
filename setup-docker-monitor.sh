#!/bin/bash

# Docker Health Monitor Setup Script
# This script helps set up the Docker health monitoring cron job

set -e

echo "🐳 Docker Health Monitor Setup"
echo "==============================="

# Check if running as root (needed for some operations)
if [[ $EUID -eq 0 ]]; then
    echo "⚠️  Running as root. This is fine for server setup."
else
    echo "ℹ️  Running as non-root user. Some operations may require sudo."
fi

# Install Python dependencies
echo ""
echo "📦 Installing Python dependencies..."
pip3 install docker smtplib-ssl || {
    echo "❌ Failed to install dependencies. Trying with --user flag..."
    pip3 install --user docker smtplib-ssl
}

# Check if Docker is accessible
echo ""
echo "🔍 Checking Docker access..."
if docker ps >/dev/null 2>&1; then
    echo "✅ Docker is accessible"
else
    echo "❌ Docker is not accessible. You may need to:"
    echo "   - Add your user to the docker group: sudo usermod -aG docker \$USER"
    echo "   - Or run the script with sudo"
    exit 1
fi

# Test the Python script
echo ""
echo "🧪 Testing the Docker monitor script..."
python3 corn.py --test-email

# Get the absolute path to corn.py
SCRIPT_PATH=$(realpath corn.py)
echo ""
echo "📍 Script location: $SCRIPT_PATH"

# Create log directory
LOG_DIR="/var/log"
if [[ ! -w "$LOG_DIR" ]]; then
    echo "⚠️  Cannot write to $LOG_DIR. Creating local log directory..."
    LOG_DIR="./logs"
    mkdir -p "$LOG_DIR"
    
    # Update the script to use local log directory
    sed -i "s|LOG_FILE = \"/var/log/docker-health-monitor.log\"|LOG_FILE = \"$LOG_DIR/docker-health-monitor.log\"|" corn.py
fi

echo "📝 Log file will be: $LOG_DIR/docker-health-monitor.log"

# Suggest cron job setup
echo ""
echo "⏰ Cron Job Setup Instructions:"
echo "==============================="
echo "1. Open crontab editor:"
echo "   crontab -e"
echo ""
echo "2. Add one of these lines (choose frequency):"
echo ""
echo "   # Every 5 minutes:"
echo "   */5 * * * * cd $(dirname $SCRIPT_PATH) && python3 $SCRIPT_PATH >> $LOG_DIR/cron.log 2>&1"
echo ""
echo "   # Every 15 minutes:"
echo "   */15 * * * * cd $(dirname $SCRIPT_PATH) && python3 $SCRIPT_PATH >> $LOG_DIR/cron.log 2>&1"
echo ""
echo "   # Every hour:"
echo "   0 * * * * cd $(dirname $SCRIPT_PATH) && python3 $SCRIPT_PATH >> $LOG_DIR/cron.log 2>&1"
echo ""
echo "   # Every 6 hours:"
echo "   0 */6 * * * cd $(dirname $SCRIPT_PATH) && python3 $SCRIPT_PATH >> $LOG_DIR/cron.log 2>&1"
echo ""
echo "3. Save and exit the editor"
echo ""
echo "4. Verify cron job is installed:"
echo "   crontab -l"
echo ""

# Create a systemd service alternative
echo "🔄 Alternative: Systemd Service Setup:"
echo "====================================="
echo "If you prefer systemd over cron, create these files:"
echo ""

cat > docker-health-monitor.service << EOF
[Unit]
Description=Docker Health Monitor
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 $SCRIPT_PATH
WorkingDirectory=$(dirname $SCRIPT_PATH)
User=$(whoami)
Group=$(id -gn)

[Install]
WantedBy=multi-user.target
EOF

cat > docker-health-monitor.timer << EOF
[Unit]
Description=Run Docker Health Monitor every 15 minutes
Requires=docker-health-monitor.service

[Timer]
OnCalendar=*:0/15
Persistent=true

[Install]
WantedBy=timers.target
EOF

echo "Created systemd service files:"
echo "- docker-health-monitor.service"
echo "- docker-health-monitor.timer"
echo ""
echo "To install them:"
echo "sudo cp docker-health-monitor.* /etc/systemd/system/"
echo "sudo systemctl daemon-reload"
echo "sudo systemctl enable docker-health-monitor.timer"
echo "sudo systemctl start docker-health-monitor.timer"
echo ""

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update email credentials in corn.py if needed"
echo "2. Choose and set up either cron job or systemd timer"
echo "3. Test with: python3 corn.py"
echo "4. Monitor logs at: $LOG_DIR/docker-health-monitor.log"
