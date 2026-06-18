#!/usr/bin/env python3
"""
根据 docs/产品介绍视频脚本.md 生成产品介绍视频（TTS 口播 + 分镜配图 + 字幕）。

依赖：ffmpeg、edge-tts（pip install edge-tts）
用法：python3 scripts/generate-product-intro-video.py
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "output" / "product-intro-video"
SCENES_FILE = ROOT / "scripts" / "product-intro-scenes.json"

VOICE = "zh-CN-YunxiNeural"
VIDEO_W = 1920
VIDEO_H = 1080
FPS = 30


def resolve_ffmpeg() -> str:
    env = os.environ.get("FFMPEG_PATH")
    if env and Path(env).exists():
        return env
    try:
        out = subprocess.check_output(
            ["node", "-e", "console.log(require('@ffmpeg-installer/ffmpeg').path)"],
            cwd=ROOT,
            text=True,
        ).strip()
        if out and Path(out).exists():
            return out
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return "ffmpeg"


def resolve_ffprobe(ffmpeg: str) -> str:
    env = os.environ.get("FFPROBE_PATH")
    if env and Path(env).exists():
        return env
    sibling = Path(ffmpeg).parent / "ffprobe"
    if sibling.exists():
        return str(sibling)
    return "ffprobe"


FFMPEG = resolve_ffmpeg()
FFPROBE = resolve_ffprobe(FFMPEG)


def run(cmd: list[str], **kwargs) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True, **kwargs)


def ensure_tools() -> None:
    try:
        subprocess.run([FFMPEG, "-version"], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        sys.exit(f"缺少 ffmpeg，已尝试: {FFMPEG}")


def load_scenes() -> list[dict]:
    data = json.loads(SCENES_FILE.read_text(encoding="utf-8"))
    return data["scenes"]


async def synthesize_scene_audio(scene: dict, out_path: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(scene["narration"], VOICE)
    await communicate.save(str(out_path))


async def synthesize_all_audio(scenes: list[dict]) -> list[Path]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tasks = []
    paths: list[Path] = []
    for i, scene in enumerate(scenes):
        audio_path = OUT_DIR / f"scene-{i + 1:02d}.mp3"
        paths.append(audio_path)
        if not audio_path.exists():
            tasks.append(synthesize_scene_audio(scene, audio_path))
    if tasks:
        await asyncio.gather(*tasks)
    return paths


def probe_duration(path: Path) -> float:
    try:
        out = subprocess.check_output(
            [
                FFPROBE,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return float(out)
    except (FileNotFoundError, subprocess.CalledProcessError, ValueError):
        proc = subprocess.run(
            [FFMPEG, "-i", str(path)],
            capture_output=True,
            text=True,
        )
        m = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", proc.stderr)
        if not m:
            raise RuntimeError(f"无法读取音频时长: {path}")
        h, mnt, sec = m.groups()
        return int(h) * 3600 + int(mnt) * 60 + float(sec)


def escape_drawtext(text: str) -> str:
    text = text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    text = text.replace("\n", " ")
    return text


def build_scene_clip(
    index: int,
    scene: dict,
    audio_path: Path,
    image_path: Path,
    out_path: Path,
) -> None:
    duration = probe_duration(audio_path) + 0.35
    vf = (
        f"scale={VIDEO_W}:{VIDEO_H}:force_original_aspect_ratio=increase,"
        f"crop={VIDEO_W}:{VIDEO_H},"
        f"drawbox=x=0:y=0:w=iw:h=ih:color=black@0.28:t=fill"
    )

    run(
        [
            FFMPEG,
            "-y",
            "-loop",
            "1",
            "-i",
            str(image_path),
            "-i",
            str(audio_path),
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-t",
            f"{duration:.2f}",
            str(out_path),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def concat_clips(clips: list[Path], out_path: Path) -> None:
    list_file = OUT_DIR / "concat.txt"
    list_file.write_text("\n".join(f"file '{p.resolve()}'" for p in clips), encoding="utf-8")
    run(
        [
            FFMPEG,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            str(out_path),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def write_srt(scenes: list[dict], audio_paths: list[Path], srt_path: Path) -> None:
    lines: list[str] = []
    t = 0.0
    for idx, (scene, audio) in enumerate(zip(scenes, audio_paths), start=1):
        dur = probe_duration(audio)
        start = format_srt_time(t)
        end = format_srt_time(t + dur)
        text = scene["narration"].replace("\n", " ")
        lines.append(str(idx))
        lines.append(f"{start} --> {end}")
        lines.append(text)
        lines.append("")
        t += dur
    srt_path.write_text("\n".join(lines), encoding="utf-8")


def format_srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def burn_subtitles(src: Path, srt: Path, out_path: Path) -> None:
    srt_esc = str(srt.resolve()).replace(":", "\\:")
    run(
        [
            FFMPEG,
            "-y",
            "-i",
            str(src),
            "-vf",
            f"subtitles='{srt_esc}':force_style='FontName=PingFang SC,FontSize=22,PrimaryColour=&HFFFFFF&,"
            f"OutlineColour=&H000000&,BorderStyle=3,Outline=2,Shadow=1,MarginV=36'",
            "-c:a",
            "copy",
            str(out_path),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


async def main() -> None:
    ensure_tools()
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        sys.exit("缺少 edge-tts，请运行: pip3 install edge-tts")

    scenes = load_scenes()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("==> 生成口播音频 …")
    audio_paths = await synthesize_all_audio(scenes)

    print("==> 合成分镜视频 …")
    clip_paths: list[Path] = []
    for i, scene in enumerate(scenes):
        image_path = OUT_DIR / f"scene-{i + 1:02d}.png"
        if not image_path.exists():
            print(f"WARN: 缺少配图 {image_path.name}，使用占位图")
            run(
                [
                    FFMPEG,
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    f"color=c=0x07C160:s={VIDEO_W}x{VIDEO_H}:d=1",
                    "-frames:v",
                    "1",
                    str(image_path),
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        clip_path = OUT_DIR / f"clip-{i + 1:02d}.mp4"
        build_scene_clip(i, scene, audio_paths[i], image_path, clip_path)
        clip_paths.append(clip_path)

    raw_path = OUT_DIR / "product-intro-raw.mp4"
    concat_clips(clip_paths, raw_path)

    srt_path = OUT_DIR / "product-intro.srt"
    write_srt(scenes, audio_paths, srt_path)

    final_path = OUT_DIR / "product-intro-v1.1.0.mp4"
    try:
        burn_subtitles(raw_path, srt_path, final_path)
    except subprocess.CalledProcessError:
        print("WARN: 内嵌字幕失败，输出无字幕版本并保留 .srt 文件")
        final_path.write_bytes(raw_path.read_bytes())

    chapters_path = OUT_DIR / "chapters.md"
    chapters_path.write_text(
        "\n".join(
            f"- **{s['title']}**（约 {s.get('durationHint', '?')}s）：{s.get('subtitle', '')}"
            for s in scenes
        ),
        encoding="utf-8",
    )

    total = sum(probe_duration(p) for p in audio_paths)
    meta = {
        "title": "通用产品销售助手 功能介绍",
        "version": "1.1.0",
        "durationSec": round(total, 1),
        "voice": VOICE,
        "output": str(final_path.relative_to(ROOT)),
        "scenes": len(scenes),
    }
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✅ 视频已生成: {final_path}")
    print(f"   时长约 {total:.0f} 秒 · 字幕 {srt_path.name}")


if __name__ == "__main__":
    asyncio.run(main())
