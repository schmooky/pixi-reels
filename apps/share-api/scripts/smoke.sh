#!/usr/bin/env bash
# share-api smoke test. POSTs a tiny mode-5 share, GETs it back, asserts
# the contents round-trip. Run after every deploy.
#
#   SHARE_API=https://share.pixi-reels.schmooky.dev bash scripts/smoke.sh
#
# Exits non-zero on any failure. Output is greppable for CI.

set -euo pipefail

SHARE_API="${SHARE_API:-http://localhost:8787}"
echo "[smoke] target: $SHARE_API"

# Health.
echo "[smoke] GET /health"
curl -sS -f "$SHARE_API/health" >/dev/null
echo "[smoke] ok"

# Create a public-mode share.
echo "[smoke] POST /api/studios (mode 5)"
RESP=$(curl -sS -f -X POST "$SHARE_API/api/studios" \
  -H 'content-type: application/json' \
  --data-binary @- <<'JSON'
{
  "mode": {
    "assetsEncrypted": false,
    "codeAccessible": true,
    "editable": false,
    "saveKeyDistinct": false
  },
  "ttlDays": 3,
  "payload": {
    "code": "// smoke",
    "symbols": [],
    "assets": {}
  },
  "analytics": {
    "totalAssetBytes": 0,
    "symbolCount": 0,
    "spineSymbolCount": 0,
    "studioVersion": "0.4.0"
  }
}
JSON
)
ID=$(echo "$RESP" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
if [ -z "$ID" ]; then
  echo "[smoke] no id in response: $RESP" >&2
  exit 1
fi
echo "[smoke] created id=$ID"

# Retrieve it.
echo "[smoke] GET /api/studios/$ID"
GOT=$(curl -sS -f "$SHARE_API/api/studios/$ID")
if ! echo "$GOT" | grep -q '"code":"// smoke"'; then
  echo "[smoke] payload missing or wrong: $GOT" >&2
  exit 1
fi
echo "[smoke] round-trip ok"

echo "[smoke] PASS"
