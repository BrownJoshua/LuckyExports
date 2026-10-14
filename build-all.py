"""Rebuilds everything after an edit:  python build-all.py
  1. order-journey.html      (3D journey + 2D fallback)     <- journey3d/build-journey.py
  2. lucky-exports.html      (the whole site in ONE file)   <- build-single.py
  3. dist/ and the zip       (for hosting)                  <- build-dist.py
"""
import subprocess, sys, os
here = os.path.dirname(os.path.abspath(__file__))
for script in ('journey3d/build-journey.py', 'build-single.py', 'build-dist.py'):
    print('>>', script)
    subprocess.run([sys.executable, os.path.join(here, script)], check=True)
