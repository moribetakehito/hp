# 作品の更新

更新用アプリの起動方法と公開手順は、リポジトリ直下の `MANAGER.md` を参照してください。

作品は日付で管理します。日付は `YYYYMMDD` または `YYYYMMDD_n` 形式、作品IDも同じ日付です。作品番号は使いません。例：`20260529` の作品URLは `/works/20260529/` です。同じ日付には `20260529_1` のように枝番を付けられます。枝番なしでも登録できます。日付と枝番が両方同じ値は重複登録できません。作品の表示順は日付の新しい順、同日は枝番の大きい順です。

画像は `works/uploads/`、作品情報は `works/data.json` に保存します。既存作品の画像は従来の場所も利用します。説明文は `[文字](https://example.com)` 形式のリンクに対応します。

更新は自作の管理アプリから行います。旧Decap CMS、Netlify Identity、Git Gatewayは使用しません。

作品データのversion 2では、トップレベルの`tags`に使用可能なタグ一覧、各作品の`tags`に選択済みタグを保存します。`info`は`{label,value}`の配列、`content`は表示順の本文ブロックです。textブロックは`{type:"text",text,style:"body"|"heading"}`、imageブロックは`{type:"image",src,alt,caption,width:"full"|"medium"|"small",align:"left"|"center"|"right"}`です。既存データはそのまま読み込めます。description/imagesは互換用の派生値で、編集対象はcontentです。
