#!/bin/sh
# Startup script for llm-secure-browser in Docker.
#
# ChurchSuite is protected by Cloudflare, which blocks standard headless
# Playwright. Running Chromium in headed mode (BROWSER_HEADLESS=false) with
# a virtual framebuffer bypasses the TLS fingerprinting that triggers the
# Cloudflare managed challenge.
#
# Signal handling: `exec` replaces this shell with the node process, so
# Docker's SIGTERM goes directly to node (PID 1) for graceful shutdown.

# Start virtual framebuffer — provides a display without a physical screen
Xvfb :99 -screen 0 1280x720x24 -ac -nolisten tcp &

export DISPLAY=:99

# Wait for Xvfb to be ready before Chromium tries to connect
sleep 1

exec node dist/index.js
