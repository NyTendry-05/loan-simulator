#!/bin/sh
set -eu
: "${DATABASE_INTERNAL_URL:?Render database connection is required}"
: "${DATABASE_USER:?Database user is required}"
: "${DATABASE_PASSWORD:?Database password is required}"
: "${ENCRYPTION_PRIMARY_KEY:?Persistent encryption key is required}"
: "${AUTH_LOOKUP_KEY:?Persistent lookup key is required}"
# Credentials stay in dedicated environment variables, not the JDBC URL.
export DATABASE_URL="jdbc:postgresql://${DATABASE_INTERNAL_URL#*@}"
export ENCRYPTION_ACTIVE_KEY_ID=primary
export ENCRYPTION_KEYS="primary:${ENCRYPTION_PRIMARY_KEY}"
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--XX:MaxRAMPercentage=65.0}"
exec java -jar /app/app.jar
