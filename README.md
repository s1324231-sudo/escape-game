# ひらけ、密室。

舞台・難易度・雰囲気を入力すると、AIが3部屋の脱出ゲームを生成します。  
部屋にある2つの手がかりを調べ、扉の謎を解きながら脱出を目指します。  
授業の generic-webapi と OpenAI API を使い、生成したJSONを `JSON.parse()` で読み取ってゲームを動かします。

## ローカルで動かす

Node.js 22以上で、解凍したフォルダ内から `npm ci` を実行します。`.env.example` を `.env.local` にコピーし、`OPENAI_API_KEY` を設定します。`npm start` の後に <http://localhost:8080/> を開きます。キーがなくても「サンプルで遊ぶ」は利用できます。

## RenderとGitHub

1. 解凍したフォルダの中身を自分のGitHubリポジトリに置きます。`.env.local` はコミットしません。
2. Renderの **New → Web Service** からリポジトリを接続します。
3. Runtime は Node、Build Command は `npm ci`、Start Command は `npm start` にします。
4. Renderの環境変数に `OPENAI_API_KEY` を設定します。既定モデルは `gpt-4o-mini` です。
5. 発行された `https://サービス名.onrender.com/` を開いて「AIでゲームを作る」を確認し、GitHubリポジトリのURLと合わせて提出します。

## 出典

授業配布の [generic-webapi](https://github.com/s1324231-sudo/generic-webapi/tree/c2cac0bc8fc0b79a539d47270c864b8637da8b38)を改変し、引用・改変範囲は `server.js` の冒頭に記載しました。画面、CSSイラスト、手作りサンプル、プロンプトは本作品用に制作しました。
