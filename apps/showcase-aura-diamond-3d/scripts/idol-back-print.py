"""Inpaint the invented shirt-back print inside a UV mask (called by idol-back-print.mjs).

usage: python3 -I idol-back-print.py base.png mask.png out.png
Ink = masked pixels whose colour is far from the masked region's median cloth colour (lines and fills of the number);
it is dilated a little and inpainted (Telea) so the fabric shading around it continues across.
"""
import sys

import cv2
import numpy as np

base_path, mask_path, out_path = sys.argv[1:4]
img = cv2.imread(base_path, cv2.IMREAD_COLOR)
region = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE) > 0
grow = max(5, img.shape[0] // 200) | 1
region = cv2.dilate(region.astype(np.uint8), np.ones((grow * 2 + 1, grow * 2 + 1), np.uint8)) > 0
lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
median = np.median(lab[region], axis=0)
dist = np.linalg.norm(lab - median, axis=2)
ink = region & (dist > 22)
ink = cv2.dilate(ink.astype(np.uint8) * 255, np.ones((grow, grow), np.uint8))
ink[~region] = 0
out = cv2.inpaint(img, ink, 7, cv2.INPAINT_TELEA)
cv2.imwrite(out_path, out)
print(f"region {int(region.sum())} px, ink {int((ink > 0).sum())} px")
