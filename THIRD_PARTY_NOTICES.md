# Third-party notices

## QR Code generator library

- Project: [Nayuki QR Code generator](https://www.nayuki.io/page/qr-code-generator-library)
- Source: [QR-Code-generator v1.8.0](https://github.com/nayuki/QR-Code-generator/releases/tag/v1.8.0)
- Author: Project Nayuki
- License: MIT; full text is in `vendor/qrcodegen/LICENSE.txt` and retained in the source header.
- Local adaptation: the official ES6 release is named `qrcodegen.mjs`, with `export {qrcodegen};` appended. Its original and adapted SHA-256 values are recorded in `vendor/qrcodegen/provenance.json`.

The deployed site uses a raw-byte QR segment without an ECI segment. It does not load a remote QR service, WebAssembly decoder, fonts, or analytics.

## Character part thumbnails and names

The small part-selection thumbnails and descriptive names are derived from the user's existing PriPara save-editor catalog. They are used as reference thumbnails for the unofficial character picker. Rights in PriPara and its artwork belong to their respective rights holders; the MIT license above applies to the QR library only, not to the game artwork.

The website does not include original game executables, models, large texture archives, personal saves, or real players' ticket templates. The payload codec is an independently implemented compatibility module. Automated fixtures are synthetic.
