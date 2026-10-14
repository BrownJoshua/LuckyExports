"""Builds order-journey.html: the 3D (Three.js) order journey, with the 2D version embedded as a fallback.

  python journey3d/build-journey.py

Inputs : order-journey-2d.html   (the 2D version: also reused for the HUD markup and styles)
         journey3d/app3d.js      (the 3D scene)
         journey3d/three.min.js  (Three.js r152, MIT licence: journey3d/LICENSE-three.txt)
Output : order-journey.html      (one self-contained file)
"""
import os, re

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
rd = lambda p: open(p, encoding='utf8').read()

page2d = rd(os.path.join(root, 'order-journey-2d.html'))
css = re.search(r'<style>(.*?)</style>', page2d, re.S).group(1)
hud = page2d[page2d.index('<a class="back"'):]
hud = hud[:hud.index('id="doneUi"')]
hud = hud + page2d[page2d.index('id="doneUi"'):].split('\n')[0]          # the done-ui block is one line
three = rd(os.path.join(here, 'three.min.js'))
app = rd(os.path.join(here, 'app3d.js'))

extra_css = """
#gl{position:absolute;inset:0;display:block}
#labels{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:15}
.lb{position:absolute;left:0;top:0;padding:8px 14px 8px 12px;border-radius:99px;background:#fff;color:#12301f;font-weight:700;font-size:.82rem;
  border:2px solid #12301f;white-space:nowrap;pointer-events:none;will-change:transform,opacity;opacity:0;box-shadow:0 8px 22px rgba(0,0,0,.28)}
.lb::before{content:"\\2713";display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:50%;background:#2f9d55;color:#fff;font-size:.7rem;margin-right:8px}
@media (max-width:700px){.lb{font-size:.7rem;padding:6px 10px 6px 8px}}
"""

fallback = page2d.replace('</script>', '<\\/script>')
assert '<!--' not in fallback, 'HTML comments inside the fallback would confuse the parser'

html = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>From order to delivery — Lucky Exports</title>
<meta name="description" content="Follow a Lucky Exports coconut order from the buyer's click to the importer's warehouse, in 3D: loading, port, sea and delivery.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Manrope:wght@500;600;700&display=swap" rel="stylesheet">
<style>""" + css + extra_css + """</style>
</head>
<body>
<div class="track" id="track">
  <div class="stage" id="stage">
    <canvas id="gl"></canvas>
    <div id="labels"></div>
    """ + hud + """
  </div>
</div>
<script>""" + three + """</script>
<script>""" + app + """</script>
<script type="text/plain" id="fb2d">""" + fallback + """</script>
</body>
</html>
"""
out = os.path.join(root, 'order-journey.html')
open(out, 'w', encoding='utf8').write(html)
print('wrote', out, round(os.path.getsize(out) / 1024), 'KB')
