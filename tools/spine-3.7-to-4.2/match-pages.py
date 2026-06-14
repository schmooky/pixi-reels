#!/usr/bin/env python3
"""Recover atlas-page filenames for content-addressed asset dumps.

The source game's build pipeline renamed texture pages to content hashes,
but each .atlas still references the original page names (faces-0.png,
other-3.png, ...). The manifest that mapped names to hashes is not part of
the res/ dump, so this script reconstructs the mapping by content:

For every page declared in an atlas, score every candidate PNG (matching
dimensions) by how well its alpha channel correlates with the page's
declared region rectangles - pixels inside regions should be opaque,
pixels outside (atlas padding) transparent. The best-scoring PNG is the
page. A wrong match renders as visibly scrambled art, so eyeball the
result once.

Usage:
  python3 match-pages.py <atlas-file> <png-search-root>
"""
import sys, glob, os
from PIL import Image
import numpy as np


def parse_atlas(path):
    pages, cur = [], None
    lines = open(path).read().split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            cur = None
            i += 1
            continue
        if cur is None and not line.startswith(' ') and ':' not in line:
            cur = {'name': line.strip(), 'size': None, 'regions': []}
            pages.append(cur)
            i += 1
            while i < len(lines) and ':' in lines[i]:
                k, v = lines[i].split(':', 1)
                if k.strip() == 'size':
                    cur['size'] = tuple(int(x) for x in v.split(','))
                i += 1
            continue
        i += 1  # region name line
        attrs = {}
        while i < len(lines) and lines[i].startswith('  '):
            k, v = lines[i].split(':', 1)
            attrs[k.strip()] = v.strip()
            i += 1
        try:
            x, y = (int(t) for t in attrs['xy'].split(','))
            w, h = (int(t) for t in attrs['size'].split(','))
            if attrs.get('rotate') == 'true':
                w, h = h, w
            cur['regions'].append((x, y, w, h))
        except Exception:
            pass
    return pages


def score(img, page):
    if img.size != page['size']:
        return None
    a = np.asarray(img.getchannel('A')) > 8
    mask = np.zeros(a.shape, bool)
    for (x, y, w, h) in page['regions']:
        mask[y:y + h, x:x + w] = True
    inside = a[mask].mean() if mask.any() else 0.0
    outside = a[~mask].mean() if (~mask).any() else 0.0
    return float(inside - outside)


def main():
    atlas, root = sys.argv[1], sys.argv[2]
    pngs = {f: Image.open(f).convert('RGBA') for f in glob.glob(os.path.join(root, '**', '*.png'), recursive=True)}
    for page in parse_atlas(atlas):
        cands = sorted(
            ((s, f) for f, im in pngs.items() if (s := score(im, page)) is not None),
            reverse=True,
        )
        if not cands:
            print(f"{page['name']}: NO size match {page['size']}")
            continue
        best, runner = cands[0], (cands[1] if len(cands) > 1 else (0.0, '-'))
        print(f"{page['name']}: {best[1]}  (score {best[0]:.3f}, runner-up {runner[0]:.3f})")


main()
