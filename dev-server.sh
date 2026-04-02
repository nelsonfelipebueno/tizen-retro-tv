#!/bin/bash
# Local dev server for testing in Chrome
# Solves CORS issues when loading .mem files via file://
PORT=${1:-8080}
echo ""
echo "========================================="
echo "  Dev server running at:"
echo "  http://localhost:$PORT"
echo "========================================="
echo ""
echo "Press Ctrl+C to stop"
echo ""
python3 -m http.server "$PORT"
