import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw  # noqa: E402

import extract_motifs as em  # noqa: E402


def sample_ink():
    im = Image.new('L', (120, 120), 255)
    d = ImageDraw.Draw(im)
    d.ellipse([20, 10, 80, 70], outline=0, width=3)  # ring centred (50, 40), r = 30
    d.line([(50, 70), (50, 119)], fill=0, width=3)   # stem running to the crop edge
    d.ellipse([46, 36, 54, 44], fill=0)               # centre dot (interior ink)
    return em.ink_mask(im, 140)


class ExtractTests(unittest.TestCase):
    def test_silhouette_fills_ring_and_drops_stem(self):
        sil = em.silhouette(sample_ink(), 1, 2)
        area = sum(1 for v in sil.tobytes() if v)
        self.assertAlmostEqual(area, math.pi * 30 ** 2, delta=300)
        self.assertEqual(sil.getpixel((50, 100)), 0)
        self.assertEqual(sil.getpixel((50, 40)), 255)

    def test_seed_selects_the_component_under_it(self):
        im = Image.new('L', (200, 100), 255)
        d = ImageDraw.Draw(im)
        d.ellipse([10, 10, 90, 90], outline=0, width=3)    # big ring on the left
        d.ellipse([130, 30, 170, 70], outline=0, width=3)  # small ring on the right
        ink = em.ink_mask(im, 140)
        self.assertEqual(em.silhouette(ink, 1, 2).getpixel((50, 50)), 255)
        picked = em.silhouette(ink, 1, 2, seed=(150, 50))
        self.assertEqual(picked.getpixel((150, 50)), 255)
        self.assertEqual(picked.getpixel((50, 50)), 0)

    def test_interior_ink_keeps_centre_dot_only(self):
        ink = sample_ink()
        inner = em.interior_ink(ink, em.silhouette(ink, 1, 2), 3)
        self.assertEqual(inner.getpixel((50, 40)), 255)
        self.assertEqual(inner.getpixel((21, 40)), 0)

    def test_trace_keeps_image_orientation(self):
        rings = em.trace(em.silhouette(sample_ink(), 1, 2))
        ys = [y for r in rings for _, y in r]
        self.assertLess(min(ys), 15)
        self.assertGreater(max(ys), 65)
        self.assertLess(max(ys), 80)

    def test_rdp_keeps_corners_of_a_closed_ring(self):
        square = [(0, 0), (5, 0), (10, 0), (10, 5), (10, 10), (5, 10), (0, 10), (0, 5), (0, 0)]
        out = em.rdp(square, 0.4)
        for corner in [(10, 0), (10, 10), (0, 10)]:
            self.assertIn(corner, out)
        self.assertNotIn((5, 0), out)

    def test_normalise_puts_anchor_at_origin_and_direction_on_x(self):
        out = em.normalise([[(10, 10), (20, 10), (10, 20)]], (10, 10), 90, 10)
        self.assertEqual(out[0][0], [0, 0])
        self.assertAlmostEqual(out[0][2][0], 1)
        self.assertAlmostEqual(out[0][2][1], 0, places=6)


if __name__ == '__main__':
    unittest.main()
