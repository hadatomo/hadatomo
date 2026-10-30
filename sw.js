// 肌トモ：オフラインでも開けるようにする仕組み（サービスワーカー）
// ・アプリ本体（index.html）は、ネットにつながるときは毎回新しいものを取り、つながらないときは保存しておいたものを使う
// ・アイコンや薬局データは、一度読み込んだものを保存して使い回す
// ・ログイン・決済・検索などの外部サービスへの通信には関わらない（保存しない）
const CACHE = 'skinwise-v3';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  // 一時保存を使わずに、サーバーから最新を取って保存する
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 外部サービスは通常どおり
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (isPage) {
    // ページ本体：ネット優先（最新を表示）。つながらないときだけ保存したものを使う
    e.respondWith(
      // ブラウザの一時保存（最大10分）を使わず、毎回サーバーに最新か確認する（更新がすぐ反映されるように）
      // ※ ページを開く通信（navigate）はそのまま設定を変えられないので、URLから作り直して取りに行く
      fetch(new Request(url.origin + url.pathname + url.search, { cache: 'no-cache', credentials: 'same-origin' })).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); }
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // そのほか（アイコン・薬局データなど）：保存したものを先に使い、裏で新しくする
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }))
  );
});
