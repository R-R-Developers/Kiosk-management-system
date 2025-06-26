#!/bin/bash

# Test script for Kiosk Management API

BASE_URL="http://localhost:3000"

echo "🚀 Testing Kiosk Management System API"
echo "======================================"

# Test 1: Health Check
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/api/health" | python3 -m json.tool
echo -e "\n"

# Test 2: Login
echo "2. Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "AdminPass123"}')

echo "$LOGIN_RESPONSE" | python3 -m json.tool
echo -e "\n"

# Extract token
TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('token', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "❌ Failed to get authentication token"
    exit 1
fi

echo "✅ Token obtained: ${TOKEN:0:20}..."
echo -e "\n"

# Test 3: Get current user info
echo "3. Testing user info endpoint..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/auth/me" | python3 -m json.tool
echo -e "\n"

# Test 4: Get devices
echo "4. Testing devices endpoint..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/devices" | python3 -m json.tool
echo -e "\n"

# Test 5: Get device groups (if endpoint exists)
echo "5. Testing device groups..."
curl -s -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/device-groups" | head -5
echo -e "\n"

echo "✅ API testing completed!"
