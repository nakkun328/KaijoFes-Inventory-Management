# 本番公開準備手順

この文書は公開前の作業順です。Supabase・GitHub・Vercelへの書き込み、Preview/Productionデプロイ、復元先への投入は、それぞれ対象を確認してから行います。Secret Key、DBパスワード、管理者パスワードはチャット・Gitへ載せず、各サービスの画面か手元の環境変数に直接入力します。

## 2026-09-30 の公開前確認

- PR #1はマージ済みで、GitHub `main` は `0f7a119b13c6730ad95535bce1f585716338631c` です。
- 新規Supabaseの自動GRANT無効設定に対応するため、`20260930000100_service_role_grants.sql` を追加しました。従来の5件と合わせて新規環境への適用対象は6件です。既存の開発環境には追加1件だけを適用し、seedは再投入しません。
- `service_role` のテーブルアクセスと採番・移動を、自動GRANTのないPostgreSQLで検証しています。匿名ユーザーと管理者以外のRLS拒否も維持します。
- ローカルではTurbopackの内部ポート使用が実行環境で禁止されました。`npm run build -- --webpack` と `npm run check:client-secret` は成功しました。Vercelでは標準ビルドを実行し、結果を確認します。
- 本番Supabase `kaijofes-inventory-prod`（東京）を作成し、6件のmigrationをdry-run後に適用しました。seed未投入、全7業務テーブル0件、RLS・RPC・管理者・Storage・サーバー権限を確認済みです。開発環境にも追加1件だけを適用しました。
- 本番管理者Authユーザー1名を確認し、`public.admin_users` に登録済みです。秘密情報はGit・チャットへ掲載していません。
- 開発用Supabaseで管理者・写真・バックアップの実環境テストがすべて成功しました。一般画面の部員選択・検索・詳細・移動先選択も確認済みです。
- 本番DBの移動・受け渡し・保管復帰・競合拒否は、一時データをロールバックするトランザクションで確認しました。検証後も備品・履歴は0件で、採番シーケンスは変更していません。
- VercelにはHobbyプランでGitHubリポジトリを接続し、Production=`main`、Root=`./`、Install=`npm ci`、Build=`npm run build` を設定しました。Productionの3変数は本番Supabase、Previewの3変数は開発Supabaseに分離し、すべてSensitiveとして入力しています。デプロイと公開URLの確認は、完了後に記録します。

## 2026-09-28 の初回確認結果

- 実装はローカル作業ブランチ `Orca/指示出し用` にあり、GitHubの `main` は初期READMEだけでした。GitHubへ実装ブランチをプッシュし、Previewで確認するまで、Git連携からこのアプリはデプロイできません。
- Supabase CLIから見えるプロジェクトは `kaijofes-inventory-dev` の1件だけです。本番・復元演習用プロジェクトは未作成です。ローカルCLIは開発プロジェクトへリンクされています。
- Vercelプロジェクトとのローカルリンクはありません。GitHub CLIの認証は現在失効しており、GitHub APIでリポジトリ設定を確認できません。`git ls-remote` では `main` の初期コミットを確認できました。
- `.env.local` は `.gitignore` の対象で、Git追跡対象ではありません。`.vercel/` も無視します。

## 1. コードをGitHubに載せる前に

1. `npm ci`、`npm test`、`npm run typecheck`、`npm run lint`、`npm run build`、`npm audit`、`npm run check:client-secret` を実行します。
2. `git status --short` で追加対象を確認します。`.env.local`、`.vercel/`、写真やバックアップZIPを追加しないでください。`git check-ignore -v .env.local` と `git ls-files .env.local` で再確認します。
3. この作業ブランチの実装一式、6件のmigration、README、検証スクリプトをコミットし、GitHubの別ブランチへプッシュしてレビューします。`main` へのマージはPreview検証後に行います。GitHub CLIを使うなら、手元で `gh auth login` を実行してください。パスワードやトークンを共有する必要はありません。

## 2. 本番Supabaseプロジェクト

1. [Supabase Dashboard](https://supabase.com/dashboard)で所属Organizationを確認し、**New project**から本番専用プロジェクトを作成します。名前は開発用と区別できるものにし、リージョン、DBパスワード、料金プランを確認します。DBパスワードは手元で保管します。
2. プロジェクト上部の**Connect**でProject URLを、**Settings → API Keys**で `sb_publishable_...` と `sb_secret_...` を確認します。[Supabase APIキー](https://supabase.com/docs/guides/getting-started/api-keys)
3. この時点のCLIリンクは開発用です。対象のproject refをDashboard URLで確認し、専用の作業ディレクトリまたはworktreeで `npx supabase link --project-ref <本番ref>` を実行します。続けて `npx supabase db push --dry-run` の対象が6件のmigrationだけであることを確認し、`npx supabase db push` を実行します。**`--include-seed` と `db reset --linked` は本番で実行しません。** [CLIのmigration手順](https://supabase.com/docs/guides/local-development/cli-workflows)
4. `supabase/check_security.sql`、`supabase/check_admin.sql`、`supabase/check_photos.sql` を本番のSQL Editorで読み取り実行し、RLS、移動RPC、管理者ポリシー、非公開Storageバケットを確認します。
5. **Authentication → Users → Add user**で本番用管理者を作成し、そのAuth UUIDを本番SQL Editorの `insert into public.admin_users (user_id) values ('<UUID>');` に使用します。開発用管理者の認証情報は流用しません。

## 3. Preview / Production の環境変数

VercelのPreviewには開発・検証用Supabase、Productionには本番専用Supabaseを設定します。設定画面で環境ごとに以下の3つを登録します。`SUPABASE_SECRET_KEY` は**Sensitive**として扱い、`NEXT_PUBLIC_` を付けません。ブラウザ用Supabaseクライアントはなく、これらの値はすべてサーバー側で参照します。[Vercelの環境変数](https://vercel.com/docs/environment-variables)

| 変数 | Preview | Production |
| --- | --- | --- |
| `SUPABASE_URL` | 開発用Project URL | 本番用Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | 開発用publishable key | 本番用publishable key |
| `SUPABASE_SECRET_KEY` | 開発用Secret Key | 本番用Secret Key |

環境変数の追加・変更は**次のデプロイから**反映されます。PreviewとProductionのProject URLが異なることを値を表示せずに確認し、各環境の管理者を個別に作成します。ローカルの `.env.local` は開発用のままにし、本番Secret Keyを上書きしない運用を推奨します。

## 4. Vercelの設定とデプロイ順

1. GitHubの別ブランチにコードが載った後、VercelでGitHubリポジトリを接続します。FrameworkはNext.js、Root Directoryは**リポジトリのルート `/`**、Install Commandは`npm ci`、Build Commandは`npm run build`を使用します。Production Branchは`main`です。
2. PreviewとProductionの環境変数を別々に登録し、Previewには[Deployment Protection](https://vercel.com/docs/deployment-protection)を有効にします。Git連携でProduction Branchにプッシュすると自動で本番デプロイされるため、`main`へのマージは最後に行います。[Vercel Git連携](https://vercel.com/docs/git)
3. 別ブランチのPreviewをデプロイして、画面・API・写真・権限・ZIPを検証します。Productionの公開操作はこの検証と復元演習後に行います。Vercelプロジェクト作成時に初回デプロイが発生する設定なら、その対象ブランチと保護設定を事前に確認します。

## 5. Previewと本番での確認

- 一般画面：部員選択、一覧、検索、詳細、写真、直近履歴。
- 移動：専用の検証備品を保管場所→部員→別部員→保管場所へ移動し、状態と全履歴、競合更新拒否を確認。検証備品の作成・削除は意図的にデータを変更します。
- 管理画面：ログイン、備品・部員・カテゴリ・場所、削除・復元、写真操作、全履歴。
- 権限：匿名・一般ユーザーの管理者APIとバックアップAPIが401、直接Storage書き込みが拒否、管理者JWTの許可リストを確認。
- バックアップ：管理者がZIPを取得し、`unzip -t`、`metadata.json`の件数と写真、削除済み備品を確認。バックアップ中は更新を止めます。
- Secret Key：`npm run build`後に`npm run check:client-secret`を実行し、ブラウザ配信用ファイルに値がないことを確認。公開後もブラウザのNetworkからJSとAPIレスポンスにSecret Keyがないことを確認します。Secret Keyそのものをログやスクリーンショットへ出しません。

## 6. 別の空プロジェクトで復元演習

1. 開発・Previewから作った有効なZIPを用意し、`unzip -t <ZIP>`で検査して展開します。
2. 本番でも開発でもない**新しい空のSupabaseプロジェクト**を作成します。上記と同じ6件のmigrationを`db push`で適用し、seedは投入しません。
3. 復元先に管理者Authユーザーと `admin_users` 行を作成します。`cp .env.example .env.restore.local` で別ファイルを作り、復元先のURL・Secret Key・publishable keyを手元で設定します。このファイルは `.gitignore` の対象です。値をチャットやGitへ載せません。
4. まず `node --env-file=.env.restore.local scripts/restore-backup.mjs <展開ディレクトリ>` で形式・件数・写真の検査だけ実行します。投入時は `node --env-file=.env.restore.local scripts/restore-backup.mjs <展開ディレクトリ> --apply --expected-project-ref <復元先ref> --deleted-by-id <復元先管理者Auth UUID>` を実行します。スクリプトは対象refと空テーブルを確認します。
5. 復元先SQL Editorで`supabase/reset_management_sequence.sql`を実行します。次に `npm run test:restore-live -- <展開ディレクトリ> --expected-project-ref <復元先ref> --deleted-by-id <復元先管理者Auth UUID>` で全7テーブルの行と写真バイト列を元のZIPと照合し、管理画面も確認します。失敗時は空の演習用プロジェクトを作り直して原因を修正します。実際の本番データに復元スクリプトを向けません。

## 公開判断

GitHubにレビュー済みコードがあり、本番SupabaseのRLS・管理者・環境変数が確認済みで、Previewと別プロジェクトへの復元演習が成功し、Productionで上記の動作確認が済むまで一般公開しません。一般部員はログイン不要なので、アプリURLを知る人による部員のなりすましは運用上のリスクとして公開範囲を決めます。
