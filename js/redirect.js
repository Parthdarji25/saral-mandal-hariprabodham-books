// 404 fallback: send any unknown address to the app, keeping the page the visitor asked for as a hash route.
const base = location.pathname.replace(/[^/]*$/, '');
const rest = location.pathname.slice(base.length);
location.replace(base + (rest && rest !== '404.html' ? '#/' + rest.replace(/^\/+/, '') : ''));
