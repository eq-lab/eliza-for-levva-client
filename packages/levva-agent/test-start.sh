#!/bin/bash
echo "Starting levva-agent test..."
bun run start 2>&1 | tee /tmp/levva-start.log &
PID=$!
sleep 8
kill $PID 2>/dev/null
echo ""
echo "=== Checking for errors ==="
if grep -q "CancelRunSignal" /tmp/levva-start.log; then
  echo "❌ CancelRunSignal error still present"
  grep "CancelRunSignal" /tmp/levva-start.log
  exit 1
elif grep -q "Error loading project" /tmp/levva-start.log; then
  echo "❌ Error loading project"
  grep -A 5 "Error loading project" /tmp/levva-start.log
  exit 1
elif grep -q "Loaded character:" /tmp/levva-start.log; then
  echo "✅ Agent loaded successfully!"
  grep "Loaded character:" /tmp/levva-start.log
  grep "Registered intent:" /tmp/levva-start.log | head -4
  exit 0
else
  echo "⚠️  Unclear status, showing last 20 lines:"
  tail -20 /tmp/levva-start.log
  exit 1
fi
