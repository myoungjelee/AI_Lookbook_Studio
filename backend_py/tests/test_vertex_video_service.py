import sys
from pathlib import Path
import unittest

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.routes.tryon_video import _validate_base64_payload
from app.services.vertex_video_service import VertexVideoService


class VertexVideoServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = VertexVideoService()

    def test_collect_video_uris_handles_nested_predictions(self) -> None:
        sample = {
            "operation": {
                "response": {
                    "predictions": [
                        {"videoUri": "https://example.com/a.mp4"},
                        {
                            "videos": [
                                {"uri": "gs://bucket/video_b.mp4"},
                                {"videoUri": "https://example.com/c.mp4"},
                            ]
                        },
                    ]
                }
            }
        }
        uris = self.service.collect_video_uris(sample)
        self.assertEqual(
            uris,
            [
                "https://example.com/a.mp4",
                "gs://bucket/video_b.mp4",
                "https://example.com/c.mp4",
            ],
        )

    def test_sanitize_parameters_converts_non_strings(self) -> None:
        params = {"durationSeconds": 4, "extra": None, "resolution": "720p"}
        cleaned = self.service._sanitize_parameters(params)  # type: ignore[attr-defined]
        self.assertEqual(cleaned, {"durationSeconds": "4", "resolution": "720p"})


class RouteHelpersTests(unittest.TestCase):
    def test_validate_base64_payload_rejects_invalid(self) -> None:
        with self.assertRaises(Exception):
            _validate_base64_payload("not-base64")

    def test_validate_base64_payload_accepts_valid(self) -> None:
        _validate_base64_payload("dGVzdA==")


if __name__ == "__main__":
    unittest.main()
