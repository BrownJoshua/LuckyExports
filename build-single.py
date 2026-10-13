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

# ---- fold the order-journey page into the same file ----
# It plays inside the page's own scroll: the main script sends it the scroll progress.
import json
NL = chr(10)
BS = chr(92)
journey = rd('order-journey.html').replace('<head>', '<head>' + NL + '<script>window.__EMBED=true;</script>', 1)
html, n = re.subn(r'(<iframe id="ojFrame"[^>]*?) src="order-journey[.]html[?]embed=1"', lambda m: m.group(1), html)
assert n == 1, 'journey iframe not found'
doc = json.dumps(journey).replace('</', '<' + BS + '/')
html = html.replace('</body>', '<script>(function(){var f=document.getElementById("ojFrame");if(f)f.srcdoc=' + doc + ';})();</script>' + NL + '</body>')

out = os.path.join(here, 'lucky-exports.html')
open(out, 'w', encoding='utf8').write(html)
print('wrote', out, round(os.path.getsize(out) / 1024), 'KB;', len(used), 'images embedded once each')
