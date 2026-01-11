#!/bin/bash
# Simple HTTP Server for Richter Webapp
# This allows the webapp to load component files via HTTP

PORT=${1:-8000}

# Function to check if port is in use
check_port() {
    if command -v lsof >/dev/null 2>&1; then
        lsof -ti:$PORT >/dev/null 2>&1
    elif command -v netstat >/dev/null 2>&1; then
        netstat -tuln 2>/dev/null | grep -q ":$PORT "
    elif command -v ss >/dev/null 2>&1; then
        ss -tuln 2>/dev/null | grep -q ":$PORT "
    else
        # If no tools available, assume port is free
        return 1
    fi
}

# Check if port is in use
if check_port; then
    echo "⚠️  Port $PORT is already in use."
    echo ""
    echo "Please choose one:"
    echo "  1. Kill the process using port $PORT:"
    echo "     lsof -ti:$PORT | xargs kill"
    echo "  2. Use a different port:"
    echo "     ./server.sh 8080"
    echo ""
    exit 1
fi

# Get local IP address
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP=$(ip addr show 2>/dev/null | grep -oP 'inet \K[\d.]+' | grep -v '127.0.0.1' | head -1)
fi
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="<YOUR_IP>"
fi

echo ""
echo "🚀 Starting HTTP server on port $PORT..."
echo "📱 Local access: http://localhost:$PORT/richter.html"
if [ "$LOCAL_IP" != "<YOUR_IP>" ]; then
  echo "🌐 Network access: http://$LOCAL_IP:$PORT/richter.html"
fi
echo "⏹️  Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")"
python3 -m http.server $PORT --bind 0.0.0.0
