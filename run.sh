#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Starting VRN Stone Crushers Portal..."
node --experimental-sqlite server.js
