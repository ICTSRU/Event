#!/usr/bin/env bash
# SRU Event Attendance & Management Platform - one-step update (macOS / Linux) (v4.7)
set -euo pipefail
PUBLIC_ID='AKfycbwA4OA3paT4lDZ3T953kYuUyOCwwtU7ZZJDSMTcKztg19rfFtJNKmONZfxgFMvVpYCr'   # deployment A (Anyone)
SECURE_ID='AKfycbz60Cf78S2Sr-kqqNytnZ51T4d-KA9jOjfLi05juL3gkk7K8-LDdbdSPSWmpkz78Y5x'   # deployment B (SRU only)
clasp() { npx --yes @google/clasp@2.4.2 "$@"; }
HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$HERE/../apps-script"
VER="$(sed -n "s/.*APP_VERSION = '\([0-9.]*\)'.*/\1/p" "$SRC/Code.gs")"
echo "== SRU Events platform v$VER =="
[ -f "$HOME/.clasprc.json" ] || clasp login
ID_FILE="$HOME/.sru-event-script-id"
[ -f "$ID_FILE" ] || { read -rp 'Script ID (Project Settings > IDs): ' ID; echo "$ID" > "$ID_FILE"; }
WORK="$(mktemp -d)"; cp "$SRC"/* "$WORK"/
printf '{"scriptId":"%s","rootDir":"."}' "$(tr -d '[:space:]' < "$ID_FILE")" > "$WORK/.clasp.json"
cd "$WORK"
clasp push --force
clasp deploy --deploymentId "$PUBLIC_ID" --description "v$VER - visitors (Anyone)"
cp "$HERE/appsscript.domain.json" "$WORK/appsscript.json"; clasp push --force
clasp deploy --deploymentId "$SECURE_ID" --description "v$VER - admin (SRU only)"
cp "$SRC/appsscript.json" "$WORK/appsscript.json"; clasp push --force
echo "Done: v$VER uploaded and both deployments updated."
