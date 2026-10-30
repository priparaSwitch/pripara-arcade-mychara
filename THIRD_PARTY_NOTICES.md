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
# 시작용 QR 이미지

`public/images/new-character-qr.png`는 사용자가 공개 코드로 제공하고 배포에 사용하도록 지정한 QR 데이터를 동일하게 재작성한 이미지입니다. 입력 사진의 파일명·메타데이터는 포함하지 않습니다. 이 설명은 별도의 공식 출처나 프로젝트 전체 라이선스를 확인했다는 뜻이 아닙니다.

