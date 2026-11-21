#!/bin/sh
# Runs as root, prepares the node_modules volume, then drops to the workspace
# owner's uid and gid, so every file the board writes belongs to the user.
set -eu

uid="${CORESLOPPER_UID:-$(stat -c %u /app)}"
gid="${CORESLOPPER_GID:-$(stat -c %g /app)}"
mkdir -p "$HOME" /app/node_modules
chown "$uid:$gid" "$HOME" /app/node_modules

as_user() { setpriv --reuid="$uid" --regid="$gid" --clear-groups -- "$@"; }

if [ ! -f /app/package.json ] || [ ! -f /app/package-lock.json ]; then
  echo "coreslopper: /app is not a workspace; mount the workspace at /app (compose.yaml does)." >&2
  exit 1
fi

# Install when the lock file changed since the last install (first start, or after `coreslopper update`).
stamp=/app/node_modules/.coreslopper-lock.sha256
want="$(sha256sum /app/package-lock.json | cut -d' ' -f1)"
if [ "$(cat "$stamp" 2>/dev/null || true)" != "$want" ]; then
  echo "coreslopper: installing dependencies (package-lock.json changed)..."
  # Development dependencies included: the CLI runs from source with tsx.
  as_user npm ci --include=dev --no-audit --no-fund
  as_user npx --no-install remotion browser ensure >/dev/null 2>&1 || echo "coreslopper: headless Chrome not installed; composed release images need it." >&2
  echo "$want" | as_user tee "$stamp" >/dev/null
fi

exec setpriv --reuid="$uid" --regid="$gid" --clear-groups -- "$@"
