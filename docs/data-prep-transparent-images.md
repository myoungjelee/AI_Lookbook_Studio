# Data Prep: Transparent-Background Product Images

목표
- 합성 안정성을 높이기 위해 real_data 내 상품 이미지 중 배경이 투명한(알파 채널) 이미지들만 선별해 별도 폴더로 복사합니다.

도구
- 스크립트: `backend_py/tools/select_transparent_images.py`
- 의존성: Pillow (requirements.txt에 포함)

판정 로직(보수적)
- PNG/WEBP 등 알파 채널이 있는 이미지만 대상입니다.
- 전체 픽셀 중 투명(alpha ≤ 5) 비율이 최소 1% 이상이어야 합니다.
- 테두리(가로/세로 4% 두께 영역) 평균 알파가 245 미만이어야 합니다. 즉, 바깥쪽이 불투명한 회색/흰 배경이면 제외합니다.

빠른 사용 예시
- Dry-run(복사하지 않고 결과만 출력):
  - `python backend_py/tools/select_transparent_images.py --input real_data/images --output real_data_no_bg --extensions .png .webp --dry-run`
- 실제 복사 + 매니페스트(JSON) 작성:
  - `python backend_py/tools/select_transparent_images.py --input real_data/images --output real_data_no_bg --extensions .png .webp --manifest data/transparent_manifest.json`

옵션
- `--input/-i`: 입력 루트 폴더 (예: `real_data/images` 혹은 `real_data/top`)
- `--output/-o`: 선별된 파일을 복사할 루트 폴더
- `--extensions/-e`: 검사할 확장자 목록(기본 `.png .webp`)
- `--dry-run`: 복사 없이 결과만 출력
- `--min-transparent-ratio`: 투명 픽셀 비율 하한(기본 0.01 = 1%)
- `--border-ratio`: 테두리 두께 비율(기본 0.04 = 4%)
- `--border-alpha-threshold`: 테두리 평균 알파 임계값(기본 245)
- `--manifest`: 선별된 파일의 상대경로 리스트를 JSON으로 기록(카탈로그 연동 시 유용)

프로젝트 구조 예시
- 전체가 `real_data/images`에 모여 있다면 위 예시 그대로 사용하면 됩니다.
- 카테고리별 폴더(top/pants/shoes)라면 각각 실행하거나, 상위 폴더를 `--input`으로 지정해도 됩니다. 결과는 동일한 디렉토리 구조로 `--output` 하위에 복사됩니다.

카탈로그 연동(선택)
- 매니페스트(`data/transparent_manifest.json`)에 포함된 경로만 사용하도록 CSV → `data/catalog.json` 생성 전 필터링할 수 있습니다.
- 간단한 방법:
  1) 먼저 선별/복사로 깨끗한 이미지만 `real_data_no_bg`에 만들기
  2) CSV의 `imageUrl`이 `real_data_no_bg` 경로를 가리키도록 미리 정규화하거나(권장),
  3) 매니페스트에 있는 파일 이름만 허용하는 후처리 파이프라인을 추가하기
- 필요하면 `ingest_csv_to_catalog.py` 직후 `catalog.json`을 매니페스트 기준으로 필터링하는 보조 스크립트를 추가할 수 있습니다. 요청 주시면 작성해 드립니다.

튜닝 가이드
- 배경이 살짝 남는 케이스가 많이 통과하면 `--border-alpha-threshold`를 240→235로 낮추세요.
- 투명 비율이 낮아도 실제로는 잘 잘려있는(테두리만 투명) 제품컷이 많다면 `--min-transparent-ratio`를 0.01→0.005로 낮춰보세요.
- 후보군이 과도하게 줄어든다면 `--border-ratio`를 0.04→0.03로 줄여 테두리 판정 영역을 얇게 하세요.

제한사항 및 후속 작업 아이디어
- 알파 채널이 없는 JPEG/PNG(무알파) 이미지는 “배경 없음”으로 판단할 수 없습니다. 이 경우 배경 제거 모델을 통해 변환 후(예: rembg) 본 스크립트로 2차 검증/선별하는 것이 좋습니다.
- 향후: 배경 제거(batch) → 선별(select) → 카탈로그 필터 → VTO 파이프라인 연계를 자동화하는 PowerShell/Make 타겟을 추가할 수 있습니다.

품질 확인 체크리스트
- 결과 폴더(`--output`)에서 임의 샘플을 열어 실제로 테두리가 투명한지 확인합니다.
- 매니페스트 항목 수와 복사된 파일 수가 일치하는지 확인합니다.
- 카탈로그/프런트에서 보이는 썸네일이 원하지 않는 회색/흰 배경을 포함하지 않는지 확인합니다.

관련 파일
- 스크립트: `backend_py/tools/select_transparent_images.py`
- 카탈로그 인입: `backend_py/tools/ingest_csv_to_catalog.py`
