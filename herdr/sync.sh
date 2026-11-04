#!/bin/sh
# Copy your own Herdr files between ~/.config/herdr-app and this folder.
#   ./sync.sh          app -> repo (run before committing)
#   ./sync.sh install  repo -> app (new machine, or after pulling)
#
# "Your own" = everything Herdr didn't ship: any layout, mod or theme you add is
# picked up automatically. Herdr's shipped layouts and mods are read from its
# installed.json; the shipped themes are listed below.
# Files are copied, not linked: Herdr only live-reloads real files in its folder.
set -e
REPO="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/.config/herdr-app"
SHIPPED_THEMES="atom-one-dark win98"

# Never copied: written by Herdr on every start, or its own bookkeeping.
GENERATED="--exclude gpui-kit.d.ts --exclude jsconfig.json --exclude *.error
  --exclude .state --exclude *.old-* --exclude *.reset-* --exclude *.corrupt-* --exclude .DS_Store"

# Herdr's shipped mods and layouts, as rsync excludes ("/agents/", "/main.*").
EXCLUDES="$(mktemp)"
trap 'rm -f "$EXCLUDES"' EXIT
shipped() {
  python3 - "$APP/installed.json" "$1" <<'EOF'
import json, sys
names = json.load(open(sys.argv[1]))
for n in names:
    if sys.argv[2] == "layouts" and n.startswith("layout:"):
        print(f"/{n[7:]}.*")
    elif sys.argv[2] == "mods" and ":" not in n:
        print(f"/{n}/")
EOF
}

if [ "$1" = "install" ]; then
  # Repo -> app. Adds and updates; never deletes anything in the app folder.
  for f in settings.json keys.json programs.json; do
    [ -f "$REPO/$f" ] && cp "$REPO/$f" "$APP/$f"
  done
  for dir in layouts mods themes; do
    [ -d "$REPO/$dir" ] && mkdir -p "$APP/$dir" && rsync -a $GENERATED "$REPO/$dir/" "$APP/$dir/"
  done
  echo "Installed repo -> $APP"
  exit 0
fi

# App -> repo. Mirrors: a layout or mod you delete from Herdr goes from the repo too.
for f in settings.json keys.json programs.json; do
  if [ -f "$APP/$f" ]; then cp "$APP/$f" "$REPO/$f"; else rm -f "$REPO/$f"; fi
done
for dir in layouts mods themes; do
  case $dir in
    themes) : > "$EXCLUDES"; for t in $SHIPPED_THEMES; do echo "/$t.json" >> "$EXCLUDES"; done ;;
    *) shipped $dir > "$EXCLUDES" ;;
  esac
  mkdir -p "$REPO/$dir"
  rsync -a --delete --delete-excluded --exclude-from="$EXCLUDES" $GENERATED "$APP/$dir/" "$REPO/$dir/"
  rmdir "$REPO/$dir" 2>/dev/null || true # nothing of yours there
done
echo "Copied $APP -> repo"
