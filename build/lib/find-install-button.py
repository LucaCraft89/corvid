#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Finds the confirm button of the extension install dialog in a screenshot of
# the whole X screen (the dialog is native, so tests cannot click it through
# the page). The dialog is a bright box, 300-800 px wide, over the dimmed
# page; its confirm button is the right one in the button row at its bottom.
# Prints "x y" for xdotool, or nothing when no dialog is on screen.
import sys
from PIL import Image

img = Image.open(sys.argv[1]).convert('L')
w, h = img.size
px = img.load()
cx = w // 2


def bright(x, y):
    return 0 <= x < w and 0 <= y < h and px[x, y] >= 248


def dim(x, y):
    return 0 <= x < w and 0 <= y < h and px[x, y] <= 215


def run(y):
    """Left and right ends of the bright run through the centre of row y."""
    if not bright(cx, y):
        return None
    left = cx
    while bright(left - 1, y):
        left -= 1
    right = cx
    while bright(right + 1, y):
        right += 1
    return left, right


for bottom in range(h - 20, 60, -1):
    r = run(bottom - 8)
    if not r or not bright(cx, bottom) or not dim(cx, bottom + 8):
        continue
    left, right = r
    if not 300 <= right - left <= 800:
        continue
    # Dimmed page on both sides and below the box.
    if not dim(left - 12, bottom - 8) or not dim(right + 12, bottom - 8):
        continue
    if not dim(cx - 100, bottom + 10) or not dim(cx + 100, bottom + 10):
        continue
    print(right - 84 + 1, bottom - 38 + 1)
    break
