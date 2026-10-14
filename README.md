# Lucky Export

Website for **Lucky Export**, a semi-husked coconut exporter in Namakkal, Tamil Nadu.

- `index.html`, `style.css`, `script.js`: the main site (hero ship scene, product sequence, export process, freight terms, FAQ, contact form)
- `order-journey.html`: the order-to-delivery journey as a 3D scroll film (Three.js, low-poly, cinematic camera). It carries the 2D version inside it and switches to that automatically when WebGL is missing or the device is too slow. Opened from the "Watch an order travel" button
- `order-journey-2d.html`: the original flat 2D journey (also the fallback)
- `journey3d/`: source of the 3D journey (`app3d.js`, Three.js r152 `three.min.js` with its MIT licence) and `build-journey.py`
- `images/`: photos used by the site
- `lucky-exports.html`: the whole site as ONE self-contained file (photos and the order journey embedded; the journey opens from the "Watch an order travel" button), good for sending around. Rebuild everything with `python build-all.py`
- `dist/`: deploy-ready folder for hosting (Netlify, GitHub Pages, ...). (rebuilt by `python build-all.py`)

Contact details in the site are placeholders. Replace the phone, email and domain before going live.
