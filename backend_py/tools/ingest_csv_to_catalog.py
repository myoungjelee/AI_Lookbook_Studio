#!/usr/bin/env python3
"""
CSV -> catalog.json 변환 스크립트

용도
- real_data/*.csv 등에서 수집한 원천 데이터를 표준 카탈로그 JSON(data/catalog.json)으로 변환
- 추가 패키지 없이 Python 표준 라이브러리만 사용

사용 예시(레포 루트 기준)
- 기본(실행시 real_data/*.csv 자동 스캔, 출력: data/catalog.json):
    python backend_py/tools/ingest_csv_to_catalog.py

- 입력/출력 지정:
    python backend_py/tools/ingest_csv_to_catalog.py --input real_data/musinsa_man_top.csv --output data/catalog.json

- 태그 구분자 변경('|'):
    python backend_py/tools/ingest_csv_to_catalog.py --tags-delim "|"

CSV 컬럼 기대값(대소문자 무시, snake/camel 혼용 허용):
- id, title, price, imageUrl(or image_url), tags, category
  * tags는 구분자로 연결된 문자열 (예: "black, hoodie, casual")
  * 없는 항목은 합리적 기본값 보정 (id 자동 생성, category 추정 등)
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT_DIR = ROOT / "real_data"
DEFAULT_OUTPUT = ROOT / "data" / "catalog.json"


def norm_key(k: str) -> str:
    # BOM 제거 + 공백 트림 + 소문자 + 하이픈->언더스코어
    return k.replace("\ufeff", "").strip().lower().replace("-", "_")


def parse_price(val: str) -> int:
    if val is None:
        return 0
    s = str(val)
    # 숫자와 소수점만 남기고 제거
    s = re.sub(r"[^0-9.]", "", s)
    try:
        return int(float(s))
    except Exception:
        return 0


def split_tags(text: Optional[str], delim: str) -> List[str]:
    if not text:
        return []
    return [t.strip() for t in str(text).split(delim) if t.strip()]


def map_row(row: Dict[str, str], idx: int, tags_delim: str, forced_category: Optional[str] = None) -> Dict:
    # 컬럼 키 노멀라이즈
    lower = {norm_key(k): v for k, v in row.items()}

    # 한글/다양한 키 이름 매핑 확장
    def pick(keys: List[str]) -> Optional[str]:
        for k in keys:
            if k in lower and lower[k] not in (None, ""):
                return str(lower[k])
        return None

    image_val = pick([
        "imageurl", "image_url", "image", "img_url", "이미지url", "이미지", "대표이미지",
        "product_img_u",  # musinsa
    ])

    product_url = pick(["product_u", "product_url", "상품url", "링크", "url"]) or None

    # id 추출: 명시 id -> URL 내 숫자 -> auto
    def extract_id_from_url(u: Optional[str]) -> Optional[str]:
        if not u:
            return None
        m = re.search(r"(\d{5,})", str(u))
        return m.group(1) if m else None

    product_id = pick(["id", "product_id", "상품코드", "상품id", "상품번호"]) 
    if not product_id:
        product_id = extract_id_from_url(pick(["product_u", "imageurl", "product_img_u"]))
    if not product_id:
        product_id = f"auto_{idx:06d}"

    title = pick(["title", "name", "상품명", "제품명", "product_n"]) or ""
    price = parse_price(pick(["price", "가격", "판매가", "product_p"]))
    tags_field = pick(["tags", "태그", "키워드"]) or ""
    category = pick(["category", "Category", "카테고리", "분류"]) or ""

    brand = pick(["brand", "브랜드", "product_b"]) or None
    base_tags = split_tags(tags_field, tags_delim)

    # DB 카테고리에서 성별 제거 (man_, woman_ 접두사 제거)
    if category:
        category = category.replace("man_", "").replace("woman_", "")
    
    # 강제 카테고리 지정이 있으면 우선 적용
    if forced_category:
        category = forced_category
    # 카테고리 대략 추정(없을 때)
    if not category:
        lt = " ".join([title] + base_tags).lower()
        top_kw = [
            # EN tops/outer
            "hoodie", "shirt", "t-shirt", "sweatshirt", "sweater", "cardigan", "knit", "top",
            "jacket", "coat", "jumper", "blouson", "parka", "padding", "down",
            # KO
            "후드", "셔츠", "티셔츠", "맨투맨", "니트", "가디건", "블라우스",
            "자켓", "재킷", "코트", "점퍼", "블루종", "아우터", "패딩", "다운"
        ]
        pants_kw = [
            "jeans", "slacks", "pants", "denim", "skirt",
            "바지", "슬랙스", "데님", "청바지", "진", "스커트"
        ]
        shoes_kw = [
            "shoes", "sneakers", "boots", "loafers",
            "신발", "스니커즈", "운동화", "부츠", "로퍼"
        ]
        if any(w in lt for w in top_kw):
            category = "top"
        elif any(w in lt for w in pants_kw):
            category = "pants"
        elif any(w in lt for w in shoes_kw):
            category = "shoes"
        else:
            category = "accessories"

    # 태그 생성: 입력 tags + 브랜드 + 제목 토큰 일부
    tags_extra: List[str] = []
    if brand:
        tags_extra.append(brand)
    # 제목에서 유의미 토큰 추출(길이 3 이상, 최대 5개)
    for tok in re.split(r"[^A-Za-z0-9가-힣]+", title):
        tok = tok.strip()
        if len(tok) >= 3:
            tags_extra.append(tok.lower())
        if len(tags_extra) >= 6:
            break
    tags = base_tags + tags_extra
    # 중복 제거 및 정렬(선택)
    tags = sorted(list(dict.fromkeys([t for t in tags if t])))

    return {
        "id": str(product_id),
        "title": str(title),
        "price": int(price),
        "imageUrl": image_val or None,
        "productUrl": product_url or None,
        "tags": tags,
        "category": category,
    }


def read_csv_file(path: Path, tags_delim: str, forced_category: Optional[str] = None) -> List[Dict]:
    items: List[Dict] = []
    
    # DB의 원본 카테고리를 우선 사용하도록 수정
    # 파일명 기반 강제 분류 제거
    
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=1):
            try:
                # DB의 원본 카테고리를 사용 (forced_category 제거)
                items.append(map_row(row, i, tags_delim, None))
            except Exception as e:
                print(f"[WARN] {path.name} #{i} 변환 실패: {e}")
    return items


def main():
    ap = argparse.ArgumentParser(description="CSV -> catalog.json 변환")
    ap.add_argument("--input", "-i", nargs="*", help="입력 CSV 파일 경로(여러 개 가능). 미지정 시 real_data/*.csv 검색")
    ap.add_argument("--output", "-o", default=str(DEFAULT_OUTPUT), help="출력 JSON 경로 (기본: data/catalog.json)")
    ap.add_argument("--tags-delim", default=",", help="tags 컬럼 구분자 (기본: ,)")
    ap.add_argument("--merge-existing", action="store_true", help="출력 파일이 존재하면 기존 JSON과 병합(id 중복 시 신규 우선)")
    ap.add_argument("--force-category", choices=["top", "pants", "shoes", "outer"], help="모든 입력 레코드의 카테고리를 강제 지정(top/pants/shoes/outer)")
    args = ap.parse_args()

    inputs: List[Path] = []
    if args.input:
        inputs = [Path(p) for p in args.input]
    else:
        if DEFAULT_INPUT_DIR.exists():
            inputs = sorted(DEFAULT_INPUT_DIR.glob("*.csv"))
        else:
            print("[ERROR] 입력 CSV를 찾을 수 없습니다. --input 지정 또는 real_data/*.csv 준비")
            return 1

    if not inputs:
        print("[ERROR] 처리할 CSV가 없습니다.")
        return 1

    all_items: List[Dict] = []
    for p in inputs:
        if not p.exists():
            print(f"[WARN] 파일 없음: {p}")
            continue
        print(f"[INGEST] CSV 읽는 중: {p}")
        items = read_csv_file(p, args.tags_delim, args.force_category)
        all_items.extend(items)

    if not all_items:
        print("[ERROR] 변환된 항목이 없습니다.")
        return 1

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if args.merge_existing and out_path.exists():
        try:
            existing = json.loads(out_path.read_text(encoding="utf-8"))
            if isinstance(existing, list):
                merged: Dict[str, Dict] = {}
                for it in existing:
                    if isinstance(it, dict) and "id" in it:
                        merged[str(it["id"])] = it
                for it in all_items:
                    merged[str(it["id"])] = it  # 신규 우선
                final_list = list(merged.values())
                out_path.write_text(json.dumps(final_list, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"[DONE] {len(final_list)}개 항목 병합 저장: {out_path}")
                return 0
        except Exception as e:
            print(f"[WARN] 기존 파일 병합 실패, 덮어쓰기 진행: {e}")

    out_path.write_text(json.dumps(all_items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[DONE] {len(all_items)}개 항목 저장: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
