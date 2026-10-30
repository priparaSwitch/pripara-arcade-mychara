"""Build small character thumbnails from an existing editor export.

Requires Pillow with WebP support. Does not change the editor source.
Usage: python tools/prepare-assets.py --editor-dist PATH --report-dir PATH
The live website needs only the generated public/data and public/images files.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, features

CATEGORIES = ('face', 'hair', 'hairColor', 'eye', 'skin', 'glasses', 'accent')
DEFAULTS = dict(face=6, hair=1, hairColor=1, eye=1, skin=0, glasses=0, accent=0)
OUTFIT = [0, 40027, 40028, 40029]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def prepared(image, edge):
    image = image.convert('RGBA')
    box = image.getchannel('A').getbbox()
    if not box:
        raise ValueError('Empty thumbnail')
    image = image.crop(box)
    image.thumbnail((edge - 8, edge - 8), Image.Resampling.LANCZOS)
    result = Image.new('RGBA', (image.width + 8, image.height + 8))
    result.paste(image, (4, 4))
    return result


def encode(image, kind):
    out = io.BytesIO()
    if kind == 'webp64_flat':
        flat = Image.new('RGB', image.size, 'white')
        flat.paste(image, mask=image.getchannel('A'))
        flat.save(out, 'WEBP', quality=64, method=6)
    elif kind == 'webp64':
        image.save(out, 'WEBP', quality=64, method=6, exact=True)
    elif kind == 'webp_lossless':
        image.save(out, 'WEBP', lossless=True, method=6, exact=True)
    elif kind == 'jpeg65':
        flat = Image.new('RGB', image.size, 'white')
        flat.paste(image, mask=image.getchannel('A'))
        flat.save(out, 'JPEG', quality=65, optimize=True)
    elif kind == 'avif50':
        image.save(out, 'AVIF', quality=50, speed=6)
    else:
        raise ValueError(kind)
    return out.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--editor-dist', type=Path, required=True)
    parser.add_argument('--report-dir', type=Path, required=True)
    parser.add_argument('--comparison-cache', type=Path,
                        help='Optional prior comparison report for identical source images')
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public')
    args = parser.parse_args()
    source = args.editor_dist.resolve()
    output = args.output.resolve()
    if source == output or source in output.parents:
        raise ValueError('Output must be separate from the editor')
    args.report_dir.mkdir(parents=True, exist_ok=True)
    (output / 'images').mkdir(parents=True, exist_ok=True)
    (output / 'data').mkdir(parents=True, exist_ok=True)
    catalog_bytes = (source / 'data/catalog.json').read_bytes()
    compatibility_bytes = (source / 'data/arcade_compatibility.json').read_bytes()
    catalog = json.loads(catalog_bytes)
    compatibility = json.loads(compatibility_bytes)
    cache = {}
    if args.comparison_cache:
        cached = json.loads(args.comparison_cache.read_text(encoding='utf8'))
        cache = {(row['category'], row['id']): row for row in cached['images']}
    assert compatibility['version'] == 1 and compatibility['target'] == 'HK-UI-v3-app-myticket'
    for ident, category in zip(OUTFIT[1:], ('top', 'bottom', 'shoes')):
        row = compatibility['outfits'][str(ident)]
        assert row['supported'] and row['category'] == category and row['value'] == ident

    parts, rows, exclusions, seen_images = {}, [], [], {}
    sizes = (96, 128)
    formats = ('webp64', 'webp_lossless', 'jpeg65', 'webp64_flat') + (('avif50',) if features.check('avif') else ())
    totals = {f'{size}_{kind}': 0 for size in sizes for kind in formats}
    sample_rows = []
    for category in CATEGORIES:
        parts[category] = []
        for item in catalog['parts'][category]:
            proof = compatibility['parts'][category].get(str(item['id']), {})
            if not proof.get('supported'):
                exclusions.append({'category': category, 'id': item['id'], 'name': item['name'],
                                   'reason': proof.get('reason', 'No proven HK mapping')})
                continue
            source_image = source / item['image'].replace('assets_online/', 'assets/', 1)
            assert source in source_image.resolve().parents
            original_bytes = source_image.read_bytes()
            with Image.open(io.BytesIO(original_bytes)) as original:
                images = {size: prepared(original, size) for size in sizes}
            candidates = {}
            comparisons = {}
            cached = cache.get((category, item['id']), {})
            if cached.get('sourceSha256') != digest(original_bytes):
                cached = {}
            for size in sizes:
                for kind in formats:
                    key = f'{size}_{kind}'
                    prior = cached.get('comparisons', {}).get(key)
                    if prior is not None and kind != 'webp64_flat':
                        comparisons[key] = prior
                    else:
                        encoded = encode(images[size], kind)
                        candidates[key] = encoded
                        comparisons[key] = len(encoded)
                    totals[key] += comparisons[key]
            # White matte removes expensive transparent antialiasing noise.
            # These are fixed thumbnail cards, never character compositing layers.
            best = '128_webp64_flat'
            payload = candidates[best]
            payload_hash = digest(payload)
            image_name = seen_images.setdefault(payload_hash, f'{category}-{item["id"]}.webp')
            image_path = output / 'images' / image_name
            image_path.write_bytes(payload)
            with Image.open(image_path) as check:
                assert check.size == images[128].size
                assert check.mode == 'RGB'
            public = {'id': item['id'], 'name': item['name'], 'image': 'images/' + image_name, 'hkValue': proof['value']}
            if item.get('nameJa'):
                public['nameJa'] = item['nameJa']
            if category == 'face':
                public['model'] = proof['model']
            if proof.get('supportedFaceModels'):
                public['supportedFaceModels'] = proof['supportedFaceModels']
            parts[category].append(public)
            row = {'category': category, 'id': item['id'], 'name': item['name'],
                   'sourceRelative': str(source_image.relative_to(source)).replace('\\', '/'),
                   'sourceBytes': len(original_bytes), 'sourceSha256': digest(original_bytes),
                   'image': public['image'], 'bytes': len(payload), 'sha256': payload_hash,
                   'size': list(images[128].size), 'selected': best,
                   'comparisons': comparisons}
            rows.append(row)
            if len(sample_rows) < 14 and (len(parts[category]) <= 2):
                for key in ('128_webp64', '96_webp64_flat', '128_webp64_flat', '128_avif50' if 'avif50' in formats else '128_jpeg65'):
                    if key not in candidates:
                        size, kind = key.split('_', 1)
                        candidates[key] = encode(images[int(size)], kind)
                sample_rows.append((category, item['id'], images, candidates))
            assert source_image.read_bytes() == original_bytes
        assert any(item['id'] == DEFAULTS[category] for item in parts[category])

    document = {'version': 1, 'parts': parts, 'defaults': DEFAULTS, 'defaultOutfit': OUTFIT}
    serialized = (json.dumps(document, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf8')
    (output / 'data/parts.json').write_bytes(serialized)
    report = {'catalogSourceSha256': digest(catalog_bytes), 'compatibilitySourceSha256': digest(compatibility_bytes),
              'sourceUnchanged': True, 'count': len(rows), 'excluded': exclusions, 'images': rows,
              'counts': {key: len(value) for key, value in parts.items()},
              'totalImageBytes': sum((output / 'images' / name).stat().st_size for name in set(seen_images.values())),
              'uniqueImages': len(seen_images), 'catalogBytes': len(serialized),
              'categoryImageBytes': {key: sum(row['bytes'] for row in rows if row['category'] == key) for key in CATEGORIES},
              'formatComparisonBytes': totals,
              'decision': 'Trim transparent margins, add4px padding, max128px, white matte, WebP quality64 method6. White matte avoids alpha-channel payload overhead; cards are standalone thumbnails, not compositing layers. Originals remain unchanged. Compare96px/128px WebP(lossy/lossless), JPEG65 and AVIF50.',
              'defaultOutfit': OUTFIT,
              'limitations': ['HK mapping/asset verification is not an in-game scan test.', 'Unsupported mappings are excluded, not guessed.', 'Only one accent (none) has a proven mapping in the current editor manifest.']}
    (args.report_dir / 'assets-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    # QA sheet: original resized, selected WebP, 96px WebP, 128px AVIF/JPEG.
    columns = ['source128', 'white WebP128', 'white WebP96', 'avif128' if 'avif50' in formats else 'jpeg128']
    sheet = Image.new('RGB', (4 * 180, (len(sample_rows) + 1) * 160), '#fff7fb')
    draw = ImageDraw.Draw(sheet)
    for x, label in enumerate(columns):
        draw.text((x * 180 + 12, 8), label, fill='#222222')
    for index, (category, ident, images, candidates) in enumerate(sample_rows, 1):
        sources = [images[128], Image.open(io.BytesIO(candidates['128_webp64_flat'])), Image.open(io.BytesIO(candidates['96_webp64_flat'])), Image.open(io.BytesIO(candidates['128_avif50' if 'avif50' in formats else '128_jpeg65']))]
        for col, im in enumerate(sources):
            im = im.convert('RGBA')
            sheet.paste(im, (col * 180 + (180 - im.width) // 2, index * 160 + 22), im)
            draw.text((col * 180 + 8, index * 160 + 4), f'{category} {ident}', fill='#222222')
    sheet.save(args.report_dir / 'image-comparison.png')
    print(json.dumps({key: report[key] for key in ('count', 'counts', 'totalImageBytes', 'uniqueImages', 'catalogBytes', 'categoryImageBytes', 'formatComparisonBytes')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
