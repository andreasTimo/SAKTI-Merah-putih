#!/usr/bin/env python3
"""CS9711 partial-print matcher following libfprint's SIGFM approach.

The matcher stores SIFT keypoints/descriptors as SQLite BLOBs. It deliberately
does not persist PGM frames. Scoring parameters are adapted from the SIGFM code
in archeYR/libfprint-CS9711 (LGPL-2.1-or-later).
"""

from __future__ import annotations

import base64
import io
import json
import math
import os
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import cv2
import numpy as np

PORT = int(os.getenv("MATCHER_PORT", "8090"))
DB_PATH = os.getenv("TEMPLATE_DB_PATH", "./data/sakti-sigfm.sqlite")
TARGET_AREAS = int(os.getenv("TARGET_AREAS", "15"))
MATCH_THRESHOLD = int(os.getenv("MATCH_THRESHOLD", "40"))

FORMAT = "sigfm-sift"
FORMAT_VERSION = 1
RATIO_MATCH = 0.75
LENGTH_MATCH = 0.05
ANGLE_MATCH = 0.05
MIN_MATCH = 5


@dataclass(frozen=True)
class Template:
    points: np.ndarray
    descriptors: np.ndarray


def parse_pgm(data: bytes) -> np.ndarray:
    index = 0

    def token() -> bytes:
        nonlocal index
        while index < len(data) and data[index] in b" \t\r\n":
            index += 1
        while index < len(data) and data[index] == ord("#"):
            while index < len(data) and data[index] not in b"\r\n":
                index += 1
            while index < len(data) and data[index] in b" \t\r\n":
                index += 1
        start = index
        while index < len(data) and data[index] not in b" \t\r\n":
            index += 1
        return data[start:index]

    if token() != b"P5":
        raise ValueError("expected binary PGM (P5)")
    width, height, maximum = int(token()), int(token()), int(token())
    if maximum != 255 or width <= 0 or height <= 0:
        raise ValueError("unsupported PGM dimensions or depth")
    if index >= len(data) or data[index] not in b" \t\r\n":
        raise ValueError("missing PGM header separator")
    if data[index:index + 2] == b"\r\n":
        index += 2
    else:
        index += 1
    pixels = data[index:]
    if len(pixels) != width * height:
        raise ValueError(f"truncated PGM pixels: expected {width * height}, got {len(pixels)}")
    return np.frombuffer(pixels, dtype=np.uint8).reshape((height, width))


def extract_template(pgm: bytes) -> Template:
    keypoints, descriptors = cv2.SIFT_create().detectAndCompute(parse_pgm(pgm), None)
    if not keypoints or descriptors is None:
        return Template(np.empty((0, 2), dtype=np.float32), np.empty((0, 128), dtype=np.float32))
    return Template(np.asarray([keypoint.pt for keypoint in keypoints], dtype=np.float32), np.asarray(descriptors, dtype=np.float32))


def serialize_template(template: Template) -> bytes:
    output = io.BytesIO()
    np.savez_compressed(output, points=template.points, descriptors=template.descriptors)
    return output.getvalue()


def deserialize_template(blob: bytes) -> Template:
    with np.load(io.BytesIO(blob), allow_pickle=False) as saved:
        return Template(np.asarray(saved["points"], dtype=np.float32), np.asarray(saved["descriptors"], dtype=np.float32))


def ratio_difference(left: float, right: float) -> float:
    largest = max(abs(left), abs(right))
    return 0.0 if largest == 0 else 1.0 - min(abs(left), abs(right)) / largest


def sigfm_score(frame: Template, enrolled: Template) -> int:
    """SIGFM-style SIFT ratio test followed by geometry-consistency scoring."""
    if len(frame.points) < 2 or len(enrolled.points) < 2:
        return 0
    matches = cv2.BFMatcher().knnMatch(frame.descriptors, enrolled.descriptors, k=2)
    unique: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    for pair in matches:
        if len(pair) < 2:
            continue
        first, second = pair
        if first.distance < RATIO_MATCH * second.distance:
            source = tuple(np.asarray(frame.points[first.queryIdx], dtype=np.int32))
            target = tuple(np.asarray(enrolled.points[first.trainIdx], dtype=np.int32))
            unique.add((source, target))
    if len(unique) < MIN_MATCH:
        return 0

    pairs = list(unique)
    angles: list[tuple[float, float]] = []
    for index, first in enumerate(pairs):
        for second in pairs[index + 1:]:
            vector_a = (first[0][0] - second[0][0], first[0][1] - second[0][1])
            vector_b = (first[1][0] - second[1][0], first[1][1] - second[1][1])
            length_a, length_b = math.hypot(*vector_a), math.hypot(*vector_b)
            if not length_a or not length_b or ratio_difference(length_a, length_b) > LENGTH_MATCH:
                continue
            product = length_a * length_b
            dot = max(-1.0, min(1.0, (vector_a[0] * vector_b[0] + vector_a[1] * vector_b[1]) / product))
            cross = max(-1.0, min(1.0, (vector_a[0] * vector_b[1] - vector_a[1] * vector_b[0]) / product))
            angles.append((math.pi / 2 + math.asin(dot), math.acos(cross)))
    if len(angles) < MIN_MATCH:
        return 0
    return sum(
        ratio_difference(first[0], second[0]) <= ANGLE_MATCH and ratio_difference(first[1], second[1]) <= ANGLE_MATCH
        for index, first in enumerate(angles) for second in angles[index + 1:]
    )


class TemplateStore:
    def __init__(self, path: str):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self.path = path
        self.lock = threading.Lock()
        with self.connect() as db:
            db.execute("""
                CREATE TABLE IF NOT EXISTS sigfm_templates (
                  member_id TEXT NOT NULL,
                  template_index INTEGER NOT NULL,
                  template_format TEXT NOT NULL,
                  format_version INTEGER NOT NULL,
                  template_blob BLOB NOT NULL,
                  created_at TEXT NOT NULL,
                  PRIMARY KEY (member_id, template_index)
                )
            """)

    def connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def load(self) -> dict[str, list[Template]]:
        loaded: dict[str, list[Template]] = {}
        with self.connect() as db:
            rows = db.execute("""
                SELECT member_id, template_blob FROM sigfm_templates
                WHERE template_format = ? AND format_version = ?
                ORDER BY member_id, template_index
            """, (FORMAT, FORMAT_VERSION))
            for member_id, blob in rows:
                loaded.setdefault(member_id, []).append(deserialize_template(blob))
        return loaded

    def append(self, member_id: str, index: int, template: Template) -> None:
        with self.lock, self.connect() as db:
            db.execute("""
                INSERT INTO sigfm_templates
                (member_id, template_index, template_format, format_version, template_blob, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (member_id, index, FORMAT, FORMAT_VERSION, serialize_template(template), datetime.now(timezone.utc).isoformat()))


STORE_BACKEND = TemplateStore(DB_PATH)
STORE = STORE_BACKEND.load()
STORE_LOCK = threading.Lock()


def images_from(body: dict) -> list[bytes]:
    encoded = body.get("images") if isinstance(body.get("images"), list) else [body.get("image")]
    return [base64.b64decode(value) for value in encoded if value]


def best_score(probes: list[Template], candidates: list[Template]) -> int:
    return max((sigfm_score(probe, candidate) for probe in probes for candidate in candidates), default=0)


class Handler(BaseHTTPRequestHandler):
    server_version = "SAKTI-SIGFM/1.0"

    def log_message(self, *_args: object) -> None:
        pass

    def reply(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def body(self) -> dict:
        return json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")

    def do_OPTIONS(self) -> None:
        self.reply(HTTPStatus.NO_CONTENT, {})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            total = sum(len(templates) for templates in STORE.values())
            self.reply(HTTPStatus.OK, {"service": "sakti-sigfm-matcher", "storage": "SQLite BLOB (persistent testing storage)", "templateFormat": FORMAT, "templateFormatVersion": FORMAT_VERSION, "matcher": "SIGFM SIFT + geometric consistency", "threshold": MATCH_THRESHOLD, "target": TARGET_AREAS, "enrolledMembers": len(STORE), "totalTemplates": total})
            return
        if parsed.path == "/diagnostics/member":
            member_id = parse_qs(parsed.query).get("memberId", [""])[0]
            templates = STORE.get(member_id)
            if not templates:
                self.reply(HTTPStatus.NOT_FOUND, {"ok": False, "error": f"member not enrolled: {member_id}"})
                return
            scores = sorted(sigfm_score(left, right) for index, left in enumerate(templates) for right in templates[index + 1:])
            self.reply(HTTPStatus.OK, {
                "ok": True,
                "memberId": member_id,
                "templates": len(templates),
                "pairs": len(scores),
                "threshold": MATCH_THRESHOLD,
                "pairsAtThreshold": sum(score >= MATCH_THRESHOLD for score in scores),
                "bestPairScore": scores[-1] if scores else 0,
                "medianPairScore": scores[len(scores) // 2] if scores else 0,
                "keypoints": {
                    "min": min((len(template.points) for template in templates), default=0),
                    "max": max((len(template.points) for template in templates), default=0),
                },
            })
            return
        self.reply(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        try:
            body = self.body()
            if self.path == "/enroll":
                self.enroll(body)
            elif self.path == "/enroll-tap":
                self.enroll_tap(body)
            elif self.path == "/verify":
                self.verify(body)
            else:
                self.reply(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not found"})
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            self.reply(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(error)})
        except Exception as error:
            self.reply(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "error": type(error).__name__})

    def enroll(self, body: dict) -> None:
        member_id, images = str(body.get("memberId", "")).strip(), images_from(body)
        if not member_id or not images:
            raise ValueError("memberId and non-empty images[] required")
        templates = [extract_template(image) for image in images]
        if any(len(template.points) < MIN_MATCH for template in templates):
            raise ValueError("insufficient SIGFM keypoints; center finger and retry")
        with STORE_LOCK:
            stored = STORE.setdefault(member_id, [])
            for template in templates:
                STORE_BACKEND.append(member_id, len(stored), template)
                stored.append(template)
        self.reply(HTTPStatus.OK, {"ok": True, "memberId": member_id, "templatesAdded": len(templates), "templatesTotal": len(stored)})

    def enroll_tap(self, body: dict) -> None:
        member_id, images = str(body.get("memberId", "")).strip(), images_from(body)
        if not member_id or len(images) != 1:
            raise ValueError("memberId and image required")
        template = extract_template(images[0])
        if len(template.points) < MIN_MATCH:
            raise ValueError("insufficient SIGFM keypoints; center finger and retry")
        with STORE_LOCK:
            stored = STORE.setdefault(member_id, [])
            STORE_BACKEND.append(member_id, len(stored), template)
            stored.append(template)
            total = len(stored)
        self.reply(HTTPStatus.OK, {"ok": True, "memberId": member_id, "accepted": True, "reason": "enrollment-stage", "keypoints": len(template.points), "templatesTotal": total, "target": TARGET_AREAS, "coverageComplete": total >= TARGET_AREAS})

    def verify(self, body: dict) -> None:
        member_id, probes = str(body.get("memberId", "")).strip(), [extract_template(image) for image in images_from(body)]
        candidates = STORE.get(member_id)
        if not candidates:
            self.reply(HTTPStatus.NOT_FOUND, {"ok": False, "error": f"member not enrolled: {member_id}"})
            return
        if not probes:
            raise ValueError("image or non-empty images[] required")
        threshold = int(body.get("threshold", MATCH_THRESHOLD))
        score = best_score(probes, candidates)
        self.reply(HTTPStatus.OK, {"ok": True, "memberId": member_id, "score": score, "threshold": threshold, "matched": score >= threshold, "probeFrames": len(probes), "comparedTemplates": len(candidates), "probeKeypoints": max((len(probe.points) for probe in probes), default=0)})


if __name__ == "__main__":
    print(f"[matcher] SIGFM matcher on :{PORT} (target={TARGET_AREAS}, threshold={MATCH_THRESHOLD})", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
