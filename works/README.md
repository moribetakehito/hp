# works の更新方法

## 新しい作品を追加する

1. `works/作品ID/` フォルダを作る
   - 例: `works/20260601_new_work/`

2. その中に `images/` フォルダを作って画像をアップロードする
   - 例: `works/20260601_new_work/images/01.jpg`
   - 表示したい順番に `01.jpg`, `02.jpg` のように名前をつけると管理しやすいです。

3. `works/_template/index.html` をコピーして、新しい作品フォルダに `index.html` として置く
   - `data-work-id="ここを作品IDに変える"` を、作品IDに変えます。
   - 例: `data-work-id="20260601_new_work"`

4. `works/data.json` に作品情報を追加する

例:

```json
{
  "id": "20260601_new_work",
  "number": "w/002",
  "date": "20260601",
  "title": "作品タイトル",
  "venue": "会場名",
  "subtitle": "サブタイトル",
  "description": "説明文",
  "url": "/works/20260601_new_work/",
  "images": [
    "images/01.jpg",
    "images/02.jpg"
  ]
}
```

## 画像を追加・並び替えしたいとき

`works/data.json` の `images` の行を編集します。

```json
"images": [
  "images/01.jpg",
  "images/02.jpg",
  "images/03.jpg"
]
```

ここに書いた順番で作品ページに表示されます。

## works一覧を変えたいとき

`works/data.json` の `works` 配列の順番を入れ替えると、`/works/` の表示順も変わります。
