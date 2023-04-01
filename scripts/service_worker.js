self.addEventListener('install', e => {
    e.waitUntil(
        caches.open('minesweeper').then(cache => cache.addAll([
            '../settings.html',
            '../stylesheets/main.css',
            '../favicon.ico',
            '../index.html',
            '../images/flag.png',
            '../images/three.png',
            '../images/empty.png',
            '../images/mine.png',
            '../images/unknown.png',
            '../images/six.png',
            '../images/two.png',
            '../images/four.png',
            '../images/five.png',
            '../images/one.png',
            '../images/success.png',
            '../meta/favicon-16x16.png',
            '../meta/android-chrome-192x192.png',
            '../meta/apple-touch-icon.png',
            '../meta/android-chrome-512x512.png',
            '../meta/site.webmanifest',
            '../meta/favicon-32x32.png',
            '../scripts/grid.js',
            '../scripts/minesweeper.js',
        ])),
    );
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(response => response || fetch(e.request)),
    );
});
