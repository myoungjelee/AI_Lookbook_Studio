#!/usr/bin/env python3
"""
real_data 내 이미지 중 '배경 없는(투명 배경)' 파일만 선별해 복사하는 유틸.

판정 로직(보수적):
- PNG/WEBP 등 알파 채널이 있는 이미지만 대상
- 전체 픽셀 중 투명(alpha<=5) 비율이 1% 이상
- 가장자리(테두리 4%) 영역 평균 알파가 245 미만(즉, 테두리 쪽이 불투명 배경이 아님)

사용 예(프로젝트 루트에서):
  python backend_py/tools/select_transparent_images.py \
      --input real_data/images \
      --output real_data_no_bg \
      --extensions .png .webp

설명:
- --dry-run: 결과만 출력하고 복사하지 않음
- --min-transparent-ratio: 투명픽셀 비율 하한(기본 0.01 => 1%)
- --border-ratio: 테두리 두께 비율(기본 0.04 => 4%)

필요 패키지: Pillow
"""
from __future__ import annotations

import argparse
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Tuple

from PIL import Image


def iter_files(root: Path, exts: Tuple[str, ...]) -> Iterable[Path]:
    for p in root.rglob("*"):
        if p.is_file() and p.suffix.lower() in exts:
            yield p


@dataclass
class Decision:
    ok: bool
    reason: str
    transparent_ratio: float
    border_mean_alpha: float


def is_transparent_background(img: Image.Image, *,
                              min_transparent_ratio: float = 0.01,
                              border_ratio: float = 0.04,
                              border_alpha_threshold: int = 245) -> Decision:
    if img.mode not in ("RGBA", "LA"):
        img = img.convert("RGBA")

    if "A" not in img.getbands():
        return Decision(False, "no_alpha", 0.0, 255.0)

    a = img.getchannel("A")
    w, h = a.size
    pixels = a.load()

    # 전체 투명 픽셀 비율
    total = w * h
    trans = 0
    for y in range(h):
        for x in range(w):
            if pixels[x, y] <= 5:
                trans += 1
    transparent_ratio = trans / max(1, total)

    # 테두리 평균 알파(배경이 투명한 제품컷은 바깥 테두리가 대체로 낮음)
    bw = max(1, int(w * border_ratio))
    bh = max(1, int(h * border_ratio))
    sums = 0
    cnt = 0
    # top
    for y in range(0, bh):
        for x in range(w):
            sums += pixels[x, y]
            cnt += 1
    # bottom
    for y in range(h - bh, h):
        for x in range(w):
            sums += pixels[x, y]
            cnt += 1
    # left + right (exclude corners already counted to keep simple ok)
    for y in range(bh, h - bh):
        for x in list(range(0, bw)) + list(range(w - bw, w)):
            sums += pixels[x, y]
            cnt += 1
    border_mean_alpha = sums / max(1, cnt)

    if transparent_ratio < min_transparent_ratio:
        return Decision(False, "transparent_ratio_too_low", transparent_ratio, border_mean_alpha)
    if border_mean_alpha >= border_alpha_threshold:
        return Decision(False, "border_too_opaque", transparent_ratio, border_mean_alpha)

    return Decision(True, "ok", transparent_ratio, border_mean_alpha)


def main() -> int:
    ap = argparse.ArgumentParser(description="Select images with transparent background")
    ap.add_argument("--input", "-i", type=str, required=True, help="입력 이미지 루트 폴더")
    ap.add_argument("--output", "-o", type=str, required=True, help="선별된 이미지를 복사할 폴더")
    ap.add_argument("--extensions", "-e", nargs="*", default=[".png", ".webp"], help="대상 확장자(기본 .png .webp)")
    ap.add_argument("--dry-run", action="store_true", help="복사하지 않고 결과만 출력")
    ap.add_argument("--min-transparent-ratio", type=float, default=0.01, help="투명 픽셀 비율 하한 (기본 0.01)")
    ap.add_argument("--border-ratio", type=float, default=0.04, help="테두리 두께 비율 (기본 0.04)")
    ap.add_argument("--border-alpha-threshold", type=int, default=245, help="테두리 평균 알파 임계값 (기본 245)")
    ap.add_argument("--manifest", type=str, help="선별된 상대경로를 기록할 JSON 파일 경로")
    args = ap.parse_args()

    in_root = Path(args.input).resolve()
    out_root = Path(args.output).resolve()
    out_root.mkdir(parents=True, exist_ok=True)

    exts = tuple(e.lower() if e.startswith('.') else f'.{e.lower()}' for e in args.extensions)

    ok_list: List[Path] = []
    skip_list: List[Tuple[Path, str]] = []

    for path in iter_files(in_root, exts):
        try:
            with Image.open(path) as im:
                d = is_transparent_background(
                    im,
                    min_transparent_ratio=args.min_transparent_ratio,
                    border_ratio=args.border_ratio,
                    border_alpha_threshold=args.border_alpha_threshold,
                )
        except Exception as e:
            skip_list.append((path, f"open_failed:{e}"))
            continue

        if d.ok:
            ok_list.append(path)
        else:
            skip_list.append((path, d.reason))

    print(f"[SUMMARY] total={len(ok_list)+len(skip_list)} ok={len(ok_list)} skip={len(skip_list)}")
    for p, reason in skip_list[:10]:
        print(f"  [skip] {p}: {reason}")

    if args.manifest:
        import json
        rels = [str(p.relative_to(in_root)).replace('\\', '/') for p in ok_list]
        Path(args.manifest).parent.mkdir(parents=True, exist_ok=True)
        Path(args.manifest).write_text(json.dumps(rels, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[MANIFEST] wrote {len(rels)} entries to {args.manifest}")

    if not args.dry_run:
        for p in ok_list:
            rel = p.relative_to(in_root)
            dest = out_root / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, dest)
        print(f"[COPY] {len(ok_list)} files copied under {out_root}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
