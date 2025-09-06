import importlib
import smtplib
import logging
import datetime
import subprocess
import json
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Load environment variables from .env file if it exists
def load_env_file():
    """Load environment variables from .env file"""
    env_file = ".env"
    if os.path.exists(env_file):
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    # Remove quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    os.environ[key] = value

load_env_file()

# ---------- CONFIG ----------
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
EMAIL_USER = os.getenv("EMAIL_USER", "muhammed.r.fadl@gmail.com")
EMAIL_PASS = os.getenv("EMAIL_PASS", "")  # Use Gmail App Password - set via environment variable
ALERT_TO = os.getenv("ALERT_TO", "midomoha52@yahoo.com")

# Logging configuration
LOG_FILE = "./logs/docker-health-monitor.log"  # Local log file
LOG_LINES_TO_EXTRACT = 100  # Number of recent log lines to include in email

# Create logs directory if it doesn't exist
import os
os.makedirs("./logs", exist_ok=True)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)

# ---------- FUNCTIONS ----------
def get_container_logs(container_name, lines=100):
    """Extract recent logs from a Docker container"""
    try:
        cmd = ["docker", "logs", "--tail", str(lines), container_name]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            return result.stdout + result.stderr
        else:
            return f"Error getting logs: {result.stderr}"
    except subprocess.TimeoutExpired:
        return "Error: Timeout while getting container logs"
    except Exception as e:
        return f"Error getting logs: {str(e)}"

def get_container_inspect(container_name):
    """Get detailed container information"""
    try:
        cmd = ["docker", "inspect", container_name]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            return json.loads(result.stdout)[0]
        else:
            return None
    except Exception as e:
        logging.error(f"Error inspecting container {container_name}: {str(e)}")
        return None

def send_alert(container_name, status, logs=None, container_info=None):
    """Send email alert with container logs and status"""
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    subject = f"⚠️ Docker Health Alert: {container_name} is {status} - {timestamp}"
    
    # Create multipart message
    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = EMAIL_USER
    msg["To"] = ALERT_TO

    # Build email body
    body_parts = [
        f"🐳 Container Health Alert",
        f"=" * 50,
        f"Container Name: {container_name}",
        f"Status: {status}",
        f"Timestamp: {timestamp}",
        f"=" * 50,
    ]

    # Add container info if available
    if container_info:
        state = container_info.get("State", {})
        config = container_info.get("Config", {})
        
        body_parts.extend([
            f"",
            f"📊 Container Details:",
            f"- Image: {config.get('Image', 'N/A')}",
            f"- Started: {state.get('StartedAt', 'N/A')}",
            f"- Status: {state.get('Status', 'N/A')}",
            f"- Restart Count: {state.get('RestartCount', 0)}",
            f"- Exit Code: {state.get('ExitCode', 'N/A')}",
        ])
        
        if state.get("Health"):
            health = state["Health"]
            body_parts.extend([
                f"",
                f"🏥 Health Check Details:",
                f"- Status: {health.get('Status', 'N/A')}",
                f"- Failing Streak: {health.get('FailingStreak', 0)}",
                f"- Last Check: {health.get('Log', [{}])[-1].get('Start', 'N/A') if health.get('Log') else 'N/A'}",
            ])

    # Add logs if available
    if logs:
        body_parts.extend([
            f"",
            f"📝 Recent Container Logs (last {LOG_LINES_TO_EXTRACT} lines):",
            f"=" * 50,
            logs,
            f"=" * 50,
        ])

    body_parts.extend([
        f"",
        f"🔧 Recommended Actions:",
        f"1. Check container logs: docker logs {container_name}",
        f"2. Restart container: docker restart {container_name}",
        f"3. Check container resources: docker stats {container_name}",
        f"4. Inspect container: docker inspect {container_name}",
        f"",
        f"This alert was generated by the Docker Health Monitor cron job.",
    ])

    body = "\n".join(body_parts)
    msg.attach(MIMEText(body, "plain"))

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(EMAIL_USER, EMAIL_PASS)
            server.send_message(msg)
        
        logging.info(f"✅ Alert sent for {container_name}: {status}")
        print(f"✅ Alert sent for {container_name}: {status}")
    except Exception as e:
        if not EMAIL_PASS:
            logging.error(f"❌ Email not configured. Set EMAIL_PASS environment variable.")
            print(f"❌ Email not configured. Set EMAIL_PASS environment variable.")
        else:
            logging.error(f"❌ Failed to send alert for {container_name}: {str(e)}")
            print(f"❌ Failed to send alert for {container_name}: {str(e)}")

def check_docker_health():
    """Check health of all running Docker containers"""
    logging.info("Starting Docker health check...")
    
    try:
        docker = importlib.import_module("docker")
    except ModuleNotFoundError:
        error_msg = "The 'docker' Python package is not installed. Install it with: pip install docker"
        logging.error(error_msg)
        print(error_msg)
        return

    try:
        client = docker.from_env()
        containers = client.containers.list(all=True)  # Include stopped containers
        
        if not containers:
            logging.info("No containers found")
            print("No containers found")
            return
            
        healthy_count = 0
        unhealthy_count = 0
        
        for container in containers:
            container_name = container.name
            container_status = container.status
            
            # Get detailed container info
            container_info = get_container_inspect(container_name)
            
            # Check if container is running
            if container_status != "running":
                logging.warning(f"🔴 {container_name}: Container is {container_status}")
                print(f"🔴 {container_name}: Container is {container_status}")
                
                # Get logs for stopped/failed containers
                logs = get_container_logs(container_name, LOG_LINES_TO_EXTRACT)
                send_alert(container_name, f"container {container_status}", logs, container_info)
                unhealthy_count += 1
                continue
            
            # Check health status for running containers
            health = container.attrs.get("State", {}).get("Health", {}).get("Status")
            
            if health:
                if health == "healthy":
                    logging.info(f"✅ {container_name}: {health}")
                    print(f"✅ {container_name}: {health}")
                    healthy_count += 1
                else:
                    logging.warning(f"🔴 {container_name}: {health}")
                    print(f"🔴 {container_name}: {health}")
                    
                    # Get logs for unhealthy containers
                    logs = get_container_logs(container_name, LOG_LINES_TO_EXTRACT)
                    send_alert(container_name, health, logs, container_info)
                    unhealthy_count += 1
            else:
                # No health check configured, just verify it's running
                logging.info(f"ℹ️  {container_name}: Running (no healthcheck configured)")
                print(f"ℹ️  {container_name}: Running (no healthcheck configured)")
                healthy_count += 1
        
        # Summary
        total_containers = len(containers)
        logging.info(f"Health check complete: {healthy_count} healthy, {unhealthy_count} unhealthy, {total_containers} total")
        print(f"Health check complete: {healthy_count} healthy, {unhealthy_count} unhealthy, {total_containers} total")
        
        # Send summary email if there are issues
        if unhealthy_count > 0:
            summary_msg = f"Docker Health Summary: {unhealthy_count} containers need attention out of {total_containers} total"
            logging.warning(summary_msg)
            
    except Exception as e:
        error_msg = f"Error during Docker health check: {str(e)}"
        logging.error(error_msg)
        print(f"❌ {error_msg}")
        
        # Send alert about monitoring failure
        try:
            send_alert("docker-monitor", f"monitoring failed: {str(e)}")
        except Exception as email_error:
            logging.error(f"Failed to send monitoring failure alert: {str(email_error)}")

def test_email_configuration():
    """Test email configuration by sending a test message"""
    print(f"📧 Using email configuration:")
    print(f"   SMTP Server: {SMTP_SERVER}:{SMTP_PORT}")
    print(f"   From: {EMAIL_USER}")
    print(f"   To: {ALERT_TO}")
    print(f"   Password: {'*' * len(EMAIL_PASS) if EMAIL_PASS else 'NOT SET'}")
    print()
    
    if not EMAIL_PASS:
        print("❌ EMAIL_PASS environment variable not set!")
        print("📧 To fix email configuration:")
        print("   1. Go to Gmail > Manage Account > Security > 2-Step Verification")
        print("   2. Generate an App Password for 'Mail'")
        print("   3. Set environment variable: export EMAIL_PASS='your-app-password'")
        print("   4. Or create a .env file with EMAIL_PASS=your-app-password")
        logging.error("EMAIL_PASS environment variable not set")
        return False
    
    if len(EMAIL_PASS) != 16:
        print("⚠️  Warning: Gmail App Passwords are typically 16 characters long")
        print("   Your password length:", len(EMAIL_PASS))
        print("   Make sure you're using an App Password, not your regular Gmail password")
        print()
    
    try:
        test_msg = MIMEText("This is a test message from Docker Health Monitor. If you receive this, email configuration is working correctly.")
        test_msg["Subject"] = "🧪 Docker Health Monitor - Test Email"
        test_msg["From"] = EMAIL_USER
        test_msg["To"] = ALERT_TO

        print("🔌 Connecting to SMTP server...")
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            print("🔐 Starting TLS encryption...")
            server.starttls()
            print("🔑 Authenticating...")
            server.login(EMAIL_USER, EMAIL_PASS)
            print("📤 Sending test email...")
            server.send_message(test_msg)
        
        print("✅ Test email sent successfully!")
        logging.info("Test email sent successfully")
        return True
    except Exception as e:
        print(f"❌ Test email failed: {str(e)}")
        print("📧 Common fixes:")
        print("   - Use Gmail App Password instead of regular password")
        print("   - Enable 2-Factor Authentication on Gmail")
        print("   - Check EMAIL_USER and EMAIL_PASS environment variables")
        print("   - Remove quotes from .env file values if present")
        print("   - Verify the App Password is exactly 16 characters")
        logging.error(f"Test email failed: {str(e)}")
        return False

# ---------- MAIN ----------
if __name__ == "__main__":
    import sys
    
    # Parse command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--test-email":
            print("Testing email configuration...")
            test_email_configuration()
            sys.exit(0)
        elif sys.argv[1] == "--help":
            print("Docker Health Monitor")
            print("Usage:")
            print("  python corn.py                 - Run health check")
            print("  python corn.py --test-email    - Test email configuration")
            print("  python corn.py --help          - Show this help")
            sys.exit(0)
    
    # Run the main health check
    print(f"🐳 Starting Docker Health Monitor at {datetime.datetime.now()}")
    check_docker_health()
    print(f"🏁 Docker Health Monitor completed at {datetime.datetime.now()}")
