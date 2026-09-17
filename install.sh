#!/bin/sh
set -eu

destination="${EXTENSIONS_DIR:-/tmp/extensions}"
mkdir -p "${destination}"

cp /opt/trace/extension-trace.js \
  "${destination}/extension-trace.js"

echo "Trace installed at ${destination}/extension-trace.js"
