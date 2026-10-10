#!/usr/bin/env python3
"""Extract hand-drawn motifs from line-art PNGs into normalised vector shapes.

Usage: python3 tools/extract_motifs.py [manifest] [out_json] [preview_png]

Each motif yields a silhouette (ink + enclosed areas, thin stems removed) and interior ink
detail, traced with potrace and normalised so the anchor is the origin, the attach direction
is +x and the silhouette's furthest point is at distance 1.
"""
import json
import math
import os
import subprocess
import sys
import tempfile
from collections import deque

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def ink_mask(img, threshold):
    """255 where the pixel is ink (darker than threshold)."""
    return img.convert('L').point(lambda v: 255 if v < threshold else 0)


def dilate(mask, r):
    return mask.filter(ImageFilter.MaxFilter(2 * r + 1)) if r > 0 else mask


def erode(mask, r):
    return mask.filter(ImageFilter.MinFilter(2 * r + 1)) if r > 0 else mask


def pick_component(mask, seed=None):
    """Keeps the component containing `seed` (x, y) if it lies on one, else the largest."""
    w, h = mask.size
    px = mask.tobytes()
    label = [0] * (w * h)
    best, best_size, cur = 0, 0, 0
    for i in range(w * h):
        if not px[i] or label[i]:
            continue
        cur += 1
        size = 0
        q = deque([i])
        label[i] = cur
        while q:
            j = q.popleft()
            size += 1
            x, y = j % w, j // w
            for k in (j - 1 if x > 0 else -1, j + 1 if x < w - 1 else -1,
                      j - w if y > 0 else -1, j + w if y < h - 1 else -1):
                if k >= 0 and px[k] and not label[k]:
                    label[k] = cur
                    q.append(k)
        if size > best_size:
            best, best_size = cur, size
    if seed is not None:
        sx, sy = int(seed[0]), int(seed[1])
        if 0 <= sx < w and 0 <= sy < h and label[sy * w + sx]:
            best = label[sy * w + sx]
    out = Image.new('L', (w, h), 0)
    out.putdata([255 if best and lab == best else 0 for lab in label])
    return out


def silhouette(ink, close_r, open_r, seed=None):
    """Ink plus everything it encloses; an opening drops thin stems and whiskers."""
    closed = erode(dilate(ink, close_r), close_r)
    w, h = closed.size
    padded = Image.new('L', (w + 2, h + 2), 0)
    padded.paste(closed, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), 128)
    sil = padded.crop((1, 1, w + 1, h + 1)).point(lambda v: 0 if v == 128 else 255)
    sil = dilate(erode(sil, open_r), open_r)
    return pick_component(sil, seed)


def interior_ink(ink, sil, stroke_r):
    return ImageChops.multiply(ink, erode(sil, stroke_r))


def trace(mask, turd=8, alphamax=1.0):
    """potrace a 255-foreground mask; returns rings in image coordinates (y down)."""
    with tempfile.TemporaryDirectory() as d:
        pbm = os.path.join(d, 'm.pbm')
        out = os.path.join(d, 'm.json')
        mask.point(lambda v: 0 if v else 255).convert('1', dither=Image.Dither.NONE).save(pbm)
        subprocess.run(['potrace', pbm, '-b', 'geojson', '-t', str(turd), '-a', str(alphamax), '-o', out],
                       check=True)
        with open(out) as f:
            data = json.load(f)
    h = mask.size[1]
    rings = []
    for feat in data['features']:
        geom = feat['geometry']
        polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
        for poly in polys:
            for ring in poly:
                rings.append([(x, h - y) for x, y in ring])  # potrace geojson is y-up
    return rings


def rdp(points, eps):
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = points[i]
        bx, by = points[j]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        best, idx = 0.0, -1
        for k in range(i + 1, j):
            px, py = points[k]
            # Closed rings start and end on the same point: fall back to distance from it.
            dd = abs(dy * (px - ax) - dx * (py - ay)) / length if length > 1e-9 else math.hypot(px - ax, py - ay)
            if dd > best:
                best, idx = dd, k
        if best > eps:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(points, keep) if k]


def normalise(rings, anchor, angle_deg, scale):
    a = math.radians(angle_deg)
    ca, sa = math.cos(-a), math.sin(-a)
    ax, ay = anchor
    out = []
    for ring in rings:
        pts = []
        for x, y in ring:
            dx, dy = x - ax, y - ay
            pts.append([round((dx * ca - dy * sa) / scale, 4), round((dx * sa + dy * ca) / scale, 4)])
        out.append(pts)
    return out


def process(entry, root=ROOT):
    img = Image.open(os.path.join(root, entry['src'])).convert('L')
    x0, y0, x1, y1 = entry['box']
    crop = img.crop((x0, y0, x1, y1))
    if 'keep' in entry:
        m = Image.new('L', crop.size, 0)
        ImageDraw.Draw(m).polygon([(x - x0, y - y0) for x, y in entry['keep']], fill=255)
        crop = Image.composite(crop, Image.new('L', crop.size, 255), m)
    ink = ink_mask(crop, entry.get('threshold', 140))
    seed = (entry['seed'][0] - x0, entry['seed'][1] - y0) if 'seed' in entry else None
    sil = silhouette(ink, entry.get('close', 1), entry.get('open', 2), seed)
    inner = interior_ink(ink, sil, entry.get('stroke', 3))
    sil_rings = [rdp(r, 0.4) for r in trace(sil)]
    ink_rings = [rdp(r, 0.4) for r in trace(inner, turd=4)]
    if not sil_rings:
        raise ValueError(f"{entry['id']}: empty silhouette")
    anchor = (entry['anchor'][0] - x0, entry['anchor'][1] - y0)
    extent = max(math.hypot(x - anchor[0], y - anchor[1]) for r in sil_rings for x, y in r)
    motif = {
        'id': entry['id'],
        'type': entry['type'],
        'presets': entry['presets'],
        'baseSize': entry['size'],
        'silhouette': [r for r in normalise(sil_rings, anchor, entry['angle'], extent) if len(r) >= 3],
        'ink': [r for r in normalise(ink_rings, anchor, entry['angle'], extent) if len(r) >= 3],
    }
    return motif, (crop, sil, inner, anchor, entry['angle'])


def preview_tile(entry, debug, tile=220):
    crop, sil, inner, anchor, angle = debug
    base = crop.convert('RGB')
    green = Image.new('RGB', base.size, (60, 170, 90))
    red = Image.new('RGB', base.size, (220, 40, 40))
    base = Image.composite(Image.blend(base, green, 0.45), base, sil)
    base = Image.composite(red, base, inner)
    d = ImageDraw.Draw(base)
    ax, ay = anchor
    d.ellipse([ax - 4, ay - 4, ax + 4, ay + 4], fill=(0, 0, 255))
    a = math.radians(angle)
    d.line([(ax, ay), (ax + math.cos(a) * 30, ay + math.sin(a) * 30)], fill=(0, 0, 255), width=2)
    base.thumbnail((tile, tile - 20))
    out = Image.new('RGB', (tile, tile), (255, 255, 255))
    out.paste(base, ((tile - base.width) // 2, 0))
    ImageDraw.Draw(out).text((4, tile - 16), f"{entry['id']} ({entry['type']})", fill=(0, 0, 0))
    return out


def main(argv):
    manifest = argv[1] if len(argv) > 1 else os.path.join(HERE, 'motif_regions.json')
    out_json = argv[2] if len(argv) > 2 else os.path.join(ROOT, 'prototype', 'assets', 'motifs.json')
    preview = argv[3] if len(argv) > 3 else os.path.join(HERE, 'out', 'preview.png')
    with open(manifest) as f:
        entries = json.load(f)
    motifs, tiles = [], []
    for entry in entries:
        motif, debug = process(entry)
        motifs.append(motif)
        tiles.append(preview_tile(entry, debug))
        print(f"{motif['id']}: {len(motif['silhouette'])} silhouette rings, {len(motif['ink'])} ink rings")
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, 'w') as f:
        json.dump(motifs, f, separators=(',', ':'))
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 220, max(1, rows) * 220), (255, 255, 255))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * 220, (i // cols) * 220))
    os.makedirs(os.path.dirname(preview), exist_ok=True)
    sheet.save(preview)
    print(f"wrote {len(motifs)} motifs to {out_json}; preview at {preview}")


if __name__ == '__main__':
    main(sys.argv)
