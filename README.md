# Lucky Export

Website for **Lucky Export**, a semi-husked coconut exporter in Namakkal, Tamil Nadu.

- `index.html`, `style.css`, `script.js`: the main site (hero ship scene, product sequence, export process, freight terms, FAQ, contact form)
- `order-journey.html`: illustrated, scroll-driven order-to-delivery journey with a shipment tracker. Opened from the "Watch an order travel" button (a separate page on the hosted site, a full-screen overlay inside the single file)
- `images/`: photos used by the site
- `lucky-exports.html`: the whole site as ONE self-contained file (photos and the order journey embedded; the journey opens from the "Watch an order travel" button), good for sending around. Rebuild with `python build-single.py`
- `dist/`: deploy-ready folder for hosting (Netlify, GitHub Pages, ...). Rebuild with `python build-dist.py`

Contact details in the site are placeholders. Replace the phone, email and domain before going live.
