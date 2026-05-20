# works の更新方法

## いちばん簡単な方法

1. `https://moribetakehito.com/admin/` を開く
2. GitHubでログインする
3. `Site Data` → `Works` を開く
4. 作品情報を追加・編集する
5. `Images` に画像をアップロードする
6. 保存する

保存すると `works/data.json` と画像ファイルがGitHubに反映され、`/works/` の一覧にも出ます。

## 新しい作品について

新しい作品は、作品ごとのHTMLを作らなくても `/works/work/?id=作品ID` で表示できます。

例:

```text
/works/work/?id=20260601_new_work
```

`ID` は半角英数字・ハイフン・アンダーバーで付けると扱いやすいです。

## 画像について

管理画面からアップロードした画像は `works/uploads/` に入ります。表示順は `Images` の並び順です。

## 既存ページについて

既存の `/works/20260511_cp/` はそのまま残しています。内容は `works/data.json` から読み込まれます。
