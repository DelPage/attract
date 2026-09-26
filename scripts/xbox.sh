#!/usr/bin/env bash
# Talks to the Xbox through Device Portal. Reads XBOX_PORTAL from .env.
#   scripts/xbox.sh install <package-folder>   install the .msix with its dependencies
#   scripts/xbox.sh library                    upload artifacts/attract-library.zip
#   scripts/xbox.sh restart                    stop and start Attract
#   scripts/xbox.sh screenshot <file.png>      save what the TV shows
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source .env
: "${XBOX_PORTAL:?Set XBOX_PORTAL in .env}"
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT
curl -sk -c "$JAR" -o /dev/null "$XBOX_PORTAL/api/os/info"
TOKEN=$(awk '$6=="CSRF-Token"{print $7}' "$JAR")
portal() { curl -sk -b "$JAR" -H "X-CSRF-Token: $TOKEN" "$@"; }

package_name() {
  portal "$XBOX_PORTAL/api/app/packagemanager/packages" |
    python3 -c "import sys,json;print(next(p['PackageFullName'] for p in json.load(sys.stdin)['InstalledPackages'] if p['PackageFullName'].startswith('DelPage.Attract_')))"
}

case "${1:-}" in
  install)
    dir=${2:?package folder}
    msix=$(ls "$dir"/*.msix | head -1)
    args=(-F "$(basename "$msix")=@$msix" -F "$(basename "$dir"/*.cer)=@$(ls "$dir"/*.cer | head -1)")
    for dep in "$dir"/Dependencies/x64/*.appx; do
      case "$dep" in *Desktop.appx) continue;; esac
      args+=(-F "$(basename "$dep")=@$dep")
    done
    portal -X POST "$XBOX_PORTAL/api/app/packagemanager/package?package=$(basename "$msix")" "${args[@]}"; echo
    for _ in $(seq 1 60); do
      state=$(portal -w '%{http_code}' -o /tmp/attract-state.json "$XBOX_PORTAL/api/app/packagemanager/state")
      [ "$state" = 204 ] || { cat /tmp/attract-state.json; echo; break; }
      sleep 3
    done ;;
  library)
    pkg=$(package_name)
    portal -X POST "$XBOX_PORTAL/api/filesystem/apps/file?knownfolderid=LocalAppData&packagefullname=$pkg&path=%5CLocalState" \
      -F "attract-library.zip=@artifacts/attract-library.zip"; echo ;;
  restart)
    pkg=$(package_name)
    app=$(printf '%s' "${pkg%%_*}_${pkg##*__}!App" | base64 -w0)
    full=$(printf '%s' "$pkg" | base64 -w0)
    portal -X DELETE -o /dev/null "$XBOX_PORTAL/api/taskmanager/app?package=$full" || true
    sleep 2
    portal --data '' -w 'start HTTP %{http_code}\n' -o /dev/null "$XBOX_PORTAL/api/taskmanager/app?appid=$app&package=$full" ;;
  screenshot)
    portal -o "${2:?output file}" "$XBOX_PORTAL/ext/screenshot?download=false&hdr=false" ;;
  *)
    sed -n '2,7p' "$0"; exit 1 ;;
esac
