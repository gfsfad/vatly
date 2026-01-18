#!/bin/bash
# Script để test kết nối từ máy chủ

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$IP" ]; then
  IP=$(ip addr show | grep -oP 'inet \K[\d.]+' | grep -v '127.0.0.1' | head -1)
fi

echo "=== Testing Server Connection ==="
echo "IP Address: $IP"
echo ""

echo "1. Testing localhost..."
if curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:8000/richter.html; then
  echo "✓ Localhost works"
else
  echo "✗ Localhost failed"
fi

echo ""
echo "2. Testing via IP address..."
if curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://$IP:8000/richter.html; then
  echo "✓ IP access works"
else
  echo "✗ IP access failed"
fi

echo ""
echo "3. Checking server binding..."
if netstat -tuln 2>/dev/null | grep -q ":8000.*0.0.0.0"; then
  echo "✓ Server is bound to 0.0.0.0:8000 (correct)"
elif netstat -tuln 2>/dev/null | grep -q ":8000.*127.0.0.1"; then
  echo "✗ Server is bound to 127.0.0.1:8000 (wrong - restart with --bind 0.0.0.0)"
else
  echo "? Cannot determine binding"
fi

echo ""
echo "4. Network interface info:"
ip addr show | grep -E "inet.*$IP" -A 2 | head -5

echo ""
echo "=== Instructions for remote access ==="
echo "From another PC in the same network, try:"
echo "  http://$IP:8000/richter.html"
echo ""
echo "If it doesn't work:"
echo "1. Ensure both PCs are on the same network (same WiFi/router)"
echo "2. Try ping from client PC: ping $IP"
echo "3. Check firewall on server: sudo ufw status"
echo "4. Try different port: ./server.sh 8080"


