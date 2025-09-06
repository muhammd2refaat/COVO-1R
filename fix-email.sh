#!/bin/bash

echo "🔐 Gmail App Password Setup Guide"
echo "================================="
echo ""
echo "The email authentication is failing. Here's how to fix it:"
echo ""
echo "📱 Step 1: Enable 2-Factor Authentication"
echo "1. Go to https://myaccount.google.com/security"
echo "2. Under 'Signing in to Google', click '2-Step Verification'"
echo "3. Follow the setup process if not already enabled"
echo ""
echo "🔑 Step 2: Generate App Password"
echo "1. Go to https://myaccount.google.com/apppasswords"
echo "2. Or: Google Account > Security > 2-Step Verification > App passwords"
echo "3. Select 'Mail' as the app"
echo "4. Select 'Other (Custom name)' as device, enter 'Docker Monitor'"
echo "5. Click 'Generate'"
echo "6. Copy the 16-character password (no spaces)"
echo ""
echo "🔧 Step 3: Update Configuration"
echo "Edit your .env file and replace EMAIL_PASS with the new app password:"
echo "EMAIL_PASS=abcdabcdabcdabcd"
echo ""
echo "⚠️  Important Notes:"
echo "- Don't use your regular Gmail password"
echo "- The app password should be exactly 16 characters"
echo "- Remove any quotes from the .env file"
echo "- Make sure 2FA is enabled on your Gmail account"
echo ""
echo "🧪 Test after setup:"
echo "py corn.py --test-email"
echo ""

# Check current .env file for common issues
if [[ -f ".env" ]]; then
    echo "🔍 Checking current .env file for issues..."
    
    if grep -q '"' .env; then
        echo "⚠️  Found quotes in .env file - these should be removed"
        echo "    Current format: EMAIL_PASS=\"password\""
        echo "    Should be:      EMAIL_PASS=password"
    fi
    
    password_line=$(grep "EMAIL_PASS=" .env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [[ -n "$password_line" ]]; then
        password_length=${#password_line}
        echo "📏 Current password length: $password_length characters"
        if [[ $password_length -ne 16 ]]; then
            echo "⚠️  Gmail App Passwords should be exactly 16 characters"
        fi
    fi
fi
