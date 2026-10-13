# Lucky Export

Website for **Lucky Export**, a semi-husked coconut exporter in Namakkal, Tamil Nadu.

- `index.html`, `style.css`, `script.js`: the main site (hero ship scene, product sequence, export process, freight terms, FAQ, contact form)
- `order-journey.html`: illustrated, scroll-driven order-to-delivery journey with a shipment tracker. It is embedded in the main page (an iframe driven by the page scroll) and also works on its own
- `images/`: photos used by the site
- `lucky-exports.html`: the whole site as ONE self-contained file (photos and the order journey embedded), good for sending around. Rebuild with `python build-single.py`
- `dist/`: deploy-ready folder for hosting (Netlify, GitHub Pages, ...). Rebuild with `python build-dist.py`

Contact details in the site are placeholders. Replace the phone, email and domain before going live.
