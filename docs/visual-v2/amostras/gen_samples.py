# Folha de amostra de pixel art do office-imp em 32, 48 e 64 px por bloco.
# A mesma cena é desenhada em coordenadas de bloco; traços finos usam 1 px de arte,
# então quanto mais pixels por bloco, mais detalhe cabe (não é só ampliação).
import sys
from PIL import Image, ImageDraw, ImageFont

OUTLINE = (29, 21, 25, 255)


def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def shade(c, amt):
    r, g, b, a = c
    if amt >= 0:
        f = lambda v: round(v + (255 - v) * amt)
    else:
        f = lambda v: round(v * (1 + amt))
    return (f(r), f(g), f(b), a)


def mix(c1, c2, t):
    return tuple(round(c1[i] * (1 - t) + c2[i] * t) for i in range(3)) + (255,)


def noise(x, y, seed=0):
    h = (x * 374761393 + y * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h ^= h >> 16
    return (h % 1000) / 1000


class S:
    """Sprite com 1 px de margem para o contorno estilo Stardew."""

    def __init__(self, P, wt, ht):
        self.P = P
        self.im = Image.new('RGBA', (round(wt * P) + 2, round(ht * P) + 2), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def u(self, v):
        return round(v * self.P) + 1

    def rect(self, x, y, w, h, c):
        x0, y0, x1, y1 = self.u(x), self.u(y), self.u(x + w), self.u(y + h)
        if x1 > x0 and y1 > y0:
            self.d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)

    def prect(self, x, y, w, h, c):
        if w > 0 and h > 0:
            self.d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)

    def rrect(self, x, y, w, h, c, r=1):
        x0, y0, x1, y1 = self.u(x), self.u(y), self.u(x + w), self.u(y + h)
        if x1 <= x0 or y1 <= y0:
            return
        r = max(0, min(r, (x1 - x0 - 1) // 2, (y1 - y0 - 1) // 2))
        self.d.rectangle([x0, y0 + r, x1 - 1, y1 - 1 - r], fill=c)
        for i in range(r):  # cantos em degrau
            k = r - i
            self.d.rectangle([x0 + k, y0 + i, x1 - 1 - k, y0 + i], fill=c)
            self.d.rectangle([x0 + k, y1 - 1 - i, x1 - 1 - k, y1 - 1 - i], fill=c)

    def ellipse(self, x, y, w, h, c):
        x0, y0, x1, y1 = self.u(x), self.u(y), self.u(x + w), self.u(y + h)
        if x1 > x0 and y1 > y0:
            self.d.ellipse([x0, y0, x1 - 1, y1 - 1], fill=c)

    def px(self, x, y, c):
        if 0 <= x < self.im.width and 0 <= y < self.im.height:
            self.im.putpixel((x, y), c)

    def poly(self, pts, c):
        self.d.polygon([(self.u(x), self.u(y)) for x, y in pts], fill=c)

    def paste(self, spr, x, y):
        self.im.alpha_composite(spr.im if isinstance(spr, S) else spr, (self.u(x) - 1, self.u(y) - 1))


def outlined(s):
    im = s.im
    W, H = im.size
    src = im.load()
    out = im.copy()
    o = out.load()
    for y in range(H):
        for x in range(W):
            if src[x, y][3] > 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and src[nx, ny][3] > 0:
                    o[x, y] = mix(src[nx, ny], OUTLINE, 0.78)
                    break
    s.im = out
    return s


# ---------------------------------------------------------------- pisos e parede

def floor_chevron(P, wt, ht):
    s = S(P, wt, ht)
    W, H = round(wt * P), round(ht * P)
    cw = max(4, P // 4)  # largura da coluna
    pw = max(3, P // 8)  # largura da tábua
    tones = [hexc('#a8754a'), hexc('#b9875a'), hexc('#9c6b42'), hexc('#c19265')]
    for y in range(H):
        for x in range(W):
            col = x // cw
            xx = x % cw
            d = 1 if col % 2 == 0 else -1
            t = y + (xx if d == 1 else cw - 1 - xx)
            stripe = t // pw
            c = tones[int(noise(col, stripe, 7) * 4)]
            if t % pw == 0 or xx == 0:
                c = shade(c, -0.16)
            elif P >= 48 and noise(x, y, 3) > 0.985:
                c = shade(c, -0.1)  # veio da madeira
            s.im.putpixel((x + 1, y + 1), c)
    return s


def floor_cement(P, wt, ht):
    s = S(P, wt, ht)
    W, H = round(wt * P), round(ht * P)
    base = hexc('#9d9b96')
    cell = max(4, P // 3)

    def vn(x, y):
        gx, gy = x / cell, y / cell
        x0, y0 = int(gx), int(gy)
        fx, fy = gx - x0, gy - y0
        a = noise(x0, y0, 11); b = noise(x0 + 1, y0, 11)
        c = noise(x0, y0 + 1, 11); d = noise(x0 + 1, y0 + 1, 11)
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

    for y in range(H):
        for x in range(W):
            v = vn(x, y)
            c = base if 0.35 < v < 0.68 else shade(base, -0.06) if v <= 0.35 else shade(base, 0.07)
            if P >= 48 and noise(x, y, 5) > 0.992:
                c = shade(base, -0.14)
            if x % (2 * P) == 0 or y % (2 * P) == 0:
                c = shade(base, -0.16)  # junta a cada 2 blocos
            s.im.putpixel((x + 1, y + 1), c)
    return s


def tree(P, w):
    s = S(P, w, w * 1.3)
    p = 1 / P
    s.rect(w * 0.44, w * 0.8, w * 0.12, w * 0.5, hexc('#6b4a32'))
    g = [hexc('#3f7d3a'), hexc('#4f9445'), hexc('#2f6530')]
    s.ellipse(0, w * 0.1, w, w * 0.85, g[0])
    s.ellipse(w * 0.15, 0, w * 0.6, w * 0.55, g[1])
    s.ellipse(w * 0.05, w * 0.45, w * 0.45, w * 0.4, g[2])
    if P >= 48:
        for i in range(int(w * P / 3)):
            x = noise(i, 1, 2) * w * 0.9 + w * 0.05
            y = noise(i, 2, 2) * w * 0.7 + w * 0.12
            s.rect(x, y, 2 * p, p, shade(g[1], 0.15))
    return s


def wall_with_windows(P, wt, windows):
    s = S(P, wt, 1.5)
    p = 1 / P
    s.rect(0, 0, wt, 0.25, hexc('#2a2b31'))
    s.rect(0, 0.25, wt, 1.25, hexc('#d9d3c7'))
    s.rect(0, 0.25, wt, p * 2, hexc('#c7c0b2'))
    s.rect(0, 1.36, wt, 0.14, hexc('#5c4130'))  # rodapé
    s.rect(0, 1.36, wt, p, hexc('#7a5a44'))
    for wx in windows:
        x0, y0, ww, wh = wx, 0.38, 2, 0.88
        s.rect(x0, y0, ww, wh, hexc('#55585f'))  # caixilho
        gx, gy, gw, gh = x0 + 3 * p, y0 + 3 * p, ww - 6 * p, wh - 6 * p
        view = S(P, gw, gh)
        view.rect(0, 0, gw, gh * 0.45, hexc('#9fd3ee'))
        view.rect(0, gh * 0.28, gw, gh * 0.2, hexc('#b8e0f2'))
        view.rect(0, gh * 0.62, gw, gh * 0.38, hexc('#6aa84f'))
        view.rect(0, gh * 0.62, gw, p, hexc('#7dba5d'))
        for i, (tx, tw) in enumerate([(0.05, 0.42), (0.55, 0.55), (1.15, 0.4), (1.55, 0.5)]):
            if tx < gw:
                t = tree(P, tw)
                view.im.alpha_composite(t.im, (view.u(tx) - 1, view.u(gh * 0.7 - tw * 1.2) - 1))
        if P >= 48:
            view.rect(0.3, 0.08, 0.22, 0.05, hexc('#f4fbff'))
            view.rect(0.36, 0.05, 0.12, 0.04, hexc('#f4fbff'))
        crop = view.im.crop((1, 1, view.im.width - 1, view.im.height - 1))
        s.im.alpha_composite(crop, (s.u(gx), s.u(gy)))
        s.rect(x0 + ww / 2 - p, y0, 2 * p, wh, hexc('#55585f'))  # montante central
        s.rect(x0, y0 + wh - 2 * p, ww, 2 * p, hexc('#6b6e75'))
        s.rect(gx, gy, gw, p, hexc('#d6eef8'))  # reflexo
    return s


# ---------------------------------------------------------------- mobília

def desk(P, wt, top, top_hi, legs, edge=None):
    s = S(P, wt, 1)
    p = 1 / P
    s.rect(0, 0.08, wt, 0.56, top)
    s.rect(0, 0.08, wt, p, top_hi)
    if P >= 48:
        for i in range(int(wt * P / 6)):
            s.rect(noise(i, 3, 4) * (wt - 0.2) + 0.05, 0.12 + noise(i, 4, 4) * 0.45, 6 * p, p, shade(top, -0.05))
    s.rect(0, 0.64, wt, 0.14, shade(top, -0.25))
    if edge:
        s.rect(0, 0.64, wt, p * max(1, P // 32), edge)
    s.rect(0.06, 0.78, 0.08, 0.2, legs)
    s.rect(wt - 0.14, 0.78, 0.08, 0.2, legs)
    return outlined(s)


def monitor_ultrawide(P):
    s = S(P, 1.3, 0.62)
    p = 1 / P
    s.rect(0.55, 0.42, 0.2, 0.12, hexc('#2b2d33'))
    s.rect(0.42, 0.53, 0.46, 0.07, hexc('#34363d'))
    s.rect(0, 0, 1.3, 0.44, hexc('#18191d'))
    sx, sy, sw, sh = 2 * p, 2 * p, 1.3 - 4 * p, 0.44 - 5 * p
    s.rect(sx, sy, sw, sh, hexc('#253049'))  # céu do jogo
    s.rect(sx, sy + sh * 0.55, sw, sh * 0.45, hexc('#2f4a3a'))
    s.poly([(sx + 0.15, sy + sh * 0.55), (sx + 0.38, sy + sh * 0.15), (sx + 0.62, sy + sh * 0.55)], hexc('#3b4566'))
    s.poly([(sx + 0.5, sy + sh * 0.55), (sx + 0.8, sy + sh * 0.05), (sx + 1.1, sy + sh * 0.55)], hexc('#46527a'))
    s.rect(sx + 0.05, sy + 0.03, 0.22, 2 * p, hexc('#d94b4b'))  # barra de vida
    s.rect(sx + 0.05, sy + 0.03, 0.16, 2 * p, hexc('#5fd06a'))
    if P >= 48:
        s.rect(sx + sw - 0.12, sy + 0.03, 0.08, 0.08, hexc('#1b2236'))
        s.rect(sx + sw - 0.1, sy + 0.05, 2 * p, 2 * p, hexc('#f2c14e'))
        s.rect(sx + sw * 0.48, sy + sh * 0.7, 3 * p, 4 * p, hexc('#e8e2d5'))  # personagem
    s.rect(0.62, 0.44 - 2 * p, 0.06, p, hexc('#d94b4b'))  # led
    return outlined(s)


def pc_tower(P):
    s = S(P, 0.36, 0.72)
    p = 1 / P
    s.rect(0, 0, 0.36, 0.72, hexc('#1f2026'))
    s.rect(3 * p, 3 * p, 0.36 - 6 * p, 0.72 - 9 * p, hexc('#2c3140'))  # vidro
    fan_colors = [hexc('#7c5cff'), hexc('#38c7d9'), hexc('#7c5cff')]
    for i, c in enumerate(fan_colors):
        fy = 0.07 + i * 0.2
        s.ellipse(0.07, fy, 0.22, 0.17, c)
        s.ellipse(0.07 + 2 * p, fy + 2 * p, 0.22 - 4 * p, 0.17 - 4 * p, hexc('#1a1c24'))
        if P >= 48:
            s.rect(0.17, fy + 0.07, 2 * p, 2 * p, shade(c, 0.3))
    s.rect(0, 0.72 - 3 * p, 0.36, 3 * p, hexc('#15161a'))
    s.rect(0.32, 0.03, p, 0.08, hexc('#f2f2f2'))
    return outlined(s)


def keyboard_mech(P):
    s = S(P, 0.62, 0.15)
    s.rect(0, 0, 0.62, 0.15, hexc('#25262c'))
    W, H = round(0.62 * P), round(0.15 * P)
    ks = 2 if P < 48 else 3
    rgb = [hexc('#7c5cff'), hexc('#5a7dff'), hexc('#38c7d9')]
    for row, y in enumerate(range(2, H - 1, ks)):
        for x in range(2, W - 2, ks):
            c = hexc('#3a3c45') if (x // ks + row) % 7 else rgb[min(2, x * 3 // W)]
            s.prect(x + 1, y + 1, ks - 1, ks - 1, c)
    return outlined(s)


def mouse(P):
    s = S(P, 0.07, 0.11)
    s.rrect(0, 0, 0.07, 0.11, hexc('#2c2d33'), 1)
    s.rect(0.03, 0.01, 1 / P, 0.03, hexc('#7c5cff'))
    return outlined(s)


def laptop(P):
    s = S(P, 0.6, 0.5)
    p = 1 / P
    s.rect(0, 0, 0.6, 0.36, hexc('#c9ccd1'))  # tampa (prata, sem logo)
    s.rect(2 * p, 2 * p, 0.6 - 4 * p, 0.36 - 4 * p, hexc('#121317'))
    sx, sy, sw, sh = 3 * p, 3 * p, 0.6 - 6 * p, 0.36 - 6 * p
    s.rect(sx, sy, sw, sh, hexc('#e9ecf2'))  # janela de app
    s.rect(sx, sy, sw, max(p, 0.04), hexc('#d7b870'))
    s.rect(sx, sy, 0.12, sh, hexc('#2a2c33'))
    for i in range(3 if P < 48 else 5):
        s.rect(sx + 0.16, sy + 0.08 + i * 0.045, 0.22 - (i % 2) * 0.08, p, hexc('#9aa1ad'))
    s.rect(-0.02 + 0.02, 0.36, 0.6, 0.12, hexc('#d9dce0'))  # base
    s.rect(0, 0.36, 0.6, p, hexc('#b0b4ba'))
    if P >= 48:
        for x in range(4, round(0.6 * P) - 4, 2):
            for y in (round(0.39 * P), round(0.42 * P)):
                s.px(x + 1, y + 1, hexc('#9fa4ab'))
        s.rect(0.24, 0.44, 0.12, 0.03, hexc('#c4c8cd'))
    return outlined(s)


def mug(P):
    s = S(P, 0.13, 0.13)
    p = 1 / P
    s.rect(0, 0.02, 0.1, 0.11, hexc('#2f6f5e'))
    s.rect(0.1, 0.04, 0.03, 0.05, hexc('#2f6f5e'))
    s.rect(0.01, 0.02, 0.08, 2 * p, hexc('#4a2f22'))  # café
    if P >= 48:
        s.rect(0.02, 0.07, 0.06, p, hexc('#d7b870'))
    return outlined(s)


def postits(P):
    s = S(P, 0.2, 0.14)
    s.rect(0, 0.02, 0.11, 0.11, hexc('#f5d94e'))
    s.rect(0.08, 0, 0.11, 0.11, hexc('#f29bb5'))
    if P >= 48:
        s.rect(0.1, 0.03, 0.07, 1 / P, hexc('#a3546c'))
        s.rect(0.1, 0.06, 0.05, 1 / P, hexc('#a3546c'))
    return outlined(s)


def succulent(P):
    s = S(P, 0.18, 0.2)
    s.rect(0.03, 0.1, 0.12, 0.1, hexc('#e9e4da'))
    for i, (x, y, c) in enumerate([(0.01, 0.04, '#6fae7c'), (0.09, 0.03, '#5d9a6b'), (0.05, 0, '#83c290'), (0.11, 0.07, '#6fae7c')]):
        s.ellipse(x, y, 0.07, 0.08, hexc(c))
    return outlined(s)


def chair_gamer(P, accent='#c23b3b'):
    s = S(P, 0.8, 1.15)
    p = 1 / P
    ac = hexc(accent)
    s.rect(0.06, 0.95, 0.68, 0.06, hexc('#2a2b30'))  # base estrela
    s.rect(0.37, 0.8, 0.06, 0.16, hexc('#3a3b42'))
    for x in (0.04, 0.36, 0.68):
        s.rect(x, 1.0, 0.08, 0.08, hexc('#18191d'))
    s.rect(0.02, 0.55, 0.12, 0.08, hexc('#2a2b30'))  # braços
    s.rect(0.66, 0.55, 0.12, 0.08, hexc('#2a2b30'))
    s.rrect(0.1, 0.05, 0.6, 0.82, ac, 2)  # encosto
    s.rrect(0.22, 0.12, 0.36, 0.72, hexc('#1f2025'), 2)
    s.rect(0.26, 0.04, 0.28, 0.12, hexc('#1f2025'))  # almofada pescoço
    s.rect(0.28, 0.06, 0.24, 0.08, ac)
    if P >= 48:
        for y in range(round(0.22 * P), round(0.8 * P), 4):
            s.prect(s.u(0.24), y, round(0.32 * P), 1, hexc('#2b2c33'))
        s.rect(0.38, 0.58, 0.04, 0.04, ac)
    s.rect(0.12, 0.05, p, 0.78, shade(ac, 0.2))
    return outlined(s)


def chair_exec(P):
    s = S(P, 0.78, 1.1)
    p = 1 / P
    leather = hexc('#4a3024')
    s.rect(0.06, 0.92, 0.66, 0.05, hexc('#b8bcc4'))
    s.rect(0.36, 0.78, 0.06, 0.15, hexc('#9da2aa'))
    for x in (0.03, 0.35, 0.67):
        s.rect(x, 0.97, 0.08, 0.08, hexc('#18191d'))
    s.rect(0.02, 0.5, 0.12, 0.08, hexc('#3a261c'))
    s.rect(0.64, 0.5, 0.12, 0.08, hexc('#3a261c'))
    s.rrect(0.1, 0.02, 0.58, 0.82, leather, 3)
    s.rect(0.12, 0.04, p, 0.76, shade(leather, 0.18))
    step = 0.12 if P < 48 else 0.09
    y = 0.12
    row = 0
    while y < 0.75:
        x = 0.18 + (step / 2 if row % 2 else 0)
        while x < 0.62:
            s.rect(x, y, p * (1 if P < 64 else 2), p * (1 if P < 64 else 2), shade(leather, -0.3))
            x += step
        y += step
        row += 1
    return outlined(s)


# ---------------------------------------------------------------- plantas

def pot(s, x, y, w, h, c):
    s.rect(x, y, w, h, c)
    s.rect(x - 0.02, y, w + 0.04, 0.06, shade(c, 0.12))
    s.rect(x, y + 0.06, w, 1 / s.P, shade(c, -0.15))


def monstera(P):
    s = S(P, 1, 1.85)
    p = 1 / P
    greens = [hexc('#2f6b3a'), hexc('#3e8247'), hexc('#4f9a55')]
    leaves = [(0.05, 0.55, 0.5, 0.42, 0), (0.45, 0.45, 0.5, 0.44, 1), (0.18, 0.1, 0.55, 0.46, 2),
              (0.0, 0.95, 0.45, 0.36, 1), (0.52, 0.92, 0.46, 0.38, 0), (0.3, 0.6, 0.42, 0.4, 2)]
    for i, (x, y, w, h, g) in enumerate(leaves):
        s.ellipse(x, y, w, h, greens[g])
        cx = s.u(x + w / 2)
        s.prect(cx, s.u(y) + 1, 1, round(h * P) - 2, shade(greens[g], -0.25))  # nervura
        n = 2 if P < 48 else 3
        for k in range(n):  # recortes
            yy = s.u(y + h * (0.25 + k * 0.5 / n))
            side = -1 if (i + k) % 2 else 1
            length = max(2, round(w * P * 0.28))
            for t in range(length):
                xx = cx + side * (round(w * P / 2) - t)
                s.px(xx, yy + t // 3, (0, 0, 0, 0))
                if P >= 48:
                    s.px(xx, yy + t // 3 + 1, (0, 0, 0, 0))
    s.rect(0.48, 1.2, 0.04, 0.2, hexc('#3e7a3c'))
    pot(s, 0.2, 1.38, 0.6, 0.45, hexc('#e8e3d9'))
    if P >= 48:
        s.rect(0.2, 1.62, 0.6, p, hexc('#cfc9bd'))
    return outlined(s)


def sansevieria(P):
    s = S(P, 0.8, 1.55)
    p = 1 / P
    blades = [(0.08, 0.35, 0.18), (0.24, 0.05, 0.2), (0.42, 0.18, 0.19), (0.56, 0.42, 0.17), (0.33, 0.5, 0.16)]
    for i, (x, top, w) in enumerate(blades):
        base_y = 1.1
        s.poly([(x, base_y), (x + w / 2, top), (x + w, base_y)], hexc('#d9c95a'))  # borda amarela
        s.poly([(x + p, base_y), (x + w / 2, top + 0.05), (x + w - p, base_y)], hexc('#2f6e45'))
        if P >= 48:
            y = top + 0.15
            while y < base_y - 0.03:
                s.rect(x + 3 * p, y, w - 6 * p, p, hexc('#4f8f5f'))
                y += 0.07
    pot(s, 0.12, 1.08, 0.56, 0.42, hexc('#2b2b30'))
    return outlined(s)


# ---------------------------------------------------------------- avatar

def avatar(P, cfg):
    s = S(P, 1, 1.5)
    p = 1 / P
    skin = hexc(cfg['skin'])
    hair = hexc(cfg['hair'])
    shirt = hexc(cfg['shirt'])
    pants = hexc(cfg['pants'])
    # pernas e sapatos
    s.rect(0.33, 1.12, 0.14, 0.24, pants)
    s.rect(0.53, 1.12, 0.14, 0.24, pants)
    s.rect(0.33, 1.12, p, 0.24, shade(pants, 0.15))
    shoe = hexc(cfg.get('shoes', '#1b1b20'))
    s.rect(0.31, 1.35, 0.17, 0.1, shoe)
    s.rect(0.52, 1.35, 0.17, 0.1, shoe)
    if cfg.get('sneaker'):
        s.rect(0.31, 1.42, 0.17, 0.03, hexc('#f2f2f2'))
        s.rect(0.52, 1.42, 0.17, 0.03, hexc('#f2f2f2'))
    # tronco
    s.rrect(0.26, 0.62, 0.48, 0.54, shirt, 2)
    s.rect(0.15, 0.66, 0.12, 0.38, shade(shirt, -0.12))  # braços
    s.rect(0.73, 0.66, 0.12, 0.38, shade(shirt, -0.12))
    s.rect(0.15, 1.02, 0.12, 0.08, skin)
    s.rect(0.73, 1.02, 0.12, 0.08, skin)
    kind = cfg['top']
    if kind == 'social':
        s.poly([(0.4, 0.62), (0.5, 0.72), (0.6, 0.62)], hexc('#f4f4f4'))  # gola
        s.rect(0.47, 0.66, 0.06, 0.4, hexc(cfg.get('tie', '#7a1f2b')))
        s.rect(0.46, 0.66, 0.08, 0.05, shade(hexc(cfg.get('tie', '#7a1f2b')), -0.2))
        if P >= 48:
            s.rect(0.31, 0.75, 0.1, 0.08, shade(shirt, -0.08))  # bolso
            for yy in (0.8, 0.9, 1.0):
                s.rect(0.44, yy, p, p, shade(shirt, -0.3))
        s.rect(0.26, 1.05, 0.48, 0.04, hexc('#2a1d17'))  # cinto
        s.rect(0.47, 1.05, 0.06, 0.04, hexc('#d7b870'))
    elif kind == 'hoodie':
        s.rect(0.32, 0.88, 0.36, 0.14, shade(shirt, -0.1))  # bolso canguru
        s.rect(0.43, 0.64, p, 0.14, hexc('#efefef'))
        s.rect(0.56, 0.64, p, 0.14, hexc('#efefef'))
        s.rect(0.15, 1.0, 0.12, 0.03, shade(shirt, -0.25))  # punho
        s.rect(0.73, 1.0, 0.12, 0.03, shade(shirt, -0.25))
        if P >= 48:
            s.rect(0.32, 0.88, 0.36, p, shade(shirt, -0.22))
    if 'watch' in cfg['acc']:
        s.rect(0.73, 1.0, 0.12, 0.03, hexc('#c9a24a'))
    # cabeça
    hx, hy, hw, hh = 0.17, 0.06, 0.66, 0.6
    if cfg['hair_style'] == 'long':
        s.rrect(hx - 0.03, hy + 0.05, hw + 0.06, hh - 0.06, hair, 3)
        s.rect(hx - 0.04, hy + 0.3, 0.12, hh - 0.06, hair)  # mechas sobre os ombros
        s.rect(hx + hw - 0.08, hy + 0.3, 0.12, hh - 0.06, hair)
    s.rrect(hx, hy, hw, hh, skin, 3)
    s.rect(hx - 0.04, hy + 0.3, 0.05, 0.12, skin)  # orelhas
    s.rect(hx + hw - 0.01, hy + 0.3, 0.05, 0.12, skin)
    # cabelo
    if cfg['hair_style'] in ('short', 'long'):
        s.rrect(hx - 0.02, hy - 0.03, hw + 0.04, 0.24, hair, 3)
        s.rect(hx - 0.02, hy + 0.1, 0.07, 0.2, hair)
        s.rect(hx + hw - 0.05, hy + 0.1, 0.07, 0.2, hair)
        if cfg['hair_style'] == 'long':
            s.rect(hx + 0.08, hy + 0.15, 0.2, 0.06, hair)  # franja
        if P >= 48:
            for i in range(4):
                s.rect(hx + 0.08 + i * 0.13, hy + 0.0, p, 0.12, shade(hair, 0.18))
    # rosto
    ey = hy + hh * 0.5
    ew, eh = 0.08, 0.11
    for ex in (hx + hw * 0.27, hx + hw * 0.73 - ew):
        s.rect(ex, ey, ew, eh, hexc('#ffffff') if P >= 48 else hexc('#2a1d1a'))
        if P >= 48:
            s.rect(ex + ew * 0.35, ey + eh * 0.2, ew * 0.65, eh * 0.8, hexc(cfg.get('eyes', '#3b2a20')))
            s.rect(ex + ew * 0.35, ey + eh * 0.2, p, p, hexc('#ffffff'))
        s.rect(ex - 0.01, ey - 0.06, ew + 0.02, max(p, 0.025), shade(hair, -0.1))  # sobrancelha
    if P >= 48:
        s.rect(hx + hw / 2 - p, ey + eh + 0.02, 2 * p, p, shade(skin, -0.18))  # nariz
        s.rect(hx + hw * 0.18, ey + eh + 0.02, 0.06, 0.03, mix(skin, hexc('#e57c7c'), 0.35))  # blush
        s.rect(hx + hw * 0.82 - 0.06, ey + eh + 0.02, 0.06, 0.03, mix(skin, hexc('#e57c7c'), 0.35))
    s.rect(hx + hw / 2 - 0.05, ey + eh + 0.07, 0.1, max(p, 0.02), hexc('#7a3b33'))  # boca
    if cfg.get('beard'):
        s.rect(hx + 0.08, ey + eh + 0.05, hw - 0.16, 0.12, shade(hair, 0.05))
        s.rect(hx + hw / 2 - 0.06, ey + eh + 0.07, 0.12, max(p, 0.02), hexc('#7a3b33'))
    if 'glasses' in cfg['acc']:
        fc = hexc('#1d1d22')
        for ex in (hx + hw * 0.27, hx + hw * 0.73 - ew):
            x0, y0 = s.u(ex - 0.02), s.u(ey - 0.02)
            x1, y1 = s.u(ex + ew + 0.02), s.u(ey + eh + 0.02)
            s.d.rectangle([x0, y0, x1, y1], outline=fc)
        s.rect(hx + hw * 0.27 + ew + 0.02, ey + 0.02, hw * 0.46 - ew * 2 - 0.04 + 0.01, p, fc)
    if 'headset' in cfg['acc']:
        hc = hexc('#25262c')
        s.rect(hx + 0.02, hy - 0.06, hw - 0.04, 0.05, hc)
        s.rect(hx - 0.07, hy + 0.26, 0.1, 0.2, hc)
        s.rect(hx + hw - 0.03, hy + 0.26, 0.1, 0.2, hc)
        s.rect(hx - 0.06, hy + 0.3, 0.02, 0.1, hexc('#7c5cff'))
        s.rect(hx + 0.02, hy + 0.42, 0.18, 0.025, hc)  # microfone
        s.rect(hx + 0.18, hy + 0.41, 0.04, 0.045, hc)
    return outlined(s)


# ---------------------------------------------------------------- cena

def scene(P):
    WT, HT = 10, 5.6
    sc = S(P, WT, HT)
    sc.paste(floor_chevron(P, 5, HT - 1.5), 0, 1.5)
    sc.paste(floor_cement(P, 5, HT - 1.5), 5, 1.5)
    sc.paste(outlined(wall_with_windows(P, WT, [1.0, 6.0])), 0, 0)
    sc.rect(4.97, 1.5, 0.06, HT - 1.5, hexc('#5c4130'))  # soleira

    # setup gamer
    sc.paste(desk(P, 2.2, hexc('#2b2d33'), hexc('#43464f'), hexc('#1d1e22'), edge=hexc('#c23b3b')), 0.6, 2.0)
    sc.paste(monitor_ultrawide(P), 0.75, 1.55)
    sc.paste(pc_tower(P), 2.28, 1.82)
    mp = S(P, 1.2, 0.24)
    mp.rect(0, 0, 1.2, 0.24, hexc('#16171b'))
    mp.rect(0, 0.22, 1.2, 1 / P, hexc('#c23b3b'))
    sc.paste(outlined(mp), 0.8, 2.36)
    sc.paste(keyboard_mech(P), 0.92, 2.4)
    sc.paste(mouse(P), 1.72, 2.42)
    sc.paste(chair_gamer(P), 1.2, 2.55)

    # setup notebook
    sc.paste(desk(P, 2.2, hexc('#cfab7f'), hexc('#e2c49c'), hexc('#efefef')), 5.9, 2.0)
    sc.paste(laptop(P), 6.4, 1.8)
    sc.paste(mug(P), 7.25, 2.2)
    sc.paste(postits(P), 6.02, 2.3)
    sc.paste(succulent(P), 7.55, 2.02)
    sc.paste(chair_exec(P), 6.45, 2.6)

    # plantas
    sc.paste(monstera(P), 3.55, 1.3)
    sc.paste(sansevieria(P), 9.05, 1.7)

    # avatares
    sc.paste(avatar(P, dict(skin='#e8b88f', hair='#3b2416', shirt='#e6edf5', pants='#2b3446', top='social',
                            hair_style='short', beard=True, acc=['glasses', 'watch'], tie='#7a1f2b')), 3.6, 3.5)
    sc.paste(avatar(P, dict(skin='#9a6238', hair='#1c1917', shirt='#4b5f8a', pants='#2a2a2e', top='hoodie',
                            hair_style='long', acc=['headset'], sneaker=True, shoes='#c23b3b', eyes='#2a1a12')), 8.0, 3.6)
    return sc.im.crop((1, 1, sc.im.width - 1, sc.im.height - 1))


def label(im, text, sub):
    pad = 70
    out = Image.new('RGBA', (im.width, im.height + pad), hexc('#0b0b0d'))
    out.alpha_composite(im, (0, pad))
    d = ImageDraw.Draw(out)
    f1 = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Bold.otf', 30)
    f2 = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Regular.otf', 20)
    d.text((24, 10), text, font=f1, fill=hexc('#d7b870'))
    d.text((24, 44), sub, font=f2, fill=hexc('#b8b8bd'))
    return out


if __name__ == '__main__':
    outdir = sys.argv[1]
    SCREEN_TILE = 192  # mesmo tamanho na tela para as 3 escalas
    full = {}
    for P in (32, 48, 64):
        im = scene(P)
        k = SCREEN_TILE // P
        big = im.resize((im.width * k, im.height * k), Image.NEAREST)
        full[P] = big
        sub = {32: 'resolução de hoje (arte nova)', 48: '1,5× mais detalhe', 64: '2× mais detalhe'}[P]
        label(big, f'{P}×{P} px por bloco', f'{sub} · mostrado no mesmo tamanho de tela (cada pixel de arte ampliado {k}×)').convert('RGB').save(f'{outdir}/amostra-{P}px.png', optimize=True)
    # comparação de perto: setup gamer + avatar
    box = (int(0.5 * SCREEN_TILE), int(1.4 * SCREEN_TILE), int(4.7 * SCREEN_TILE), int(5.6 * SCREEN_TILE))
    crops = [full[P].crop(box) for P in (32, 48, 64)]
    gap = 24
    W = sum(c.width for c in crops) + gap * 2
    comp = Image.new('RGBA', (W, crops[0].height + 70), hexc('#0b0b0d'))
    x = 0
    f1 = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Bold.otf', 34)
    d = ImageDraw.Draw(comp)
    for P, c in zip((32, 48, 64), crops):
        comp.alpha_composite(c, (x, 70))
        d.text((x + 20, 16), f'{P} px', font=f1, fill=hexc('#d7b870'))
        x += c.width + gap
    comp.convert('RGB').save(f'{outdir}/comparacao-lado-a-lado.png', optimize=True)
    print('ok')
