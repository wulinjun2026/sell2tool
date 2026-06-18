#!/usr/bin/env python3
"""将真机竖屏截图合成 1920x1080 横屏分镜（居中手机画面 + 品牌底色）。"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "output" / "product-intro-video"
RAW_DIR = OUT_DIR / "screenshots-raw"
W, H = 1920, 1080
BG = "0x071812"


def ffmpeg() -> str:
    try:
        out = subprocess.check_output(
            ["node", "-e", "console.log(require('@ffmpeg-installer/ffmpeg').path)"],
            cwd=ROOT,
            text=True,
        ).strip()
        if Path(out).exists():
            return out
    except Exception:
        pass
    return "ffmpeg"


def compose(raw: Path, out: Path) -> None:
    # 竖屏截图缩放到高度 920，居中铺到横版画布
    vf = (
        f"scale=-1:920:force_original_aspect_ratio=decrease,"
        f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color={BG}"
    )
    subprocess.run(
        [ffmpeg(), "-y", "-i", str(raw), "-vf", vf, "-frames:v", "1", str(out)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    ff = ffmpeg()
    for i in range(1, 8):
        raw = RAW_DIR / f"scene-{i:02d}.png"
        out = OUT_DIR / f"scene-{i:02d}.png"
        if not raw.exists():
            print(f"SKIP missing {raw.name}")
            continue
        print(f"compose {raw.name} -> {out.name}")
        compose(raw, out)
    print("done")


if __name__ == "__main__":
    main()
