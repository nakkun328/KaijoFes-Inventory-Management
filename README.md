# 広報部 備品管理

文化祭実行委員会・広報部の備品管理アプリ。一般部員向けの備品一覧・検索・詳細・移動・写真閲覧と、管理者向けの備品・部員・カテゴリ・保管場所・写真管理、全移動履歴、バックアップを実装しています。

本番公開前の作業順と環境分離は [公開準備手順](docs/production-readiness.md) を参照してください。

## 実 Supabase 環境の準備（開発・検証用）

1. Node.js 22 以上が使えることを `node --version` と `npm --version` で確認し、`npm install` を実行します。
2. [Supabase Dashboard](https://supabase.com/dashboard) の所属 Organization で **New project** を選び、検証専用プロジェクトを作成します。名前、リージョン、データベースパスワードを設定し、準備完了まで待ちます。パスワードとキーをチャット・Git に載せないでください。
3. プロジェクト上部の **Connect** で Project URL を確認します。**Settings → API Keys** で `sb_secret_...` と `sb_publishable_...` を確認します。[キーの種類と取得場所](https://supabase.com/docs/guides/getting-started/api-keys)
4. `cp .env.example .env.local` を実行し、手元の `.env.local` に下記を直接設定します。`SUPABASE_SECRET_KEY` はサーバー専用、`SUPABASE_PUBLISHABLE_KEY` は管理者認証と権限テストに使用します。いずれも `NEXT_PUBLIC_` を付けません。

   ```dotenv
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

5. 新規の検証専用プロジェクトで、リポジトリのルートから次を一度実行します。CLI は `npm install` で入ります。ログインで開くブラウザ、DB パスワードのプロンプトは手元で操作してください。[公式 CLI 手順](https://supabase.com/docs/guides/local-development/cli-workflows)

   ```sh
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push --dry-run
   npx supabase db push --include-seed
   ```

   `<project-ref>` は Dashboard の URL `https://supabase.com/dashboard/project/<project-ref>` の末尾です。新規プロジェクトでは `--dry-run` で `20260928000100_initial.sql` から `20260930000100_service_role_grants.sql` までの6件が適用対象であることを確認してください。`--include-seed` は検証用データ（佐藤・田中、2件の備品など）を投入するため、**本番プロジェクトでは実行しません**。再実行で seed が重複するため、新規プロジェクトで一度だけ使います。

   Phase 1〜3 の migration と seed をすでに適用したプロジェクトでは、**seed を再投入せず**次だけ実行します。

   ```sh
   npx supabase db push --dry-run
   npx supabase db push
   ```

   この場合の適用対象は `20260928000200_admin.sql` から `20260930000100_service_role_grants.sql` までの5件です。Phase 4 まで適用済みなら写真関連の2件と `20260930000100_service_role_grants.sql` の3件です。以前の5件が適用済みなら追加の権限migrationだけが対象です。

6. `npm run dev` を実行し、`http://localhost:3000` を開きます。別のターミナルで `npm run test:live`、続いて `npm run test:search-live` を実行します。前者は実データに3件の移動履歴を追加し、`DJI RS 3` の最終位置を物理部室にします。**新規 seed の初期状態で一度だけ**実行してください。後者は移動後の実データで、一覧の検索処理を確認します。

SQL Editor で migration と seed を手動適用する方法もありますが、CLI の migration 履歴が記録されません。今後 `db push` を使うため、このプロジェクトでは CLI 手順に統一します。[migration 管理の注意点](https://supabase.com/docs/guides/deployment/database-migrations)

新しいSupabaseのデフォルト権限に依存しないよう、`20260930000100_service_role_grants.sql` がサーバー用の `service_role` にテーブルと採番シーケンスの権限を明示します。新規プロジェクトでは **Automatically expose new tables** を無効にしても使用できます。匿名ユーザーと一般認証ユーザーの権限は追加しません。

### RLS と RPC の作成確認

リンク済みの CLI から `npx supabase db query --linked --file supabase/check_security.sql` を実行できます。全7テーブルで `rls = true`、`anon_select = false`、`anon_update = false`、`service_select = true`、RPC で `anon_exec = false`、`authenticated_exec = false`、`service_exec = true` が期待値です。Phase 4 では管理者用の RLS ポリシーが15件作成されます。`authenticated_update = true` のテーブルも管理者許可リストに入っていなければ RLS で操作できません。`npx supabase db query --linked --file supabase/check_admin.sql` では管理者用の削除制約・ポリシー・migration 履歴を確認できます。Supabase Dashboard の **SQL Editor** から個別に調べる場合は次も使えます。

```sql
select c.relname, c.relrowsecurity,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
  has_table_privilege('anon', c.oid, 'UPDATE') as anon_update,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_select
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('categories', 'locations', 'members', 'equipments',
    'equipment_images', 'equipment_components', 'movement_history')
order by c.relname;
```

次は `anon_exec = false`、`service_exec = true` が期待値です。

```sql
select
  has_function_privilege('anon',
    'public.move_equipment(uuid,text,uuid,uuid,timestamptz,text)', 'EXECUTE') as anon_exec,
  has_function_privilege('service_role',
    'public.move_equipment(uuid,text,uuid,uuid,timestamptz,text)', 'EXECUTE') as service_exec;
```

SQL Editor は管理権限で実行されるため、そこで備品が読めることは匿名権限の検証になりません。`npm run test:live` は publishable key で直接読み取り・管理データ更新・移動 RPC を試し、拒否を確認します。[RLS の公式説明](https://supabase.com/docs/guides/database/postgres/row-level-security)

`supabase/verify_movement.sql` は SQL Editor で実行できる補助検証です。DB 内の変更はロールバックされます。`npm run test:live` より前の初期状態で使ってください。

初期データは開発確認用です。本番データは管理画面から追加します。

## 管理者の初期設定

管理者認証には Supabase Auth のメール・パスワードと、`public.admin_users` の許可リストを使います。パスワードはアプリのソースや DB の管理者テーブルには保存しません。

1. Supabase Dashboard の **Authentication → Users** で **Add user** を選び、管理者のメールアドレスと十分に強いパスワードでユーザーを作成します。実際のメールアドレスでログインする場合は、確認済みとして登録してください。パスワードや API キーはチャットへ貼らず、手元だけで管理してください。
2. 作成したユーザーの UUID を Dashboard で確認します。
3. **SQL Editor** で次を実行します。UUID は手元で置き換えます。

   ```sql
   insert into public.admin_users (user_id)
   values ('<管理者の Auth ユーザー UUID>');
   ```

4. アプリの `/admin/login` で同じメールアドレスとパスワードを入力します。権限を取り消す場合は `admin_users` の該当行を削除します。管理者 API は毎回許可リストを確認します。

管理者 API はログイン済みのユーザー JWT を使って Supabase に接続し、サーバー側の認証確認に加えて DB の RLS で操作を制限します。一般部員のブラウザには管理者トークンも Secret Key も渡しません。

検証専用プロジェクトでは、アプリを起動したまま `npm run test:admin-live` で Phase 4 の実環境テストを実行できます。このテストは一時的な管理者・一般ユーザーを Auth に作成し、管理 API、直接 DB アクセス、論理削除・復元、権限取り消しを確認してから検証データを削除します。既存の備品・履歴は変更しません。テストは管理番号の採番シーケンスを進めます。本番データへの移行前に検証専用プロジェクトで実行してください。

## 写真の登録と確認

`20260928000400_photos.sql` は非公開の `equipment-photos` Storage バケットを作成し、`20260928000500_photo_size_limit.sql` が1枚4MBまでの JPEG・PNG・WebP に制限します。これは [Vercel Function の 4.5 MB ペイロード上限](https://vercel.com/docs/functions/limitations)より小さい設定です。別途 Dashboard で公開バケットを作成する必要はありません。管理者は `/admin/equipments` の各備品の「写真」から複数枚を追加し、順番・代表画像を変更できます。削除済み備品の写真も「削除済み備品」から確認でき、備品を復元しても写真は維持されます。一般画面では一覧の代表写真と詳細の全写真を表示します。

Storage への直接アクセスは管理者 JWT と Storage Policy で制限します。一般画面の写真はアプリの読み取り専用 API を介して配信し、削除済み備品には公開しません。Secret Key はサーバー側だけで使用します。`npx supabase db query --linked --file supabase/check_photos.sql` でバケットが非公開、上限が `4194304` バイト、写真ポリシーと RPC が作成済みであることを確認できます。[Supabase の非公開バケットと RLS](https://supabase.com/docs/guides/storage/security/access-control)

検証専用プロジェクトでは、アプリ起動中に `npm run test:photos-live` を実行すると、一時的な備品・写真・Auth ユーザーを作成して、登録、閲覧、並び替え、代表画像、削除、論理削除・復元、匿名・一般ユーザーからの直接 Storage 操作拒否を検証し、最後に検証データを削除します。既存の備品と写真は変更しません。採番シーケンスは進みます。

## バックアップと復元

管理者が `/admin/backup` から **ZIP バックアップをダウンロード** できます。管理者の Supabase Auth セッションと許可リストをサーバーで毎回確認し、DB の RLS も適用します。匿名・一般部員には API を公開しません。Secret Key はサーバーの `.env.local` / Vercel 環境変数だけに置き、ブラウザに送信しません。ZIP はストリーム配信するため、Vercel Function のレスポンスサイズ上限を避けられます。大量データでは Function の実行時間上限に注意してください。

ZIP の中身は `metadata.json`、`equipments.csv`、`categories.json`、`locations.json`、`members.json`、`equipments.json`、`equipment_components.json`、`equipment_images.json`、`movement_history.json`、`photos/<storage_path>` です。JSON には論理削除済み備品とその写真・履歴も含め、行の ID と日時を保持します。`metadata.json` に `archive_format`、`backup_format_version`、アプリが前提とする migration の `schema_version`、`app_version`、開始・完了日時、各テーブルの件数、写真件数を記録します。運用前に `npx supabase db push --dry-run` で実 DB と migration の一致も確認してください。`equipments.csv` は閲覧・表計算用で、復元には JSON を使います。CSV 単体も同じ画面から取得できます。

書き出しは読み取り専用です。テーブルと写真を順番に読むため、**バックアップ中は備品の移動・管理変更を止めてください**。完了した ZIP は手元で `unzip -t backup-YYYYMMDDHHMMSS.zip` を実行し、エラーがないことを確かめます。途中で通信・写真取得に失敗した場合は不完全な ZIP になり、この検査で検出できます。ZIP は写真を圧縮せずに格納するため、十分な保存容量を確保してください。管理者の Auth アカウント、パスワード、API キーはバックアップ対象外です。

### 新しい Supabase プロジェクトへ復元する手順

1. バックアップ ZIP を `unzip -t` で検査し、空の作業ディレクトリに展開します。内容は個人情報や写真を含むため、公開リポジトリへ置かないでください。
2. **新しい空の** Supabase プロジェクトを作成し、この ZIP の `metadata.json` の `schema_version` と一致するリポジトリの版で `npx supabase link --project-ref <新しいproject-ref>`、`npx supabase db push` を実行します。**seed は投入しません**。将来 schema が変わった場合は、該当版で復元してから新しい migration を適用します。形式の `backup_format_version` が未対応なら、対応する復元スクリプトを使用してください。
3. 上記「管理者の初期設定」に従い、**復元先に新しい管理者 Auth ユーザーを1人作成**し、`admin_users` に登録します。ZIP に旧 Auth ユーザーは含まれません。削除済み備品がある場合、旧 `deleted_by` はこの新しい管理者の UUID に置換して復元します。元の値は ZIP の JSON に残ります。
4. 復元先の Project URL と Secret Key を**手元の** `.env.local` に設定します。既存プロジェクトの設定を誤って使わないよう、URL を確認してください。Secret Key をチャットや Git に貼らないでください。
5. 展開したディレクトリを指定し、まず内容を検査します。`metadata.json` と7つの JSON の件数、写真ファイル、schema version を確認し、データは書き込みません。

   ```sh
   npm run restore:backup -- /path/to/extracted-backup
   ```

6. 復元先が空であることを確認して、実行します。削除済み備品がある場合は手順3の新しい管理者 UUID を指定します。処理は空の各テーブルにだけ挿入し、既存データは上書きしません。途中で失敗した場合は、**新しい空のプロジェクトからやり直してください**。

   ```sh
   npm run restore:backup -- /path/to/extracted-backup --apply --expected-project-ref <復元先project-ref> --deleted-by-id <新しい管理者のAuth UUID>
   ```

7. 復元先の SQL Editor で [reset_management_sequence.sql](supabase/reset_management_sequence.sql) を実行します。これを忘れると次に追加する備品の管理番号が重複する可能性があります。管理画面で備品・削除済み備品・全履歴・写真の件数と表示を確認します。`metadata.json` の `table_counts` と `photo_count` に一致することを確認してください。

検証専用プロジェクトでは、アプリ起動中に `npm run test:backup-live` を実行できます。一時的な管理者・一般ユーザー、論理削除済み備品と写真を作成し、ZIP の全7テーブル・CSV・写真・バージョン情報、バックアップ前後の件数、匿名・一般ユーザーの API 拒否を検証してから検証データを削除します。既存データは変更しませんが、採番シーケンスは進みます。

## 現在の操作確認

1. 佐藤を選び、`DJI RS 3` を開く。
2. 「移動する」→「自分が持つ」で、現在位置が佐藤、状態が貸出中、直近履歴が北倉庫→佐藤となることを確認する。
3. 「他の部員に渡す」→田中で、田中が所持中になることを確認する。
4. 「保管場所へ移す」→物理部室で、保管中に戻ることを確認する。

DB の移動関数が現在位置更新・状態更新・履歴追記を一つのトランザクションで処理します。古い画面からの操作は競合エラーを返します。

## セキュリティ上の前提

一般部員にログインを求めない仕様のため、ブラウザに保存した部員 ID は本人確認にはなりません。移動 API は入力値と登録済みの有効な部員・移動先を検証しますが、アプリ URL を知る第三者による部員のなりすましは防げません。公開範囲の制御が必要なら、学校のネットワーク制限等を運用時に検討してください。

DB の各テーブルは RLS を有効にしています。匿名ロールに直接読み書きの権限はありません。管理者の操作だけ、Supabase Auth の JWT と `admin_users` 許可リストに基づく RLS ポリシーで許可します。Secret Key は一般部員向け API のサーバー側だけで使用します。

## 開発コマンド

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm test`（ローカルのインメモリ PostgreSQL で migration と移動の受け入れ条件を確認）
- `npm run test:live`（実 Supabase の検証専用プロジェクトで一度だけ実行）
- `npm run test:search-live`（実データで一覧の検索処理を確認）
- `npm run test:admin-live`（実 Supabase の検証専用プロジェクトで管理者権限と CRUD を確認）
- `npm run test:photos-live`（実 Supabase で写真機能と Storage 権限を確認）
- `npm run test:backup-live`（実 Supabase で ZIP・CSV と一般ユーザーのアクセス拒否を確認）
- `npm run restore:backup -- <展開ディレクトリ>`（内容の検査のみ。`--apply` を付けると空の復元先へ書き込み）
- `npm run check:client-secret`（build 後、ローカル Secret Key がブラウザ配信用ファイルに含まれないことを確認）
