<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\URL;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // php-wasm + Service Worker 環境では、ブラウザ側が iframe を /laravel スコープで
        // 動かす。生成するURL(リンク/リダイレクト)に /laravel を付けるため、
        // APP_URL(= 実オリジン + /laravel、JS が起動時に .env へ書き込む)をルートに強制する。
        $appUrl = config('app.url');
        if ($appUrl) {
            URL::forceRootUrl($appUrl);
        }
    }
}
