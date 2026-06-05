<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// ──────────────────────────────────────────────────────────────
// ナビゲーション検証用のミニサイト（/app 配下）。
// iframe 内でリンクをクリックして「ページ遷移」できることを示す。
// リンクは url() で生成 → Service Worker のスコープ(/laravel)が自動で付く。
// ──────────────────────────────────────────────────────────────
function demo_layout(string $title, string $bodyHtml): string
{
    $nav = collect([
        '/app' => 'ホーム',
        '/app/about' => 'このデモについて',
        '/app/users' => 'ユーザー一覧(DB)',
        '/app/counter' => 'カウンタ(セッション)',
    ])->map(fn ($label, $path) => sprintf('<a href="%s">%s</a>', url($path), $label))
      ->implode(' ｜ ');

    return <<<HTML
    <!doctype html><html lang="ja"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>{$title} — php-wasm Laravel</title>
    <style>
      body{font-family:system-ui,sans-serif;margin:0;background:#f6f7fb;color:#1a1a2e}
      header{background:#FF2D20;color:#fff;padding:14px 20px}
      header h1{font-size:18px;margin:0}
      nav{background:#fff;padding:12px 20px;border-bottom:1px solid #e5e7eb}
      nav a{color:#2563eb;text-decoration:none;font-size:14px}
      nav a:hover{text-decoration:underline}
      main{padding:24px 20px;max-width:720px}
      .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:18px;margin-bottom:16px}
      .badge{display:inline-block;background:#111;color:#fff;border-radius:6px;padding:2px 8px;font-size:12px}
      table{border-collapse:collapse;width:100%}
      td,th{border:1px solid #e5e7eb;padding:6px 10px;text-align:left;font-size:14px}
      .btn{display:inline-block;background:#2563eb;color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none}
    </style></head><body>
      <header><h1>🐘 php-wasm で動く Laravel ミニサイト</h1></header>
      <nav>{$nav}</nav>
      <main>{$bodyHtml}</main>
    </body></html>
    HTML;
}

Route::get('/app', function () {
    $body = '<div class="card"><span class="badge">サーバー無し / WASM</span>'
        . '<h2>ホーム</h2><p>このページは <b>ブラウザ内の Laravel ' . app()->version()
        . '</b>（PHP ' . PHP_VERSION . ' / SAPI=' . php_sapi_name()
        . '）が生成しています。上のリンクで実際にページ遷移できます — '
        . '遷移のたびに Service Worker が WASM の Laravel へリクエストを中継しています。</p>'
        . '<p><a class="btn" href="' . url('/app/users') . '">DBページへ →</a></p></div>';
    return demo_layout('ホーム', $body);
});

Route::get('/app/about', function () {
    $body = '<div class="card"><h2>このデモについて</h2>'
        . '<p>リンクをクリックすると iframe が <code>' . url('/app/...') . '</code> を要求し、'
        . 'Service Worker がそれを横取りして <code>PHPRequestHandler.request()</code> に渡します。'
        . 'PHP の実処理はすべてブラウザ内の WebAssembly で完結します。</p>'
        . '<p>現在時刻（PHP側生成）: <b>' . now()->toIso8601String() . '</b></p></div>';
    return demo_layout('About', $body);
});

Route::get('/app/users', function () {
    $rows = \Illuminate\Support\Facades\DB::table('users')->get();
    $trs = $rows->map(fn ($u) => "<tr><td>{$u->id}</td><td>{$u->name}</td><td>{$u->email}</td></tr>")->implode('');
    if ($trs === '') {
        $trs = '<tr><td colspan="3">まだユーザーがいません。下のボタンで作成できます。</td></tr>';
    }
    $body = '<div class="card"><h2>ユーザー一覧（SQLite）</h2>'
        . '<table><tr><th>ID</th><th>名前</th><th>メール</th></tr>' . $trs . '</table>'
        . '<p style="margin-top:14px"><a class="btn" href="' . url('/app/users/seed') . '">＋ テストユーザーを1人追加</a></p>'
        . '<p>ブラウザ内 SQLite への INSERT/SELECT がそのまま動きます。</p></div>';
    return demo_layout('Users', $body);
});

Route::get('/app/users/seed', function () {
    $n = \Illuminate\Support\Facades\DB::table('users')->count() + 1;
    \Illuminate\Support\Facades\DB::table('users')->insert([
        'name' => "テスト太郎{$n}",
        'email' => "test{$n}@example.com",
        'password' => bcrypt('password'),
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    return redirect(url('/app/users'));
});

Route::get('/app/counter', function () {
    $count = session('count', 0) + 1;
    session(['count' => $count]);
    $body = '<div class="card"><h2>カウンタ（セッション）</h2>'
        . '<p>このページを開いた回数: <b style="font-size:28px">' . $count . '</b></p>'
        . '<p><a class="btn" href="' . url('/app/counter') . '">もう一度開く（+1）</a></p>'
        . '<p>Laravel のセッション（ファイルドライバ）も VFS 上で機能しています。</p></div>';
    return demo_layout('Counter', $body);
});

// php-wasm 検証用に追加したルート。
// DB(SQLite)・mb_*・config 取得まで通ることを一度に確かめる。
Route::get('/demo', function () {
    return response()->json([
        'ok' => true,
        'framework' => 'Laravel ' . app()->version(),
        'php' => PHP_VERSION,
        'sapi' => php_sapi_name(),
        'db_connection' => config('database.default'),
        'users_count' => \Illuminate\Support\Facades\DB::table('users')->count(),
        'mb_check' => mb_strtoupper('ブラウザ内laravel'),
        'time' => now()->toIso8601String(),
    ]);
});
