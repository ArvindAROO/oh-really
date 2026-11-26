#!/usr/bin/env bash
# End-to-end smoke test of the real sandbox on Linux or macOS.
#
#   npm run build && bash scripts/smoke.sh
#
# Runs the same checks as docs/proven.md sections 4 to 6. Anything that would
# touch real user files only runs when those files do not already exist, so it
# is safe on a developer machine as well as a throwaway CI runner.
set -u

repo="$(cd "$(dirname "$0")/.." && pwd)"
ohr() { node "$repo/dist/cli/main.js" "$@"; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"

pass=0
fail=0
skip=0
check() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "ok    $name"
    pass=$((pass + 1))
  else
    echo "FAIL  $name"
    fail=$((fail + 1))
  fi
}
skipped() {
  echo "skip  $1 ($2)"
  skip=$((skip + 1))
}

# --- startup -----------------------------------------------------------------
check "doctor reports ready" ohr doctor

# --- files -------------------------------------------------------------------
check "can write, read and delete inside the project" \
  bash -c "[ \"\$(node '$repo/dist/cli/main.js' bash -c 'echo hi > a && cat a && rm a')\" = hi ]"

canary="$HOME/.oh-really-smoke-canary-$$"
echo secret >"$canary"
check "cannot read a file in the home folder" \
  bash -c "! node '$repo/dist/cli/main.js' cat '$canary' | grep -q secret"
check "child processes cannot read it either" \
  bash -c "! node '$repo/dist/cli/main.js' bash -c 'bash -c \"cat $canary\"' | grep -q secret"
ln -s "$canary" ./canary-link
check "a link out of the project leads nowhere"   bash -c "! node '$repo/dist/cli/main.js' cat ./canary-link | grep -q secret"
rm -f ./canary-link "$canary"

mkdir -p secrets && echo secret >secrets/key && echo secret >.env
printf '[files]\nhidden = ["./.env", "./secrets"]\n' >.oh-really.toml
check "a project file can hide a file inside the project" \
  bash -c "! node '$repo/dist/cli/main.js' cat .env 2>/dev/null | grep -q secret"
check "a project file can hide a folder inside the project" \
  bash -c "! node '$repo/dist/cli/main.js' cat secrets/key 2>/dev/null | grep -q secret"
if [ "$(uname)" = Linux ]; then
  check "a hidden file reads as empty (Linux)" \
    bash -c "node '$repo/dist/cli/main.js' cat .env && [ -z \"\$(node '$repo/dist/cli/main.js' cat .env)\" ]"
fi
printf '[files]\nread_write = ["~"]\n' >.oh-really.toml
check "a project file cannot grant access" bash -c "! node '$repo/dist/cli/main.js' true"
rm -rf .oh-really.toml .env secrets

outside="$HOME/.oh-really-smoke-outside-$$"
ohr bash -c "echo x > '$outside'" >/dev/null 2>&1
check "writes to the home folder never reach the real disk" test ! -e "$outside"
rm -f "$outside"

# --- processes and environment ---------------------------------------------
check "exit code is passed through" bash -c "node '$repo/dist/cli/main.js' bash -c 'exit 42'; [ \$? -eq 42 ]"
check "API keys are not passed in" \
  bash -c "! OPENAI_API_KEY=smoke-secret node '$repo/dist/cli/main.js' env | grep -q smoke-secret"

# --- network -----------------------------------------------------------------
check "no network by default" bash -c "! node '$repo/dist/cli/main.js' curl -sS -m 15 -o /dev/null https://example.com"
check "--net open reaches the internet" \
  bash -c "[ \"\$(node '$repo/dist/cli/main.js' --net open curl -sS -m 15 -o /dev/null -w '%{http_code}' https://example.com)\" = 200 ]"

profile_dir="${XDG_CONFIG_HOME:-$HOME/.config}/oh-really/profiles"
if [ ! -e "$profile_dir/default.toml" ]; then
  mkdir -p "$profile_dir"
  printf '[network]\nallow = ["example.com"]\n' >"$profile_dir/default.toml"
  check "allowlist: allowed host works" \
    bash -c "[ \"\$(node '$repo/dist/cli/main.js' curl -sS -m 15 -o /dev/null -w '%{http_code}' https://example.com)\" = 200 ]"
  check "allowlist: other hosts are blocked and reported" \
    bash -c "node '$repo/dist/cli/main.js' curl -sS -m 15 -o /dev/null https://google.com 2>&1 | grep -q 'oh really?'"
  rm -f "$profile_dir/default.toml"
else
  skipped "allowlist checks" "a real $profile_dir/default.toml exists"
fi

# --- saving a granted file (write temp, then rename) -------------------------
if [ ! -e "$HOME/.claude.json" ]; then
  mkdir -p bin
  printf '#!/bin/sh\necho "{\\"saved\\":\\"$1\\"}" > ~/.claude.json.tmp && mv ~/.claude.json.tmp ~/.claude.json\n' >bin/claude
  chmod +x bin/claude
  ohr ./bin/claude first >/dev/null 2>&1
  check "first run can create its config" grep -q '"first"' "$HOME/.claude.json"
  ohr ./bin/claude second >/dev/null 2>&1
  check "config saved by rename is kept" grep -q '"second"' "$HOME/.claude.json"
  rm -f "$HOME/.claude.json"
else
  skipped "config save checks" "a real ~/.claude.json exists"
fi

echo
echo "passed $pass, failed $fail, skipped $skip"
[ "$fail" -eq 0 ]
