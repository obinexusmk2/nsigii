# NSIGII Examples

Two different things share the `.nsigii` extension and the `NSIGII` magic in
this repo. **This directory is about the codec stream** — a pure-data container
whose interactivity is baked in as state, not script. The constitutional wrapper
(trident channels, `ENDNSIGII` footer, `nsigii wrap` / `verify` / `extract`) is a
separate format documented in the [root README](../README.md); `sample.txt`
below is its payload fixture.

Background article: `../docs/File without any code.txt`.

---

## The codec container

32-byte header, little-endian, then a flat sequence of DEFLATE frames. It has
not changed since the first version:

```
offset  size  field
0       8     magic       "NSIGII\0\0"
8       8     version     "7.0.0"   -> I420 video timeline
                          "7.1.0A"  -> coloured ASCII rotation grid  (trailing 'A')
16      4     width       uint32    pixels, or terminal columns
20      4     height      uint32    pixels, or terminal rows
24      4     framecount  uint32    patched after the encode loop; 0 if interrupted
28      4     reserved    uint32    ASCII kind: (grid_a << 16) | grid_b
then, repeating:
        4     framesize   uint32
        N     framedata   raw DEFLATE (RFC 1951, no zlib wrapper -> wbits=-15)
```

- **The `A` variant needs no format change.** It rides in two unused fields: the
  trailing `A` on the version string and the grid packed into `reserved`
  (`0x00180018` = 24×24). Old readers see an unknown version and stop; new
  readers branch.
- **ASCII frame payload is four planar byte planes** — `chars | red | green | blue`,
  each `width*height` bytes — not interleaved. The char plane is mostly spaces
  and each colour plane is locally smooth, so DEFLATE reaches ~30% of raw;
  interleaved lands near 60%.
- **Frame index** for the ASCII grid is `a_index * grid_b + b_index`.
- Readers **must not trust `framecount`** — it is patched by a seek after the
  encode loop, so a count of `0` just means the encoder was interrupted. Stream
  to EOF instead.

### Read it anywhere (complete reader)

```python
import struct, zlib

def read_nsigii(path):
    with open(path, "rb") as f:
        head = f.read(32)
        assert head[:6] == b"NSIGII"
        version = head[8:16].rstrip(b"\0").decode()
        w, h, declared, reserved = struct.unpack("<IIII", head[16:32])
        frames = []
        while (sz := f.read(4)) and len(sz) == 4:
            (size,) = struct.unpack("<I", sz)
            blob = f.read(size)
            if len(blob) < size:
                break
            frames.append(zlib.decompress(blob, -15))   # raw DEFLATE
        return version, w, h, frames
```

The one gotcha: **`wbits=-15`**. Go's `compress/flate` writes raw DEFLATE with no
zlib header, so `zlib.decompress(blob)` fails with `Error -3: incorrect header
check`. The browser equivalent is `new DecompressionStream("deflate-raw")`.

---

## Files

| File | What it is |
|------|------------|
| `donut_nsigii.py` | Bakes an interactive ASCII donut into a `7.1.0A` container |
| `nsigii_play.py` | Terminal player for both kinds (`7.0.0` video, `7.1.0A` interactive) |
| `nsigii-viewer.html` | Zero-dependency browser viewer for both kinds |
| `donut.nsigii` | A baked 24×24 grid at 512×512 cells (576 frames) |
| `breathing_without_living_is_suffering.mp4` | Source clip for a `7.0.0` encode |
| `sample.txt` | Payload fixture for the constitutional-wrapper CLI (see root README) |

`7.0.0` **video** containers are produced by a Go encoder (`main.go`) that is not
included here; `nsigii_play.py` and `nsigii-viewer.html` only *read* them.

---

## `donut_nsigii.py` — bake an interactive donut

Renders Andy Sloane's torus at every `(A, B)` rotation pair on a grid and stores
the cells as an ordinary frame sequence. Nothing is computed at play time.

```bash
python donut_nsigii.py                                   # 80x24 cells, 24x24 grid -> donut.nsigii
python donut_nsigii.py --cols 100 --rows 30 --grid 32    # finer grid
python donut_nsigii.py --out mydonut.nsigii --grid 16
```

| Flag | Default | Meaning |
|------|--------:|---------|
| `--out` | `donut.nsigii` | output path |
| `--cols` / `--rows` | 80 / 24 | terminal cell grid (frame `width` / `height`) |
| `--grid` | 24 | rotation steps per axis → `grid × grid` frames |
| `--hue-steps` | 180 | palette resolution around the ring |

## `nsigii_play.py` — terminal player

```bash
python nsigii_play.py donut.nsigii            # 7.1.0A -> cursor-driven, drag to spin
python nsigii_play.py video.nsigii            # 7.0.0  -> plays on a timeline
python nsigii_play.py video.nsigii --fps 25
python nsigii_play.py video.nsigii --gray     # luma only, shows the Y plane raw
python nsigii_play.py video.nsigii --loop
python nsigii_play.py any.nsigii --info       # header + frame stats + Y-plane diagnostic
```

Keys while playing: `q` / `Esc` / `Ctrl-Z` / `Ctrl-C` quit, `space` pause (video)
or toggle idle-spin (interactive), `r` recentre (interactive). Interactive mode
needs a terminal that reports SGR mouse motion; on Windows it enables VT input
and disables QuickEdit for the session.

Hand it a **constitutional wrapper** by mistake and it detects it (`byte 7 ==
0x07`, or an `ENDNSIGII` / legacy `ENDSIGII` tail) and points you at
`npx nsigii extract` rather than emitting garbage.

## `nsigii-viewer.html` — browser viewer

Open it from `file://` — no server, no build, no dependencies. Drag a `.nsigii`
onto it, use **Open**, or pass `?src=donut.nsigii` when serving over http(s).
Needs `DecompressionStream("deflate-raw")` — Chrome 103+, Firefox 113+, Safari
16.4+.

- **`7.1.0A`** — drag across the scope. Gain scales with cursor speed between
  2.5× (slow drag) and 5.0× (flick); the "Full gain at" slider retunes the
  reference speed. `space` toggles idle spin, `r` recentres.
- **`7.0.0`** — plays on a timeline; `space` pauses, the fps slider re-times it.

The gain law (`GAIN_MIN` 2.5, `GAIN_MAX` 5.0, `RAD_PER_CELL` 0.0314, `IDLE_SPIN`
0.9) is identical to `nsigii_play.py`; only the speed reference differs, because
the browser measures cursor speed in pixel-derived cells rather than terminal
cells.

---

## Known limitations (from the article)

- The `7.0.0` video kind's compression is not competitive with h.264 — the
  container was the point, not the codec.
- No frame index: you cannot seek without walking the file, so HTTP range
  requests are not possible.
- The container carries a SHA-256 (bytes unchanged since *someone* wrote them)
  but no signature — no proof of who or when.
