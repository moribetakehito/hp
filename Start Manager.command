#!/bin/zsh
cd "${0:A:h}"
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif [[ -x "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" ]]; then
  NODE_BIN="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
else
  print 'Node.js 22以上をインストールしてください。'; read; exit 1
fi
"$NODE_BIN" tools/manager.mjs --open
