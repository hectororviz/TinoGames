#!/usr/bin/env python3
"""Arte propio del juego (fondos y tuberías). Re-ejecutable: python3 gen_art.py
"""
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent

INK = (45, 32, 28, 255)
SKIN = (242, 211, 172, 255)
CAP = (210, 80, 70, 255)
HOOD = (70, 170, 170, 255)
HOOD_D = (50, 130, 130, 255)
POCKET = (150, 215, 215, 255)
JEANS = (70, 110, 160, 255)
BOOT = (110, 74, 46, 255)
PACK = (225, 140, 60, 255)
WHITE = (245, 242, 235, 255)
T = (0, 0, 0, 0)


def save_png(path, w, h, px):
    raw = b"".join(b"\x00" + b"".join(struct.pack("4B", *p) for p in row) for row in px)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    Path(path).write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    )


class C:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.p = [[T] * w for _ in range(h)]

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.p[y][x] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c)

    def disc(self, cx, cy, r, c):
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.px(x, y, c)

    def save(self, name):
        save_png(OUT / name, self.w, self.h, self.p)
        print("art/" + name)



def gen_sky():
    c = C(480, 270)
    for y in range(270):
        t = y / 269.0
        c.rect(0, y, 479, y, (
            int(110 + (205 - 110) * t),
            int(175 + (232 - 175) * t),
            int(225 + (242 - 225) * t), 255))
    c.disc(400, 52, 24, (250, 215, 160, 255))
    c.disc(400, 52, 18, (250, 232, 185, 255))
    c.disc(400, 52, 12, (253, 244, 212, 255))
    for bx, by, w in [(90, 60, 70), (250, 40, 90), (150, 120, 60)]:
        c.rect(bx, by, bx + w, by + 12, WHITE)
        c.disc(bx + 12, by + 4, 10, WHITE)
        c.disc(bx + w - 18, by + 2, 12, WHITE)
    c.save("bg_sky.png")



def gen_hills():
    c = C(480, 120)
    for x in range(480):
        h1 = int(50 + 30 * math.sin(2 * math.pi * 2 * x / 480.0 + 1.0))
        for y in range(120 - h1, 120):
            c.px(x, y, (110, 180, 120, 255))
    for x in range(480):
        h2 = int(30 + 18 * math.sin(2 * math.pi * 3 * x / 480.0))
        for y in range(120 - h2, 120):
            c.px(x, y, (85, 160, 105, 255))
    for i in range(12):  # arbolitos
        x = (i * 97 + 40) % 480
        for y in range(78, 96):
            hw = (y - 78) // 3
            c.rect(x - hw, y, x + hw, y, (50, 120, 80, 255))
        c.rect(x - 1, 96, x + 1, 104, BOOT)
    c.save("bg_hills.png")


PIPE = (46, 160, 90, 255)
PIPE_D = (28, 110, 60, 255)
PIPE_L = (120, 220, 150, 255)


def gen_pipes():
    """Tubería warp propia 16px: borde (boca) + cuerpo tileable."""
    rim = C(16, 16)
    rim.rect(0, 0, 15, 15, PIPE_D)
    rim.rect(1, 1, 14, 13, PIPE)
    rim.rect(3, 1, 5, 13, PIPE_L)
    rim.rect(1, 13, 14, 13, PIPE_D)
    rim.save("pipes/pipe-rim.png")
    body = C(16, 16)
    body.rect(0, 0, 15, 15, PIPE_D)
    body.rect(2, 0, 13, 15, PIPE)
    body.rect(4, 0, 6, 15, PIPE_L)
    body.save("pipes/pipe-body.png")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "pipes").mkdir(parents=True, exist_ok=True)
    gen_sky()
    gen_hills()
    gen_pipes()


if __name__ == "__main__":
    main()
