"""Builds dist/ (and lucky-exports-site.zip): the folder to upload to a web host.
Run:  python build-dist.py   (after editing index.html / style.css / script.js)

Unlike lucky-exports.html (one file, for sending around), this keeps the CSS, JS and
images as separate files so the browser can cache them and load them in parallel.
"""
import os, re, shutil, zipfile

here = os.path.dirname(os.path.abspath(__file__))
dist = os.path.join(here, 'dist')
rd = lambda n: open(os.path.join(here, n), encoding='utf8').read()

DOMAIN = 'https://www.luckyexports.example'   # change to the real domain before going live

if os.path.isdir(dist):
    shutil.rmtree(dist)
os.makedirs(os.path.join(dist, 'images'))

html, css = rd('index.html'), rd('style.css')

# only ship the images the page actually references
used = set(re.findall(r'images/([A-Za-z0-9._-]+)', html + css))
for name in sorted(used):
    src = os.path.join(here, 'images', name)
    if os.path.isfile(src):
        shutil.copy2(src, os.path.join(dist, 'images', name))

# light CSS minify (comments + blank space); the JS is left readable on purpose
css_min = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
css_min = re.sub(r'\s*\n\s*', '', css_min)
open(os.path.join(dist, 'style.css'), 'w', encoding='utf8').write(css_min)
shutil.copy2(os.path.join(here, 'script.js'), os.path.join(dist, 'script.js'))
open(os.path.join(dist, 'index.html'), 'w', encoding='utf8').write(html)
journey = rd('order-journey.html').replace('lucky-exports.html', 'index.html')
open(os.path.join(dist, 'order-journey.html'), 'w', encoding='utf8').write(journey)

open(os.path.join(dist, 'robots.txt'), 'w').write('User-agent: *\nAllow: /\nSitemap: %s/sitemap.xml\n' % DOMAIN)
open(os.path.join(dist, 'sitemap.xml'), 'w').write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    '  <url><loc>%s/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>\n'
    '  <url><loc>%s/order-journey.html</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>\n</urlset>\n' % (DOMAIN, DOMAIN))
# Netlify: long cache for images/css/js, security headers
open(os.path.join(dist, '_headers'), 'w').write(
    '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n'
    '/images/*\n  Cache-Control: public, max-age=31536000, immutable\n'
    '/style.css\n  Cache-Control: public, max-age=86400\n/script.js\n  Cache-Control: public, max-age=86400\n')

zpath = os.path.join(here, 'lucky-exports-site.zip')
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(dist):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, dist))

total = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(dist) for f in fs)
print('dist/ ready:', len(used), 'images,', round(total / 1024), 'KB total ->', zpath)
