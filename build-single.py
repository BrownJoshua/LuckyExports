"""Builds lucky-exports.html: one self-contained file (CSS, JS and images embedded).
Run:  python build-single.py   (after editing index.html / style.css / script.js)

Every photo is embedded exactly once, even when the page uses it in several places
(an <img> and a CSS background, for instance). A small script turns each one into a
blob: URL at load time and hands it to every place that needs it.
"""
import base64, os, re

here = os.path.dirname(os.path.abspath(__file__))
rd = lambda n: open(os.path.join(here, n), encoding='utf8').read()

html = rd('index.html')
css = rd('style.css')
js = rd('script.js')

MIME = {'.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}
imgdir = os.path.join(here, 'images')
names = {}
for f in sorted(os.listdir(imgdir)):
    stem, ext = os.path.splitext(f)
    if ext in MIME:
        names[stem] = f

# 1) point every reference at a placeholder
used = {}
def swap(text, pattern, repl):
    return re.sub(pattern, repl, text)

for stem, f in names.items():
    path = 'images/' + f
    if path in css:
        css = css.replace('url(%s)' % path, 'var(--i-%s)' % stem)
        used[stem] = True
    before = html
    html = html.replace('<img src="%s"' % path, '<img data-i="%s"' % stem)
    html = html.replace('srcset="%s"' % path, 'data-iset="%s"' % stem)
    if html != before:
        used[stem] = True

html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + css + '\n</style>')

# 2) embed each used image once, and wire it up at load time
def b64(f):
    with open(os.path.join(imgdir, f), 'rb') as fh:
        return base64.b64encode(fh.read()).decode()

table = ',\n'.join('  "%s":["%s","%s"]' % (s, MIME[os.path.splitext(names[s])[1]], b64(names[s])) for s in sorted(used))
loader = '''<script>
(function () {
  var IMG = {
%s
  };
  var root = document.documentElement;
  Object.keys(IMG).forEach(function (k) {
    var bin = atob(IMG[k][1]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([a], { type: IMG[k][0] }));
    root.style.setProperty('--i-' + k, 'url(' + url + ')');
    [].forEach.call(document.querySelectorAll('[data-iset="' + k + '"]'), function (n) { n.srcset = url; });
    [].forEach.call(document.querySelectorAll('img[data-i="' + k + '"]'), function (n) { n.src = url; });
  });
})();
</script>
''' % table

html = html.replace('<script src="script.js"></script>', loader + '<script>\n' + js + '\n</script>')

# ---- fold the order-journey page into the same file (opens as a full-screen overlay) ----
import json
journey = rd('order-journey.html')
journey = journey.replace('<a class="back" href="lucky-exports.html">← Lucky Exports</a>', '<a class="back" href="#" id="closeJ">← Back to site</a>')
journey = journey.replace('href="lucky-exports.html#contact"', 'href="#" id="ctaJ"')
journey = journey.replace('</body>', """<script>
document.getElementById('closeJ').addEventListener('click', function (e) { e.preventDefault(); parent.postMessage('lucky:close', '*'); });
document.getElementById('ctaJ').addEventListener('click', function (e) { e.preventDefault(); parent.postMessage('lucky:contact', '*'); });
</script>
</body>""")
html = html.replace('href="order-journey.html"', 'href="#journey" data-journey')
overlay = """
<div id="journeyOverlay" hidden style="position:fixed;inset:0;z-index:1000;background:#06150d">
  <iframe id="journeyFrame" title="From order to delivery: an animated journey" style="border:0;width:100%;height:100%;display:block"></iframe>
</div>
<script>
(function () {
  var JOURNEY = __JOURNEY__;
  var ov = document.getElementById('journeyOverlay'), fr = document.getElementById('journeyFrame'), loaded = false;
  function open() { if (!loaded) { fr.srcdoc = JOURNEY; loaded = true; } ov.hidden = false; document.documentElement.style.overflow = 'hidden'; }
  function close() { ov.hidden = true; document.documentElement.style.overflow = ''; }
  [].forEach.call(document.querySelectorAll('a[data-journey]'), function (a) { a.addEventListener('click', function (e) { e.preventDefault(); open(); }); });
  window.addEventListener('message', function (e) {
    if (e.data === 'lucky:close') close();
    if (e.data === 'lucky:contact') { close(); var c = document.getElementById('contact'); if (c) c.scrollIntoView({ behavior: 'smooth' }); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ov.hidden) close(); });
})();
</script>
"""
overlay = overlay.replace('__JOURNEY__', json.dumps(journey).replace('</', '<\/'))
html = html.replace('</body>', overlay + '</body>')

out = os.path.join(here, 'lucky-exports.html')
open(out, 'w', encoding='utf8').write(html)
print('wrote', out, round(os.path.getsize(out) / 1024), 'KB;', len(used), 'images embedded once each')
