#!/bin/zsh
cd "${0:A:h}"
if [[ -x .manager/bin/gh ]]; then
  GH_BIN="$PWD/.manager/bin/gh"
elif command -v gh >/dev/null 2>&1; then
  GH_BIN="$(command -v gh)"
elif [[ -x /opt/homebrew/bin/gh ]]; then
  GH_BIN=/opt/homebrew/bin/gh
elif [[ -x /usr/local/bin/gh ]]; then
  GH_BIN=/usr/local/bin/gh
else
  print 'GitHub CLIが見つかりません。https://cli.github.com/ から導入してください。'
  read; exit 1
fi
unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN GH_HOST GH_PROMPT_DISABLED
print 'GitHub公式のブラウザ認証を始めます。表示されるワンタイムコードをGitHubで入力してください。'
print 'GitHubのアクセス許可画面を確認し、ご自身で承認してください。'
"$GH_BIN" auth login --hostname github.com --git-protocol https --web
if [[ $? -eq 0 ]]; then
  print '\n認証操作が終了しました。管理アプリに戻り「接続を確認」を押してください。'
else
  print '\n認証を完了できませんでした。再度このファイルを開いてください。'
fi
read '?Enterキーでこのウィンドウを閉じられます。'
