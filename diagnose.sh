#!/bin/bash
# Kimp Fun - cPanel Diagnostic Script
# Run this via SSH to diagnose issues

echo "=================================="
echo "  Kimp Fun Diagnostic Tool"
echo "=================================="
echo ""

# Check Node.js
echo "1. Checking Node.js installation..."
if command -v node &> /dev/null; then
    echo "   ✓ Node.js found: $(node --version)"
else
    echo "   ✗ Node.js NOT found!"
    exit 1
fi

# Check npm
echo "2. Checking npm..."
if command -v npm &> /dev/null; then
    echo "   ✓ npm found: $(npm --version)"
else
    echo "   ✗ npm NOT found!"
    exit 1
fi

# Check if in correct directory
echo "3. Checking current directory..."
if [ -f "server.js" ] && [ -f "package.json" ]; then
    echo "   ✓ Found server.js and package.json"
else
    echo "   ✗ Not in correct directory!"
    echo "   Run: cd ~/public_html"
    exit 1
fi

# Check dependencies
echo "4. Checking dependencies..."
if [ -d "node_modules" ]; then
    echo "   ✓ node_modules folder exists"
    if [ -d "node_modules/ws" ]; then
        echo "   ✓ ws package installed"
    else
        echo "   ✗ ws package NOT found! Run: npm install"
    fi
else
    echo "   ✗ node_modules NOT found! Run: npm install"
fi

# Check .htaccess
echo "5. Checking .htaccess..."
if [ -f ".htaccess" ]; then
    echo "   ✓ .htaccess exists"
    PORT=$(grep -o "127.0.0.1:[0-9]*" .htaccess | head -1 | cut -d: -f2)
    if [ ! -z "$PORT" ]; then
        echo "   ✓ Port configured: $PORT"
    else
        echo "   ✗ Port not found in .htaccess!"
    fi
else
    echo "   ✗ .htaccess NOT found!"
fi

# Check file permissions
echo "6. Checking file permissions..."
PERM=$(stat -c %a server.js 2>/dev/null || stat -f %A server.js 2>/dev/null)
if [ "$PERM" = "644" ] || [ "$PERM" = "755" ]; then
    echo "   ✓ server.js permissions OK ($PERM)"
else
    echo "   ⚠ server.js permissions: $PERM (should be 644 or 755)"
fi

# Try to find running process
echo "7. Checking for running Node.js processes..."
PROCESSES=$(ps aux | grep "node.*server.js" | grep -v grep | wc -l)
if [ "$PROCESSES" -gt 0 ]; then
    echo "   ✓ Found $PROCESSES Node.js process(es)"
    ps aux | grep "node.*server.js" | grep -v grep
else
    echo "   ✗ No Node.js processes found"
fi

# Test server start
echo ""
echo "8. Testing if server can start..."
echo "   Attempting to start server for 3 seconds..."
timeout 3 node server.js &
sleep 1
if ps -p $! > /dev/null 2>&1; then
    echo "   ✓ Server starts successfully!"
    kill $! 2>/dev/null
else
    echo "   ✗ Server failed to start. Check errors above."
fi

echo ""
echo "=================================="
echo "  Diagnostic Complete"
echo "=================================="
echo ""
echo "Summary:"
echo "  - Node.js: $(command -v node &> /dev/null && echo "OK" || echo "MISSING")"
echo "  - Dependencies: $([ -d "node_modules/ws" ] && echo "OK" || echo "MISSING")"
echo "  - .htaccess: $([ -f ".htaccess" ] && echo "OK" || echo "MISSING")"
echo "  - Running: $([ "$PROCESSES" -gt 0 ] && echo "YES" || echo "NO")"
echo ""
echo "Next steps:"
if [ ! -d "node_modules/ws" ]; then
    echo "  1. Run: npm install"
fi
if [ "$PROCESSES" -eq 0 ]; then
    echo "  2. Start app in cPanel Node.js App Manager"
fi
echo "  3. Check 503-ERROR-FIX.md for detailed solutions"
echo ""
