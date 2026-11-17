#!/bin/sh
set -eu
: "${LOAN_SERVICE_URL:?API URL is required}"
: "${RENDER_EXTERNAL_URL:?Render public origin is required}"
export PUBLIC_ORIGIN="${RENDER_EXTERNAL_URL}"
exec node node-api/src/server.js
