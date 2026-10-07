#!/usr/bin/env python3
"""
cartoon.py -- Generate an animated NSIGII container with pause/play control

This script demonstrates separation of concerns:
  - FrameGenerator: Responsible for rendering individual frames
  - AnimationController: Manages playback state (pause/play)
  - NSIGIIEncoder: Handles NSIGII container format and compression
  - main(): Orchestrates the pipeline

The resulting .nsigii file is viewable in nsigii-viewer.html with pause/play controls.
"""

import argparse
import struct
import sys
import time
import zlib
from enum import Enum
from typing import List, Tuple
import math


class PlaybackState(Enum):
    """Playback state enumeration."""
    PLAY = 1
    PAUSE = 0


class FrameGenerator:
    """
    Generates individual animation frames.
    Responsibility: Pure frame rendering logic, independent of playback state.
    """

    def __init__(self, width: int, height: int, frame_count: int):
        self.width = width
        self.height = height
        self.frame_count = frame_count

    def generate_frame(self, frame_index: int) -> Tuple[bytes, bytes, bytes, bytes]:
        """
        Generate a single frame as four planar byte arrays: chars, red, green, blue.
        Returns: (chars_plane, red_plane, green_plane, blue_plane)
        """
        size = self.width * self.height
        chars = bytearray(b" " * size)
        rp = bytearray(size)
        gp = bytearray(size)
        bp = bytearray(size)

        # Animate a bouncing ball with color cycling
        progress = frame_index / max(1, self.frame_count - 1)

        # Ball position: bounces horizontally
        ball_x = int(self.width * 0.25 + math.sin(progress * 2 * math.pi) * self.width * 0.2)
        ball_y = int(self.height * 0.5 + math.cos(progress * 4 * math.pi) * self.height * 0.2)

        # Clamp to bounds
        ball_x = max(1, min(self.width - 2, ball_x))
        ball_y = max(1, min(self.height - 2, ball_y))

        # Draw ball (3×3 circle)
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                x = ball_x + dx
                y = ball_y + dy
                if 0 <= x < self.width and 0 <= y < self.height:
                    dist = math.sqrt(dx**2 + dy**2)
                    if dist <= 1.2:  # Circle radius
                        o = y * self.width + x
                        chars[o] = ord("@")

                        # Color cycles through rainbow
                        hue = (frame_index * 3) % 360
                        r, g, b = self._hsv_to_rgb(hue, 0.9, 0.9)
                        rp[o], gp[o], bp[o] = r, g, b

        # Draw border
        for x in range(self.width):
            # Top and bottom
            top_idx = x
            bottom_idx = (self.height - 1) * self.width + x
            chars[top_idx] = ord("-")
            chars[bottom_idx] = ord("-")
            rp[top_idx] = gp[top_idx] = bp[top_idx] = 128
            rp[bottom_idx] = gp[bottom_idx] = bp[bottom_idx] = 128

        for y in range(self.height):
            # Left and right
            left_idx = y * self.width
            right_idx = y * self.width + (self.width - 1)
            chars[left_idx] = ord("|")
            chars[right_idx] = ord("|")
            rp[left_idx] = gp[left_idx] = bp[left_idx] = 128
            rp[right_idx] = gp[right_idx] = bp[right_idx] = 128

        return bytes(chars), bytes(rp), bytes(gp), bytes(bp)

    @staticmethod
    def _hsv_to_rgb(h: float, s: float, v: float) -> Tuple[int, int, int]:
        """Convert HSV to RGB (0..255)."""
        h = h % 360.0
        c = v * s
        x = c * (1 - abs((h / 60.0) % 2 - 1))
        m = v - c

        if h < 60:
            r, g, b = c, x, 0
        elif h < 120:
            r, g, b = x, c, 0
        elif h < 180:
            r, g, b = 0, c, x
        elif h < 240:
            r, g, b = 0, x, c
        elif h < 300:
            r, g, b = x, 0, c
        else:
            r, g, b = c, 0, x

        return (
            int((r + m) * 255),
            int((g + m) * 255),
            int((b + m) * 255),
        )


class AnimationController:
    """
    Controls animation playback state.
    Responsibility: Manage pause/play state and frame sequencing.
    """

    def __init__(self, frame_count: int, playback_state: PlaybackState):
        self.frame_count = frame_count
        self.playback_state = playback_state
        self.current_frame = 0

    def set_playback_state(self, state: PlaybackState) -> None:
        """Set the playback state (PLAY or PAUSE)."""
        self.playback_state = state

    def advance_frame(self) -> int:
        """
        Advance to the next frame if in PLAY state.
        Returns the current frame index.
        """
        if self.playback_state == PlaybackState.PLAY:
            self.current_frame = (self.current_frame + 1) % self.frame_count
        return self.current_frame

    def get_status(self) -> str:
        """Return human-readable playback status."""
        state_str = "playing" if self.playback_state == PlaybackState.PLAY else "paused"
        return f"{state_str} (frame {self.current_frame}/{self.frame_count})"


class NSIGIIEncoder:
    """
    Encodes frames into NSIGII container format.
    Responsibility: Handle serialization, compression, and NSIGII protocol.
    """

    def __init__(self, width: int, height: int, frame_count: int, output_path: str):
        self.width = width
        self.height = height
        self.frame_count = frame_count
        self.output_path = output_path

    def encode_frame(self, chars: bytes, red: bytes, green: bytes, blue: bytes) -> bytes:
        """
        Encode a single frame: four planar arrays concatenated and compressed.
        Returns: 4-byte size header + compressed data (raw DEFLATE, like Go).
        """
        planes = chars + red + green + blue
        compressor = zlib.compressobj(9, zlib.DEFLATED, -15)  # -15 = raw DEFLATE
        compressed = compressor.compress(planes) + compressor.flush()
        return compressed

    def write_container(self, frame_generator: FrameGenerator) -> None:
        """
        Write the complete NSIGII container file with all frames.
        Format:
          Header (32 bytes): magic, version, width, height, framecount, reserved
          Frames: [4-byte size + compressed data] × framecount
        """
        with open(self.output_path, "wb") as f:
            # Header
            magic = b"NSIGII\0\0"
            version = b"7.0.0\0\0\0"  # Video timeline format

            header = struct.pack(
                "<8s8sIIII",
                magic,
                version,
                self.width,
                self.height,
                self.frame_count,
                0,  # reserved
            )
            f.write(header)

            # Frames
            total_raw = 0
            total_encoded = 0

            for frame_idx in range(self.frame_count):
                chars, red, green, blue = frame_generator.generate_frame(frame_idx)
                total_raw += len(chars) + len(red) + len(green) + len(blue)

                compressed = self.encode_frame(chars, red, green, blue)
                total_encoded += len(compressed) + 4

                f.write(struct.pack("<I", len(compressed)))
                f.write(compressed)

                # Progress feedback
                percent = (frame_idx + 1) / self.frame_count * 100
                sys.stdout.write(
                    f"\r  frame {frame_idx + 1:3d}/{self.frame_count}  "
                    f"{percent:5.1f}%  ({total_encoded:,} bytes encoded)"
                )
                sys.stdout.flush()

            sys.stdout.write("\n")
            print(f"  raw planes:  {total_raw:,} bytes")
            print(f"  encoded:     {total_encoded:,} bytes "
                  f"({100.0 * total_encoded / total_raw:.1f}% of raw)")


def main():
    """
    Main orchestration function.
    Responsibility: Parse arguments, instantiate components, run pipeline.
    """
    parser = argparse.ArgumentParser(
        description="Generate an animated NSIGII container with pause/play control"
    )
    parser.add_argument(
        "--play",
        action="store_true",
        default=True,
        help="Start in PLAY state (default: True)"
    )
    parser.add_argument(
        "--pause",
        action="store_true",
        help="Start in PAUSE state (overrides --play if set)"
    )
    parser.add_argument(
        "--out",
        default="cartoon.nsigii",
        help="Output container filename"
    )
    parser.add_argument(
        "--frames",
        type=int,
        default=60,
        help="Number of frames to generate"
    )
    parser.add_argument(
        "--width",
        type=int,
        default=80,
        help="Frame width in characters"
    )
    parser.add_argument(
        "--height",
        type=int,
        default=24,
        help="Frame height in characters"
    )

    args = parser.parse_args()

    # Determine initial playback state
    initial_state = PlaybackState.PAUSE if args.pause else PlaybackState.PLAY

    print(f"Generating {args.frames} animated frames...")
    print(f"  dimensions: {args.width}×{args.height} characters")
    print(f"  initial state: {initial_state.name}")
    print()

    # Instantiate components
    frame_generator = FrameGenerator(args.width, args.height, args.frames)
    controller = AnimationController(args.frames, initial_state)
    encoder = NSIGIIEncoder(args.width, args.height, args.frames, args.out)

    # Encode and write container
    print(f"Encoding frames into {args.out}...")
    t0 = time.perf_counter()
    encoder.write_container(frame_generator)
    elapsed = time.perf_counter() - t0

    # Summary
    print()
    print("======================================")
    print(f"Container: {args.out}")
    print(f"Status:    {controller.get_status()}")
    print(f"Elapsed:   {elapsed:.1f}s")
    print("======================================")
    print()
    print("View with: python -m http.server -b 127.0.0.1")
    print("Then open: http://127.0.0.1:8000/nsigii-viewer.html?src=cartoon.nsigii")


if __name__ == "__main__":
    sys.exit(main())
