#!/usr/bin/env python3
"""Arte cartoon del jueguito (estilo plano).
Genera en ../art/: kid.png (5 poses 48px), bg_sky.png, bg_hills.png.
Re-ejecutable: python3 gen_art.py
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


def draw_kid(c, ox, leg_ldx, leg_rdx, bob, arms_up, tuck):
    """Celda 48px en ox. Pies en y=46. Mirando a la derecha."""
    dy = -bob
    if tuck:  # piernas recogidas (salto)
        c.rect(ox + 19, 38 + dy, ox + 23, 43 + dy, JEANS)
        c.rect(ox + 24, 38 + dy, ox + 28, 43 + dy, JEANS)
    else:
        c.rect(ox + 19 + leg_ldx, 34 + dy, ox + 23 + leg_ldx, 44 + dy, JEANS)
        c.rect(ox + 24 + leg_rdx, 34 + dy, ox + 28 + leg_rdx, 44 + dy, JEANS)
        c.rect(ox + 19 + leg_ldx, 42 + dy, ox + 23 + leg_ldx, 46 + dy, BOOT)
        c.rect(ox + 24 + leg_rdx, 42 + dy, ox + 28 + leg_rdx, 46 + dy, BOOT)
    # Mochila (atrás = izquierda).
    c.rect(ox + 9, 20 + dy, ox + 15, 34 + dy, PACK)
    c.rect(ox + 9, 20 + dy, ox + 15, 23 + dy, INK)
    # Buzo.
    c.rect(ox + 16, 18 + dy, ox + 31, 36 + dy, HOOD)
    c.rect(ox + 16, 18 + dy, ox + 31, 21 + dy, HOOD_D)
    c.rect(ox + 20, 26 + dy, ox + 27, 32 + dy, POCKET)
    if arms_up:
        c.rect(ox + 14, 12 + dy, ox + 17, 22 + dy, HOOD_D)
        c.rect(ox + 30, 12 + dy, ox + 33, 22 + dy, HOOD_D)
        c.px(ox + 15, 11 + dy, SKIN)
        c.px(ox + 31, 11 + dy, SKIN)
    else:
        c.rect(ox + 12, 20 + dy, ox + 15, 30 + dy, HOOD_D)
        c.rect(ox + 32, 20 + dy, ox + 35, 28 + dy, HOOD_D)
        c.px(ox + 13, 31 + dy, SKIN)
        c.px(ox + 33, 29 + dy, SKIN)
    # Cabeza + gorra.
    c.disc(ox + 24, 11 + dy, 10, INK)
    c.disc(ox + 24, 11 + dy, 9, SKIN)
    c.disc(ox + 24, 8 + dy, 9, CAP)  # gorra arriba
    c.rect(ox + 15, 7 + dy, ox + 33, 9 + dy, CAP)
    c.rect(ox + 28, 9 + dy, ox + 38, 12 + dy, CAP)  # visera
    c.rect(ox + 23, 2 + dy, ox + 25, 5 + dy, INK)  # botón
    # Cara mirando a la derecha.
    c.rect(ox + 26, 10 + dy, ox + 30, 13 + dy, WHITE)
    c.rect(ox + 28, 11 + dy, ox + 29, 13 + dy, INK)
    c.rect(ox + 24, 16 + dy, ox + 29, 17 + dy, INK)  # sonrisa


def gen_kid():
    c = C(48 * 5, 48)
    poses = [
        (0, 0, 0, False, False),    # idle
        (-3, 3, 1, False, False),   # run 0
        (3, -3, 0, False, False),   # run 1
        (0, 0, 0, True, True),      # jump
        (0, 0, 0, False, False),    # fall (piernas abajo, brazos abajo)
    ]
    for i, (ll, lr, bob, up, tuck) in enumerate(poses):
        draw_kid(c, i * 48, ll, lr, bob, up, tuck)
    c.save("kid.png")


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


def gen_heart():
    c = C(14, 14)
    for y, row in enumerate([".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."]):
        for x, ch in enumerate(row):
            if ch == "X":
                c.rect(x * 2, 1 + y * 2, x * 2 + 1, 2 + y * 2, (217, 69, 82, 255))
    c.px(2, 3, WHITE)
    c.px(3, 3, WHITE)
    c.save("heart.png")


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
    gen_kid()
    gen_sky()
    gen_hills()
    gen_heart()
    gen_pipes()


if __name__ == "__main__":
    main()
