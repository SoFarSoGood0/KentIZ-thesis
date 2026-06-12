from __future__ import annotations
import hashlib
import io
import json
import math
import mimetypes
import os
import re
import secrets
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
import csv
import smtplib
from email.message import EmailMessage
from fractions import Fraction
from pathlib import Path
from threading import Lock
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from PIL import ExifTags
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from ultralytics import YOLO
try:
    import torch
except Exception:  # pragma: no cover - torch is expected, but keep import resilient.
    torch = None
try:
    import open_clip
except Exception:  # pragma: no cover - optional dependency for the scene gate.
    open_clip = None


ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
DEFAULT_MODEL_PATH = ROOT / "runs" / "detect" / "runs" / "detect" / "urbanchain_yolov8s_v3_finetune" / "weights" / "best.pt"
MODEL_PATH = Path(os.getenv("URBANCHAIN_MODEL_PATH", str(DEFAULT_MODEL_PATH)))
UPLOAD_DIR = ROOT / "backend" / "uploads"
REPORT_INDEX_PATH = ROOT / "backend" / "uploads" / "report_index.json"
DATABASE_PATH = ROOT / "backend" / "urbanchain.db"
ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
GPS_TAG = next(key for key, value in ExifTags.TAGS.items() if value == "GPSInfo")
WALLET_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
ANONYMOUS_WALLET_LABEL = "anonymous"
LOCATION_MATCH_THRESHOLD_METERS = 250.0
MIN_CONFIDENCE = float(os.getenv("URBANCHAIN_MIN_CONFIDENCE", "0.35"))
# Cop-ozel esik. Eskiden 0.70 idi; alakasiz gorselleri (ornegin tablolar) elemek icin
# yuksek tutulmustu. Artik bu isi CLIP sahne kapisi yaptigi icin esigi dusurup gercek
# cop fotograflarinin yanlislikla reddedilmesini onluyoruz.
MIN_GARBAGE_CONFIDENCE = float(os.getenv("URBANCHAIN_MIN_GARBAGE_CONFIDENCE", "0.45"))
MIN_GARBAGE_BBOX_AREA_RATIO = float(os.getenv("URBANCHAIN_MIN_GARBAGE_BBOX_AREA_RATIO", "0.15"))
# Cikarim cozunurlugu. Model 640px'de egitildi; daha dusuk degerler (orn. 448) guveni
# yapay olarak dusurur. Egitimle ayni tutmak en dogru sonucu verir.
MODEL_IMGSZ = int(os.getenv("URBANCHAIN_MODEL_IMGSZ", "640"))
# Ayni gorselin tekrar yuklenmesini engelleyen kopya (sha256 + algisal hash) kontrolu.
# Varsayilan kapali: kullanici ayni fotografi her durumda yeniden yukleyebilsin.
DUPLICATE_CHECK_ENABLED = os.getenv("URBANCHAIN_DUPLICATE_CHECK", "0").strip().lower() in {"1", "true", "yes", "on"}
# CLIP tabanli "gercek sokak/kent sahnesi mi?" on kapisi. YOLO kapali-kume bir
# dedektor oldugu icin tablo/cizim/ekran goruntusu gibi alakasiz gorselleri de
# zorla bir sinifa sokar; bu kapi onları YOLO'dan once eler.
CLIP_SCENE_GATE_ENABLED = os.getenv("URBANCHAIN_CLIP_SCENE_GATE", "1").strip().lower() not in {"0", "false", "no", "off", ""}
CLIP_MODEL_NAME = os.getenv("URBANCHAIN_CLIP_MODEL", "ViT-B-32-quickgelu").strip()
CLIP_PRETRAINED = os.getenv("URBANCHAIN_CLIP_PRETRAINED", "openai").strip()
# Gercek-dis-mekan etiketlerinin toplam olasiligi bu esigin altindaysa gorsel reddedilir.
CLIP_SCENE_MIN_SCORE = float(os.getenv("URBANCHAIN_CLIP_SCENE_MIN_SCORE", "0.55"))
# (etiket metni, gercek_sokak_sahnesi_mi) ciftleri. softmax tum etiketler uzerinden alinir.
CLIP_SCENE_PROMPTS: list[tuple[str, bool]] = [
    ("a real outdoor photo of a city street", True),
    ("a photo of a road or asphalt pavement", True),
    ("a photo of a sidewalk or curb", True),
    ("a photo of garbage or trash piled on the street", True),
    ("a photo of a pothole or crack on the road", True),
    ("a real photograph taken outdoors with a phone camera", True),
    ("a painting or fine art artwork", False),
    ("a digital illustration or concept art", False),
    ("a drawing, sketch or cartoon", False),
    ("an anime or video game render", False),
    ("a screenshot of an app, website or document", False),
    ("a meme with text", False),
    ("an indoor scene inside a room or building", False),
    ("a close-up portrait of a person or a selfie", False),
    ("a photo of food on a plate", False),
    ("a product photo on a plain background", False),
]
MAX_UPLOAD_BYTES = int(os.getenv("URBANCHAIN_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
REPORT_POINTS = {
    "pothole": 10,
    "garbage": 5,
    "sidewalk": 7,
    "alligator_crack": 8,
    "block_crack": 6,
    "longitudinal_crack": 8,
    "oblique_crack": 8,
    "repair": 1,
    "transverse_crack": 8,
}
ALLOWED_STATUSES = {"pending_review", "in_review", "approved", "rejected"}
REVIEW_STATUS_LABELS_TR: dict[str, str] = {
    "pending_review": "İnceleme bekliyor",
    "in_review": "İncelemede",
    "approved": "Onaylandı",
    "rejected": "Reddedildi",
}
REPORT_TYPE_LABELS_TR: dict[str, str] = {
    "pothole": "Yol çukuru",
    "garbage": "Çöp",
    "sidewalk": "Kaldırım hasarı",
    "road_damage": "Yol hasarı",
    "pavement_damage": "Kaldırım hasarı",
    "alligator_crack": "Çatlak",
    "block_crack": "Çatlak",
    "longitudinal_crack": "Çatlak",
    "oblique_crack": "Çatlak",
    "transverse_crack": "Çatlak",
    "repair": "Onarım ihtiyacı",
}
REVIEW_STATUS_NOTIF_TR: dict[str, str] = {
    "pending_review": "Bildiriminiz inceleme sırasına alındı.",
    "in_review": "Bildiriminiz inceleniyor.",
    "approved": "Bildiriminiz onaylandı.",
    "rejected": "Bildiriminiz reddedildi.",
}
INTERVENTION_STATUS_LABELS_TR: dict[str, str] = {
    "pending_dispatch": "Atama bekliyor",
    "assigned": "Atandı",
    "in_progress": "İşlemde",
    "resolved": "Çözüldü",
}
INTERVENTION_STATUS_NOTIF_TR: dict[str, str] = {
    "pending_dispatch": "Bildiriminiz saha ekibine aktarılmayı bekliyor.",
    "assigned": "Bildiriminiz bir saha ekibine atandı.",
    "in_progress": "Saha ekibi bildiriminiz için çalışmaya başladı.",
    "resolved": "Bildiriminiz saha ekibi tarafından çözüldü.",
}
REVIEW_STATUS_TRANSITIONS = {
    "pending_review": {"in_review"},
    "in_review": {"approved", "rejected"},
    "approved": set(),
    "rejected": set(),
}
ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "URBANCHAIN_ALLOW_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,"
        "http://127.0.0.1:4173,http://localhost:4173,"
        "http://127.0.0.1:3000,http://localhost:3000,"
        "http://127.0.0.1:5500,http://localhost:5500,"
        "http://127.0.0.1:8000,http://localhost:8000",
    ).split(",")
    if origin.strip()
]
ALLOW_ORIGIN_REGEX = os.getenv(
    "URBANCHAIN_ALLOW_ORIGIN_REGEX",
    r"^https?://("
    r"localhost|127\.0\.0\.1|0\.0\.0\.0|"
    r"10(?:\.\d{1,3}){3}|"
    r"192\.168(?:\.\d{1,3}){2}|"
    r"172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}"
    r")(:\d+)?$",
)
ADMIN_LOGIN_MAX_ATTEMPTS = int(os.getenv("URBANCHAIN_ADMIN_LOGIN_MAX_ATTEMPTS", "5"))
ADMIN_LOGIN_WINDOW_MINUTES = int(os.getenv("URBANCHAIN_ADMIN_LOGIN_WINDOW_MINUTES", "15"))
PERCEPTUAL_HASH_DISTANCE_THRESHOLD = int(os.getenv("URBANCHAIN_PERCEPTUAL_HASH_DISTANCE_THRESHOLD", "6"))
ROLE_LEVELS = {"viewer": 1, "reviewer": 2, "admin": 3}
EMAIL_RE = re.compile(r"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$", re.IGNORECASE)
CITIZEN_SESSION_HOURS = int(os.getenv("URBANCHAIN_CITIZEN_SESSION_HOURS", "24"))
CITIZEN_VERIFICATION_MINUTES = int(os.getenv("URBANCHAIN_CITIZEN_VERIFICATION_MINUTES", "15"))
SMTP_HOST = os.getenv("URBANCHAIN_SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("URBANCHAIN_SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("URBANCHAIN_SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("URBANCHAIN_SMTP_PASSWORD", "").strip()
SMTP_FROM_EMAIL = os.getenv("URBANCHAIN_SMTP_FROM_EMAIL", SMTP_USERNAME or "no-reply@urbanchain.local").strip()
PRIORITY_TYPE_WEIGHTS = {
    "pothole": 58,
    "sidewalk": 44,
    "garbage": 32,
    "alligator_crack": 46,
    "block_crack": 42,
    "longitudinal_crack": 48,
    "oblique_crack": 44,
    "repair": 18,
    "transverse_crack": 47,
}
PRIORITY_STATUS_BOOST = {"pending_review": 12, "in_review": 8, "approved": 2, "rejected": -30}
ALLOWED_INTERVENTION_STATUSES = {"pending_dispatch", "assigned", "in_progress", "resolved"}
INTERVENTION_STATUS_TRANSITIONS = {
    "pending_dispatch": {"assigned"},
    "assigned": {"in_progress", "resolved"},
    "in_progress": {"resolved"},
    "resolved": set(),
}

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="UrbanChain AI API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_origin_regex=ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


model: YOLO | None = None
clip_model: object | None = None
clip_preprocess: object | None = None
clip_text_features: object | None = None  # onceden hesaplanmis, normalize edilmis metin gomuleri
clip_accept_mask: object | None = None  # her etiket gercek-sahne mi (bool tensor)
clip_load_failed = False
clip_lock = Lock()
report_index_lock = Lock()
db_lock = Lock()
admin_sessions_lock = Lock()
admin_sessions: dict[str, dict[str, str]] = {}
admin_verifications_lock = Lock()
admin_verifications: dict[str, dict[str, str]] = {}
citizen_sessions_lock = Lock()
citizen_sessions: dict[str, dict[str, str]] = {}
admin_login_attempts_lock = Lock()
admin_login_attempts: dict[str, list[str]] = {}


class ReportStatusUpdate(BaseModel):
    status: str


class ReportAssignmentUpdate(BaseModel):
    assigned_team: str = ""
    assigned_to: str = ""
    intervention_status: str = "pending_dispatch"


class ReportNotesUpdate(BaseModel):
    notes: str = ""


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminVerifyRequest(BaseModel):
    username: str
    challenge_id: str
    code: str


class AdminSessionResponse(BaseModel):
    token: str
    username: str
    role: str
    expires_at: str
    province_scope: str | None = None
    district_scopes: list[str] = Field(default_factory=list)


class CitizenRegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str


class CitizenVerifyRequest(BaseModel):
    email: str
    code: str


class CitizenLoginRequest(BaseModel):
    email: str
    password: str


class CitizenPasswordResetRequest(BaseModel):
    email: str


class CitizenPasswordResetConfirmRequest(BaseModel):
    email: str
    code: str
    password: str


class CitizenSessionResponse(BaseModel):
    token: str
    user_id: int
    full_name: str
    email: str
    verified: bool


def load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and (key not in os.environ or not str(os.environ.get(key, "")).strip()):
            os.environ[key] = value


load_env_file(ENV_PATH)

PRODUCT_NAME = os.getenv("URBANCHAIN_PRODUCT_NAME", "Kentİz").strip() or "Kentİz"
CITIZEN_VERIFICATION_MINUTES = int(os.getenv("URBANCHAIN_CITIZEN_VERIFICATION_MINUTES", str(CITIZEN_VERIFICATION_MINUTES)))
CITIZEN_PASSWORD_RESET_MINUTES = int(os.getenv("URBANCHAIN_CITIZEN_PASSWORD_RESET_MINUTES", "15"))
ADMIN_EMAIL_VERIFICATION_MINUTES = int(os.getenv("URBANCHAIN_ADMIN_EMAIL_VERIFICATION_MINUTES", "10"))
EMAIL_REQUIRE_SMTP = os.getenv("URBANCHAIN_REQUIRE_SMTP", "0").strip().lower() in {"1", "true", "yes", "on"}
EMAIL_EXPOSE_DEV_CODES = os.getenv("URBANCHAIN_EXPOSE_DEV_CODES", "0").strip().lower() in {"1", "true", "yes", "on"}
ADMIN_USERNAME = os.getenv("URBANCHAIN_ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("URBANCHAIN_ADMIN_PASSWORD", "admin123")
ADMIN_SESSION_HOURS = int(os.getenv("URBANCHAIN_ADMIN_SESSION_HOURS", "12"))
IPFS_PROVIDER = os.getenv("URBANCHAIN_IPFS_PROVIDER", "pinata")
IPFS_PIN_URL = os.getenv("URBANCHAIN_IPFS_PIN_URL", "https://api.pinata.cloud/pinning/pinFileToIPFS")
IPFS_JWT = os.getenv("URBANCHAIN_IPFS_JWT", "")
IPFS_GATEWAY = os.getenv("URBANCHAIN_IPFS_GATEWAY", "https://gateway.pinata.cloud/ipfs")
IPFS_TIMEOUT_SECONDS = int(os.getenv("URBANCHAIN_IPFS_TIMEOUT_SECONDS", "30"))
LOCATION_GEOCODER_URL = os.getenv(
    "URBANCHAIN_LOCATION_GEOCODER_URL",
    "https://nominatim.openstreetmap.org/reverse",
)
LOCATION_GEOCODER_USER_AGENT = os.getenv("URBANCHAIN_LOCATION_GEOCODER_USER_AGENT", "UrbanChain/1.0")
LOCATION_GEOCODER_TIMEOUT_SECONDS = int(os.getenv("URBANCHAIN_LOCATION_GEOCODER_TIMEOUT_SECONDS", "15"))


def load_admin_users() -> dict[str, dict[str, str]]:
    raw_users_json = os.getenv("URBANCHAIN_ADMIN_USERS_JSON", "").strip()
    if raw_users_json:
        try:
            parsed = json.loads(raw_users_json)
            entries = parsed.values() if isinstance(parsed, dict) else parsed
            users: dict[str, dict[str, str]] = {}
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                username = str(entry.get("username") or entry.get("email") or "").strip().lower()
                admin_email = str(entry.get("email") or (username if EMAIL_RE.match(username) else "")).strip().lower()
                password = str(entry.get("password", "")).strip()
                role = str(entry.get("role", "viewer")).strip().lower()
                province_scope = str(entry.get("province_scope") or entry.get("province") or entry.get("city") or "").strip()
                district_scopes_raw = entry.get("district_scopes", [])
                district_scope = str(entry.get("district_scope", "")).strip()
                district_scopes: list[str] = []
                if isinstance(district_scopes_raw, list):
                    district_scopes.extend(str(item).strip() for item in district_scopes_raw if str(item).strip())
                if district_scope:
                    district_scopes.append(district_scope)
                district_scopes = sorted({scope for scope in district_scopes if scope})
                if username and password and role in ROLE_LEVELS:
                    users[username] = {
                        "email": admin_email,
                        "password": password,
                        "role": role,
                        "province_scope": province_scope,
                        "district_scopes": json.dumps(district_scopes, ensure_ascii=False),
                    }
            if users:
                return users
        except json.JSONDecodeError:
            pass

    default_admin_email = os.getenv(
        "URBANCHAIN_ADMIN_EMAIL",
        ADMIN_USERNAME if EMAIL_RE.match(ADMIN_USERNAME.strip()) else "",
    ).strip().lower()
    default_admin_username = ADMIN_USERNAME.strip().lower()
    return {
        default_admin_username: {
            "email": default_admin_email,
            "password": ADMIN_PASSWORD,
            "role": os.getenv("URBANCHAIN_ADMIN_DEFAULT_ROLE", "admin").strip().lower()
            if os.getenv("URBANCHAIN_ADMIN_DEFAULT_ROLE", "admin").strip().lower() in ROLE_LEVELS
            else "admin",
            "province_scope": os.getenv("URBANCHAIN_ADMIN_DEFAULT_PROVINCE_SCOPE", "").strip(),
            "district_scopes": os.getenv("URBANCHAIN_ADMIN_DEFAULT_DISTRICT_SCOPES_JSON", "[]").strip(),
        }
    }


ADMIN_USERS = load_admin_users()


def parse_district_scopes(raw_value: object) -> list[str]:
    if raw_value is None:
        return []
    if isinstance(raw_value, list):
        return sorted({str(item).strip() for item in raw_value if str(item).strip()})
    if isinstance(raw_value, str):
        try:
            parsed = json.loads(raw_value)
        except json.JSONDecodeError:
            return sorted({scope.strip() for scope in raw_value.split(",") if scope.strip()})
        if isinstance(parsed, list):
            return sorted({str(item).strip() for item in parsed if str(item).strip()})
    return []


def normalize_team_label(team_label: object, *, province: str = "", district: str = "", report_type: str = "") -> str:
    raw_label = " ".join(str(team_label or "").split()).strip()
    if not raw_label:
        return ""

    lowered = raw_label.casefold()
    district_prefix = district.strip() or province.strip()
    municipality_prefix = f"{district_prefix} Belediyesi" if district_prefix else ""
    if report_type == "garbage" or "sanitation" in lowered or "temizlik" in lowered or "garbage" in lowered:
        return f"{municipality_prefix} Temizlik İşleri ve Atık Toplama Ekibi".strip()
    if report_type == "sidewalk" or any(keyword in lowered for keyword in ("sidewalk", "kaldırım", "side walk", "crack", "repair")):
        return f"{municipality_prefix} Kaldırım Bakım ve Onarım Ekibi".strip()
    if report_type == "pothole" or any(keyword in lowered for keyword in ("pothole", "road", "asphalt", "yol")):
        return f"{municipality_prefix} Yol Bakım ve Asfalt Onarım Ekibi".strip()

    if "ekibi" in lowered or "müdürlüğü" in lowered or "mudurlugu" in lowered:
        return raw_label

    return raw_label


def infer_province_from_username(username: str) -> str:
    username = username.strip().lower()
    if "@" not in username:
        return ""
    domain = username.split("@", 1)[1]
    if domain.endswith(".gov.tr"):
        province_key = domain[: -len(".gov.tr")].replace(".", " ").replace("-", " ").strip()
        province_aliases = {
            "nigde": "Niğde",
            "niğde": "Niğde",
            "istanbul": "İstanbul",
            "ankara": "Ankara",
            "izmir": "İzmir",
            "bursa": "Bursa",
            "adana": "Adana",
            "antalya": "Antalya",
            "konya": "Konya",
            "kocaeli": "Kocaeli",
            "gaziantep": "Gaziantep",
            "kayseri": "Kayseri",
            "mersin": "Mersin",
            "samsun": "Samsun",
            "eskisehir": "Eskişehir",
            "eskişehir": "Eskişehir",
            "diyarbakir": "Diyarbakır",
            "diyarbakır": "Diyarbakır",
            "sakarya": "Sakarya",
            "trabzon": "Trabzon",
            "manisa": "Manisa",
            "malatya": "Malatya",
            "sanliurfa": "Şanlıurfa",
            "şanlıurfa": "Şanlıurfa",
            "tekirdag": "Tekirdağ",
            "tekirdağ": "Tekirdağ",
            "kırklareli": "Kırklareli",
            "kirklareli": "Kırklareli",
        }
        if province_key in province_aliases:
            return province_aliases[province_key]
        return province_key.title()
    return ""


def build_admin_scope_conditions(session: dict[str, str]) -> tuple[list[str], list[object]]:
    conditions: list[str] = []
    params: list[object] = []
    province_scope = str(session.get("province_scope") or "").strip()
    district_scopes = parse_district_scopes(session.get("district_scopes"))
    if province_scope:
        conditions.append("province_name = ?")
        params.append(province_scope)
    if district_scopes:
        placeholders = ", ".join("?" for _ in district_scopes)
        conditions.append(f"district_name IN ({placeholders})")
        params.extend(district_scopes)
    return conditions, params


def build_citizen_scope_conditions(session: dict[str, str]) -> tuple[list[str], list[object]]:
    email = str(session.get("email") or "").strip().lower()
    user_id = int(str(session.get("user_id") or "0") or 0)
    if user_id > 0 and email:
        return ["(citizen_user_id = ? OR (citizen_user_id IS NULL AND LOWER(wallet_address) = ?))"], [user_id, email]
    if user_id > 0:
        return ["citizen_user_id = ?"], [user_id]
    if not email:
        return ["1=0"], []
    return ["LOWER(wallet_address) = ?"], [email]


def apply_scope_filter_to_query(
    query: str,
    conditions: list[str],
    params: list[object],
    session: dict[str, str] | None = None,
) -> tuple[str, list[object]]:
    if session is not None:
        scope_conditions, scope_params = build_admin_scope_conditions(session)
        if scope_conditions:
            conditions.extend(scope_conditions)
            params.extend(scope_params)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    return query, params


def build_scoped_query(
    base_sql: str,
    *,
    session: dict[str, str] | None = None,
    extra_conditions: list[str] | None = None,
    extra_params: list[object] | None = None,
) -> tuple[str, tuple[object, ...]]:
    conditions = list(extra_conditions or [])
    params = list(extra_params or [])
    scope_conditions, scope_params = build_admin_scope_conditions(session or {})
    conditions.extend(scope_conditions)
    params.extend(scope_params)
    if conditions:
        condition_sql = " AND ".join(conditions)
        upper_sql = base_sql.upper()
        where_index = upper_sql.find(" WHERE ")
        clause_indexes = [idx for idx in [upper_sql.find(" GROUP BY "), upper_sql.find(" ORDER BY "), upper_sql.find(" LIMIT "), upper_sql.find(" OFFSET ")] if idx != -1]
        insert_index = min(clause_indexes) if clause_indexes else len(base_sql)
        if where_index != -1 and (not clause_indexes or where_index < insert_index):
            base_sql = f"{base_sql[:insert_index]} AND {condition_sql}{base_sql[insert_index:]}"
        else:
            base_sql = f"{base_sql[:insert_index]} WHERE {condition_sql}{base_sql[insert_index:]}"
    return base_sql, tuple(params)


def report_in_admin_scope(report: dict[str, object], session: dict[str, str]) -> bool:
    province_scope = str(session.get("province_scope") or "").strip()
    district_scopes = parse_district_scopes(session.get("district_scopes"))
    if not province_scope and not district_scopes:
        return True
    location_scope = report.get("location_scope") if isinstance(report.get("location_scope"), dict) else {}
    report_province = str(location_scope.get("province") or "").strip()
    report_district = str(location_scope.get("district") or "").strip()
    if province_scope and report_province != province_scope:
        return False
    if district_scopes and report_district not in district_scopes:
        return False
    return True


def get_model() -> YOLO:
    global model
    if model is None:
        if not MODEL_PATH.exists():
            raise RuntimeError(f"Model not found: {MODEL_PATH}")
        model = YOLO(str(MODEL_PATH))
    return model


def resolve_model_device() -> str | int:
    configured_device = os.getenv("URBANCHAIN_MODEL_DEVICE", "").strip()
    if configured_device:
        return configured_device
    if torch is not None and torch.cuda.is_available():
        return 0
    return "cpu"


def _clip_device() -> str:
    device = resolve_model_device()
    if isinstance(device, int):
        return f"cuda:{device}"
    return str(device)


def _load_clip() -> bool:
    """CLIP modelini ve etiket gomulerini tembel (lazy) yukler. Basarisizsa False doner."""
    global clip_model, clip_preprocess, clip_text_features, clip_accept_mask, clip_load_failed
    if clip_load_failed:
        return False
    if clip_model is not None:
        return True
    with clip_lock:
        if clip_model is not None:
            return True
        if clip_load_failed:
            return False
        if open_clip is None or torch is None:
            print("[scene-gate] open_clip veya torch bulunamadi; sahne kapisi devre disi.")
            clip_load_failed = True
            return False
        try:
            device = _clip_device()
            net, _, preprocess = open_clip.create_model_and_transforms(
                CLIP_MODEL_NAME, pretrained=CLIP_PRETRAINED, device=device
            )
            net.eval()
            tokenizer = open_clip.get_tokenizer(CLIP_MODEL_NAME)
            prompts = [text for text, _ in CLIP_SCENE_PROMPTS]
            tokens = tokenizer(prompts).to(device)
            with torch.no_grad():
                text_features = net.encode_text(tokens)
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            clip_model = net
            clip_preprocess = preprocess
            clip_text_features = text_features
            clip_accept_mask = torch.tensor(
                [is_accept for _, is_accept in CLIP_SCENE_PROMPTS], device=device
            )
            print(f"[scene-gate] CLIP yuklendi: {CLIP_MODEL_NAME}/{CLIP_PRETRAINED} @ {device}")
            return True
        except Exception as exc:  # pragma: no cover - agirliklar indirilemezse vb.
            print(f"[scene-gate] CLIP yuklenemedi ({exc}); sahne kapisi atlaniyor.")
            clip_load_failed = True
            return False


def evaluate_scene_gate(image_path: Path) -> dict[str, object] | None:
    """Gorselin gercek bir sokak/kent fotografi olup olmadigini olcer.

    Doner: {"is_real_scene": bool, "scene_score": float, "top_label": str} veya
    kapi devre disi/yuklenememisse None (bu durumda cagiran taraf gecise izin verir).
    """
    if not CLIP_SCENE_GATE_ENABLED:
        return None
    if not _load_clip():
        return None
    try:
        device = _clip_device()
        image = Image.open(image_path).convert("RGB")
        tensor = clip_preprocess(image).unsqueeze(0).to(device)
        with torch.no_grad():
            image_features = clip_model.encode_image(tensor)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            logit_scale = clip_model.logit_scale.exp()
            logits = (logit_scale * image_features @ clip_text_features.T).squeeze(0)
            probs = logits.softmax(dim=-1)
        accept_score = float(probs[clip_accept_mask].sum().item())
        top_index = int(probs.argmax().item())
        return {
            "is_real_scene": accept_score >= CLIP_SCENE_MIN_SCORE,
            "scene_score": round(accept_score, 4),
            "top_label": CLIP_SCENE_PROMPTS[top_index][0],
        }
    except Exception as exc:  # pragma: no cover - calisma zamani hatasinda gecise izin ver.
        print(f"[scene-gate] degerlendirme hatasi ({exc}); gorsele izin veriliyor.")
        return None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_iso_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


def prune_admin_sessions() -> None:
    now = utc_now()
    expired_tokens = [
        token
        for token, session in admin_sessions.items()
        if parse_iso_datetime(session["expires_at"]) <= now
    ]
    for token in expired_tokens:
        admin_sessions.pop(token, None)


def prune_admin_verifications() -> None:
    now = utc_now()
    expired_ids = [
        challenge_id
        for challenge_id, challenge in admin_verifications.items()
        if parse_iso_datetime(challenge["expires_at"]) <= now
    ]
    for challenge_id in expired_ids:
        admin_verifications.pop(challenge_id, None)


def create_admin_verification(username: str) -> dict[str, object]:
    user_record = ADMIN_USERS.get(username)
    if not user_record:
        raise HTTPException(status_code=401, detail="Invalid admin credentials.")

    admin_email = str(user_record.get("email") or "").strip().lower()
    if not admin_email or not EMAIL_RE.match(admin_email):
        raise HTTPException(
            status_code=500,
            detail="Bu admin kullanıcısı için geçerli bir yetkili e-posta tanımlı değil.",
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge_id = secrets.token_urlsafe(24)
    expires_at = (utc_now() + timedelta(minutes=ADMIN_EMAIL_VERIFICATION_MINUTES)).isoformat()
    with admin_verifications_lock:
        prune_admin_verifications()
        admin_verifications[challenge_id] = {
            "username": username,
            "code_hash": hashlib.sha256(code.encode("utf-8")).hexdigest(),
            "expires_at": expires_at,
        }

    delivery = send_admin_login_email(admin_email, code)
    response: dict[str, object] = {
        "status": "verification_required",
        "username": username,
        "challenge_id": challenge_id,
        "masked_email": mask_email(admin_email),
        "delivery": delivery,
        "expires_at": expires_at,
        "message": "Yetkili e-posta adresine doğrulama kodu gönderildi.",
    }
    if delivery == "log":
        response["message"] = "SMTP ayarlı değil. Kod backend terminaline yazıldı."
        if EMAIL_EXPOSE_DEV_CODES:
            response["development_code"] = code
    return response


def consume_admin_verification(username: str, challenge_id: str, code: str) -> None:
    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(status_code=400, detail="Doğrulama kodu 6 haneli olmalı.")

    with admin_verifications_lock:
        prune_admin_verifications()
        challenge = admin_verifications.get(challenge_id)
        if not challenge or challenge.get("username") != username:
            raise HTTPException(status_code=401, detail="Doğrulama isteği geçersiz veya süresi dolmuş.")

        expected_hash = str(challenge.get("code_hash") or "")
        code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
        if not secrets.compare_digest(code_hash, expected_hash):
            raise HTTPException(status_code=400, detail="Doğrulama kodu hatalı.")

        admin_verifications.pop(challenge_id, None)


def create_admin_session(username: str) -> AdminSessionResponse:
    token = secrets.token_urlsafe(32)
    expires_at = (utc_now() + timedelta(hours=ADMIN_SESSION_HOURS)).isoformat()
    user_record = ADMIN_USERS.get(username, {"role": "viewer", "province_scope": "", "district_scopes": "[]"})
    district_scopes = parse_district_scopes(user_record.get("district_scopes"))
    province_scope = str(user_record.get("province_scope") or "").strip() or infer_province_from_username(username)
    with admin_sessions_lock:
        prune_admin_sessions()
        admin_sessions[token] = {
            "username": username,
            "role": str(user_record["role"]),
            "expires_at": expires_at,
            "province_scope": province_scope,
            "district_scopes": json.dumps(district_scopes, ensure_ascii=False),
        }
    return AdminSessionResponse(
        token=token,
        username=username,
        role=str(user_record["role"]),
        expires_at=expires_at,
        province_scope=province_scope or None,
        district_scopes=district_scopes,
    )


def get_admin_session(token: str | None) -> dict[str, str]:
    if not token:
        raise HTTPException(status_code=401, detail="Admin authentication required.")
    with admin_sessions_lock:
        prune_admin_sessions()
        session = admin_sessions.get(token)
    if session is None:
        raise HTTPException(status_code=401, detail="Admin session is invalid or expired.")
    return session


def require_admin_token(authorization: str | None = Header(default=None)) -> dict[str, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Admin authentication required.")
    token = authorization.split(" ", 1)[1].strip()
    return get_admin_session(token)


def normalize_admin_identifier(username: str) -> str:
    normalized = username.strip().lower()
    if not normalized:
        raise HTTPException(status_code=400, detail="Yetkili e-posta adresi gerekli.")
    return normalized


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not EMAIL_RE.match(normalized):
        raise HTTPException(status_code=400, detail="Geçerli bir e-posta adresi girin.")
    return normalized


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not local or not domain:
        return email
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}{'*' * max(3, len(local) - len(visible))}@{domain}"


def hash_password(password: str, salt: str | None = None) -> str:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Şifre en az 8 karakter olmalı.")
    salt_value = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_value.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256${salt_value}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, salt, expected = stored_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    candidate = hash_password(password, salt).split("$", 2)[2]
    return secrets.compare_digest(candidate, expected)


def send_verification_email(email: str, code: str) -> str:
    subject = f"{PRODUCT_NAME} doğrulama kodu"
    body = (
        f"{PRODUCT_NAME} hesabınızı doğrulamak için kodunuz:\n\n"
        f"{code}\n\n"
        f"Bu kod {CITIZEN_VERIFICATION_MINUTES} dakika geçerlidir."
    )
    if not SMTP_HOST:
        print(f"[{PRODUCT_NAME}] Citizen verification code for {email}: {code}")
        return "log"

    message = EmailMessage()
    message["From"] = SMTP_FROM_EMAIL
    message["To"] = email
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if SMTP_USERNAME:
            smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
        smtp.send_message(message)
    return "email"


def send_verification_email_runtime(email: str, code: str) -> str:
    smtp_host = os.getenv("URBANCHAIN_SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("URBANCHAIN_SMTP_PORT", "587"))
    smtp_username = os.getenv("URBANCHAIN_SMTP_USERNAME", "").strip()
    smtp_password = os.getenv("URBANCHAIN_SMTP_PASSWORD", "").strip()
    smtp_from_email = os.getenv(
        "URBANCHAIN_SMTP_FROM_EMAIL", smtp_username or "no-reply@urbanchain.local"
    ).strip()
    subject = f"{PRODUCT_NAME} doğrulama kodu"
    body = (
        f"{PRODUCT_NAME} hesabınızı doğrulamak için kodunuz:\n\n"
        f"{code}\n\n"
        f"Bu kod {CITIZEN_VERIFICATION_MINUTES} dakika geçerlidir."
    )
    if not smtp_host:
        if EMAIL_REQUIRE_SMTP:
            raise HTTPException(status_code=503, detail="E-posta servisi henüz yapılandırılmadı.")
        print(f"[{PRODUCT_NAME}] Citizen verification code for {email}: {code}")
        return "log"

    message = EmailMessage()
    message["From"] = smtp_from_email
    message["To"] = email
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if smtp_username:
                smtp.login(smtp_username, smtp_password)
            smtp.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "SMTP kimlik doğrulaması başarısız. Gmail için normal hesap şifresi değil, "
                "2 adımlı doğrulama açıkken oluşturulan App Password kullanın."
            ),
        ) from exc
    return "email"


def send_password_reset_email_runtime(email: str, code: str) -> str:
    smtp_host = os.getenv("URBANCHAIN_SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("URBANCHAIN_SMTP_PORT", "587"))
    smtp_username = os.getenv("URBANCHAIN_SMTP_USERNAME", "").strip()
    smtp_password = os.getenv("URBANCHAIN_SMTP_PASSWORD", "").strip()
    smtp_from_email = os.getenv(
        "URBANCHAIN_SMTP_FROM_EMAIL", smtp_username or "no-reply@urbanchain.local"
    ).strip()
    subject = f"{PRODUCT_NAME} şifre sıfırlama kodu"
    body = (
        f"{PRODUCT_NAME} hesabınızın şifresini sıfırlamak için kodunuz:\n\n"
        f"{code}\n\n"
        f"Bu kod {CITIZEN_PASSWORD_RESET_MINUTES} dakika geçerlidir. "
        "Bu işlemi siz başlatmadıysanız bu e-postayı yok sayın."
    )
    if not smtp_host:
        if EMAIL_REQUIRE_SMTP:
            raise HTTPException(status_code=503, detail="E-posta servisi henüz yapılandırılmadı.")
        print(f"[{PRODUCT_NAME}] Citizen password reset code for {email}: {code}")
        return "log"

    message = EmailMessage()
    message["From"] = smtp_from_email
    message["To"] = email
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if smtp_username:
                smtp.login(smtp_username, smtp_password)
            smtp.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "SMTP kimlik doğrulaması başarısız. Gmail için normal hesap şifresi değil, "
                "2 adımlı doğrulama açıkken oluşturulan App Password kullanın."
            ),
        ) from exc
    return "email"


def send_admin_login_email(email: str, code: str) -> str:
    smtp_host = os.getenv("URBANCHAIN_SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("URBANCHAIN_SMTP_PORT", "587"))
    smtp_username = os.getenv("URBANCHAIN_SMTP_USERNAME", "").strip()
    smtp_password = os.getenv("URBANCHAIN_SMTP_PASSWORD", "").strip()
    smtp_from_email = os.getenv(
        "URBANCHAIN_SMTP_FROM_EMAIL", smtp_username or "no-reply@urbanchain.local"
    ).strip()
    subject = f"{PRODUCT_NAME} yetkili giriş kodu"
    body = (
        f"{PRODUCT_NAME} yönetim paneline giriş için doğrulama kodunuz:\n\n"
        f"{code}\n\n"
        f"Bu kod {ADMIN_EMAIL_VERIFICATION_MINUTES} dakika geçerlidir. "
        "Bu işlemi siz başlatmadıysanız bu e-postayı yok sayın."
    )
    if not smtp_host:
        if EMAIL_REQUIRE_SMTP:
            raise HTTPException(status_code=503, detail="E-posta servisi henüz yapılandırılmadı.")
        print(f"[{PRODUCT_NAME}] Admin login verification code for {email}: {code}")
        return "log"

    message = EmailMessage()
    message["From"] = smtp_from_email
    message["To"] = email
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if smtp_username:
                smtp.login(smtp_username, smtp_password)
            smtp.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "SMTP kimlik doğrulaması başarısız. Gmail için normal hesap şifresi değil, "
                "2 adımlı doğrulama açıkken oluşturulan App Password kullanın."
            ),
        ) from exc
    return "email"


def create_citizen_session(email: str, full_name: str, user_id: int) -> CitizenSessionResponse:
    token = secrets.token_urlsafe(32)
    expires_at = (utc_now() + timedelta(hours=CITIZEN_SESSION_HOURS)).isoformat()
    with citizen_sessions_lock:
        citizen_sessions[token] = {"user_id": str(user_id), "email": email, "full_name": full_name, "expires_at": expires_at}
    return CitizenSessionResponse(token=token, user_id=user_id, full_name=full_name, email=email, verified=True)


def get_citizen_session(token: str | None) -> dict[str, str] | None:
    if not token:
        return None
    with citizen_sessions_lock:
        session = citizen_sessions.get(token)
        if not session:
            return None
        if datetime.fromisoformat(session["expires_at"]) <= utc_now():
            citizen_sessions.pop(token, None)
            return None
        return session


def require_citizen_token(authorization: str | None = Header(default=None)) -> dict[str, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Giriş yapmanız gerekiyor.")
    session = get_citizen_session(authorization.split(" ", 1)[1].strip())
    if not session:
        raise HTTPException(status_code=401, detail="Oturum geçersiz veya süresi dolmuş.")
    return session


def get_citizen_identity(session: dict[str, str]) -> tuple[int, str]:
    try:
        user_id = int(str(session.get("user_id") or "0"))
    except ValueError:
        user_id = 0
    email = str(session.get("email") or "").strip().lower()
    if user_id <= 0 and email:
        row = get_citizen_by_email(email)
        if row is not None:
            user_id = int(row["id"])
            session["user_id"] = str(user_id)
    return user_id, email


def report_belongs_to_citizen(report: dict[str, object] | None, session: dict[str, str] | None) -> bool:
    if not report or not session:
        return False
    user_id, email = get_citizen_identity(session)
    report_user_id = int(report.get("citizen_user_id") or 0)
    if user_id > 0 and report_user_id == user_id:
        return True
    return bool(email and str(report.get("wallet_address") or "").strip().lower() == email)


def require_role(session: dict[str, str], minimum_role: str) -> None:
    session_role = session.get("role", "viewer")
    if ROLE_LEVELS.get(session_role, 0) < ROLE_LEVELS.get(minimum_role, 99):
        raise HTTPException(status_code=403, detail="You do not have permission for this action.")


def get_login_attempt_key(request: Request, username: str) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    client_host = forwarded_for or (request.client.host if request.client else "unknown")
    return f"{client_host}:{username.lower()}"


def prune_login_attempts(now: datetime) -> None:
    cutoff = now - timedelta(minutes=ADMIN_LOGIN_WINDOW_MINUTES)
    expired_keys = []
    for key, attempt_list in admin_login_attempts.items():
        recent_attempts = [value for value in attempt_list if parse_iso_datetime(value) > cutoff]
        if recent_attempts:
            admin_login_attempts[key] = recent_attempts
        else:
            expired_keys.append(key)
    for key in expired_keys:
        admin_login_attempts.pop(key, None)


def assert_login_allowed(request: Request, username: str) -> None:
    now = utc_now()
    attempt_key = get_login_attempt_key(request, username)
    with admin_login_attempts_lock:
        prune_login_attempts(now)
        attempts = admin_login_attempts.get(attempt_key, [])
        if len(attempts) >= ADMIN_LOGIN_MAX_ATTEMPTS:
            raise HTTPException(status_code=429, detail="Too many login attempts. Please wait and try again.")


def record_failed_login(request: Request, username: str) -> None:
    now = utc_now().isoformat()
    attempt_key = get_login_attempt_key(request, username)
    with admin_login_attempts_lock:
        admin_login_attempts.setdefault(attempt_key, []).append(now)


def clear_failed_logins(request: Request, username: str) -> None:
    attempt_key = get_login_attempt_key(request, username)
    with admin_login_attempts_lock:
        admin_login_attempts.pop(attempt_key, None)


def ensure_upload_dir() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def validate_wallet_address(wallet_address: str) -> None:
    if not wallet_address or not WALLET_RE.fullmatch(wallet_address):
        raise HTTPException(status_code=400, detail="Invalid wallet address.")


def normalize_wallet_address(wallet_address: str | None) -> str:
    raw_value = (wallet_address or "").strip()
    if not raw_value:
        return ANONYMOUS_WALLET_LABEL
    validate_wallet_address(raw_value)
    return raw_value


def load_report_index() -> dict[str, dict[str, object]]:
    if not REPORT_INDEX_PATH.exists():
        return {}
    try:
        return json.loads(REPORT_INDEX_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_report_index(index: dict[str, dict[str, object]]) -> None:
    REPORT_INDEX_PATH.write_text(json.dumps(index, indent=2), encoding="utf-8")


def get_db_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def add_notification(
    *,
    notification_type: str,
    report_id: int | None,
    title: str,
    message: str,
    payload: dict[str, object] | None = None,
) -> None:
    with db_lock:
        connection = get_db_connection()
        try:
            recipient_email: str | None = None
            if report_id is not None:
                row = connection.execute(
                    "SELECT wallet_address FROM reports WHERE id = ?",
                    (report_id,),
                ).fetchone()
                if row is not None:
                    wallet_address = str(row["wallet_address"] or "").strip()
                    if wallet_address and wallet_address != ANONYMOUS_WALLET_LABEL:
                        recipient_email = wallet_address.lower()
            connection.execute(
                """
                INSERT INTO notifications (
                    created_at, seen_at, notification_type, report_id, recipient_email, title, message, payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    utc_now().isoformat(),
                    None,
                    notification_type,
                    report_id,
                    recipient_email,
                    title,
                    message,
                    json.dumps(payload or {}),
                ),
            )
            connection.commit()
        finally:
            connection.close()


def list_notifications(limit: int = 10, session: dict[str, str] | None = None) -> dict[str, object]:
    safe_limit = max(1, min(limit, 50))
    scope_conditions, scope_params = build_admin_scope_conditions(session or {})
    scope_clause = ""
    if scope_conditions:
        mapped_conditions = [
            condition.replace("province_name", "reports.province_name").replace("district_name", "reports.district_name")
            for condition in scope_conditions
        ]
        scope_clause = " AND (notifications.report_id IS NULL OR (" + " AND ".join(mapped_conditions) + "))"

    unread_query = f"SELECT COUNT(*) FROM notifications LEFT JOIN reports ON reports.id = notifications.report_id WHERE notifications.seen_at IS NULL{scope_clause}"
    total_query = f"SELECT COUNT(*) FROM notifications LEFT JOIN reports ON reports.id = notifications.report_id WHERE 1=1{scope_clause}"
    rows_query = f"""
        SELECT notifications.*
        FROM notifications
        LEFT JOIN reports ON reports.id = notifications.report_id
        WHERE 1=1{scope_clause}
        ORDER BY notifications.created_at DESC, notifications.id DESC
        LIMIT ?
    """

    with db_lock:
        connection = get_db_connection()
        try:
            unread_count = connection.execute(unread_query, tuple(scope_params)).fetchone()[0]
            total_count = connection.execute(total_query, tuple(scope_params)).fetchone()[0]
            rows = connection.execute(rows_query, tuple(scope_params + [safe_limit])).fetchall()
        finally:
            connection.close()

    notifications = [
        {
            "id": row["id"],
            "created_at": row["created_at"],
            "seen_at": row["seen_at"],
            "type": row["notification_type"],
            "report_id": row["report_id"],
            "recipient_email": row["recipient_email"],
            "title": row["title"],
            "message": row["message"],
            "payload": json.loads(row["payload_json"]),
        }
        for row in rows
    ]
    return {"count": total_count, "unread_count": unread_count, "notifications": notifications}


def mark_notifications_seen(session: dict[str, str] | None = None) -> int:
    seen_at = utc_now().isoformat()
    scope_conditions, scope_params = build_admin_scope_conditions(session or {})
    scope_clause = ""
    if scope_conditions:
        mapped_conditions = [
            condition.replace("province_name", "reports.province_name").replace("district_name", "reports.district_name")
            for condition in scope_conditions
        ]
        scope_clause = " AND (notifications.report_id IS NULL OR (" + " AND ".join(mapped_conditions) + "))"
    with db_lock:
        connection = get_db_connection()
        try:
            cursor = connection.execute(
                f"""
                UPDATE notifications
                SET seen_at = ?
                WHERE seen_at IS NULL
                AND id IN (
                    SELECT notifications.id
                    FROM notifications
                    LEFT JOIN reports ON reports.id = notifications.report_id
                    WHERE 1=1{scope_clause}
                )
                """,
                (seen_at, *scope_params),
            )
            connection.commit()
            updated = cursor.rowcount or 0
        finally:
            connection.close()
    return int(updated)


def list_citizen_notifications(limit: int = 10, session: dict[str, str] | None = None) -> dict[str, object]:
    safe_limit = max(1, min(limit, 50))
    email = str((session or {}).get("email") or "").strip().lower()
    if not email:
        return {"count": 0, "unread_count": 0, "notifications": []}
    unread_query = """
        SELECT COUNT(*)
        FROM notifications
        WHERE recipient_email IS NOT NULL
          AND LOWER(recipient_email) = ?
          AND seen_at IS NULL
    """
    total_query = """
        SELECT COUNT(*)
        FROM notifications
        WHERE recipient_email IS NOT NULL
          AND LOWER(recipient_email) = ?
    """
    rows_query = """
        SELECT *
        FROM notifications
        WHERE recipient_email IS NOT NULL
          AND LOWER(recipient_email) = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
    """
    with db_lock:
        connection = get_db_connection()
        try:
            unread_count = connection.execute(unread_query, (email,)).fetchone()[0]
            total_count = connection.execute(total_query, (email,)).fetchone()[0]
            rows = connection.execute(rows_query, (email, safe_limit)).fetchall()
        finally:
            connection.close()

    notifications = [
        {
            "id": row["id"],
            "created_at": row["created_at"],
            "seen_at": row["seen_at"],
            "type": row["notification_type"],
            "report_id": row["report_id"],
            "title": row["title"],
            "message": row["message"],
            "payload": json.loads(row["payload_json"]),
        }
        for row in rows
    ]
    return {"count": total_count, "unread_count": unread_count, "notifications": notifications}


def mark_citizen_notifications_seen(session: dict[str, str] | None = None) -> int:
    email = str((session or {}).get("email") or "").strip().lower()
    if not email:
        return 0
    seen_at = utc_now().isoformat()
    with db_lock:
        connection = get_db_connection()
        try:
            cursor = connection.execute(
                """
                UPDATE notifications
                SET seen_at = ?
                WHERE seen_at IS NULL
                  AND recipient_email IS NOT NULL
                  AND LOWER(recipient_email) = ?
                """,
                (seen_at, email),
            )
            connection.commit()
            updated = cursor.rowcount or 0
        finally:
            connection.close()
    return int(updated)


def get_citizen_by_email(email: str) -> sqlite3.Row | None:
    with db_lock:
        connection = get_db_connection()
        try:
            return connection.execute("SELECT * FROM citizen_users WHERE email = ?", (email,)).fetchone()
        finally:
            connection.close()


def clear_citizen_sessions_for_email(email: str) -> None:
    normalized = email.strip().lower()
    if not normalized:
        return
    with citizen_sessions_lock:
        expired_tokens = [
            token
            for token, session in citizen_sessions.items()
            if str(session.get("email") or "").strip().lower() == normalized
        ]
        for token in expired_tokens:
            citizen_sessions.pop(token, None)


def upsert_citizen_user(full_name: str, email: str, password: str, code: str) -> None:
    now = utc_now().isoformat()
    expires_at = (utc_now() + timedelta(minutes=CITIZEN_VERIFICATION_MINUTES)).isoformat()
    password_hash = hash_password(password)
    code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
    with db_lock:
        connection = get_db_connection()
        try:
            existing = connection.execute("SELECT is_verified FROM citizen_users WHERE email = ?", (email,)).fetchone()
            if existing is not None and int(existing["is_verified"] or 0) == 1:
                raise HTTPException(status_code=409, detail="Bu e-posta zaten kayıtlı. Giriş yapabilirsiniz.")
            if existing is None:
                connection.execute(
                    """
                    INSERT INTO citizen_users (
                        created_at, full_name, email, password_hash, is_verified,
                        verification_code_hash, verification_expires_at
                    )
                    VALUES (?, ?, ?, ?, 0, ?, ?)
                    """,
                    (now, full_name, email, password_hash, code_hash, expires_at),
                )
            else:
                connection.execute(
                    """
                    UPDATE citizen_users
                    SET full_name = ?, password_hash = ?, verification_code_hash = ?,
                        verification_expires_at = ?, is_verified = 0
                    WHERE email = ?
                    """,
                    (full_name, password_hash, code_hash, expires_at, email),
                )
            connection.commit()
        finally:
            connection.close()


def store_citizen_password_reset_code(email: str, code: str) -> None:
    expires_at = (utc_now() + timedelta(minutes=CITIZEN_PASSWORD_RESET_MINUTES)).isoformat()
    code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
    with db_lock:
        connection = get_db_connection()
        try:
            connection.execute(
                """
                UPDATE citizen_users
                SET password_reset_code_hash = ?, password_reset_expires_at = ?
                WHERE email = ?
                """,
                (code_hash, expires_at, email),
            )
            connection.commit()
        finally:
            connection.close()


def consume_citizen_password_reset(email: str, code: str, password: str) -> sqlite3.Row:
    row = get_citizen_by_email(email)
    if row is None:
        raise HTTPException(status_code=400, detail="Kod veya e-posta hatalı.")
    expires_at = row["password_reset_expires_at"] if "password_reset_expires_at" in row.keys() else None
    if not expires_at or datetime.fromisoformat(expires_at) <= utc_now():
        raise HTTPException(status_code=410, detail="Şifre sıfırlama kodunun süresi doldu. Yeni kod alın.")
    expected_hash = str(row["password_reset_code_hash"] or "")
    if not secrets.compare_digest(hashlib.sha256(code.encode("utf-8")).hexdigest(), expected_hash):
        raise HTTPException(status_code=400, detail="Şifre sıfırlama kodu hatalı.")

    password_hash = hash_password(password)
    with db_lock:
        connection = get_db_connection()
        try:
            connection.execute(
                """
                UPDATE citizen_users
                SET password_hash = ?, is_verified = 1, verified_at = COALESCE(verified_at, ?),
                    password_reset_code_hash = NULL, password_reset_expires_at = NULL,
                    verification_code_hash = NULL, verification_expires_at = NULL
                WHERE email = ?
                """,
                (password_hash, utc_now().isoformat(), email),
            )
            connection.commit()
            updated = connection.execute("SELECT * FROM citizen_users WHERE email = ?", (email,)).fetchone()
        finally:
            connection.close()
    if updated is None:
        raise HTTPException(status_code=400, detail="Şifre sıfırlama tamamlanamadı.")
    clear_citizen_sessions_for_email(email)
    return updated


def init_db() -> None:
    with db_lock:
        connection = get_db_connection()
        try:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    saved_as TEXT NOT NULL,
                    wallet_address TEXT NOT NULL,
                    citizen_user_id INTEGER,
                    sha256 TEXT NOT NULL,
                    captured_at TEXT,
                    gps_latitude REAL,
                    gps_longitude REAL,
                    image_width INTEGER NOT NULL,
                    image_height INTEGER NOT NULL,
                    num_detections INTEGER NOT NULL,
                    report_type TEXT NOT NULL,
                    reward_points INTEGER NOT NULL,
                    top_confidence REAL NOT NULL,
                    top_detection_json TEXT NOT NULL,
                    detections_json TEXT NOT NULL,
                    ipfs_cid TEXT,
                    ipfs_url TEXT,
                    ipfs_pinned_at TEXT,
                    proof_payload_hash TEXT,
                    proof_chain_hash TEXT,
                    proof_previous_hash TEXT,
                    proof_sealed_at TEXT,
                    assigned_team TEXT,
                    assigned_to TEXT,
                    report_notes TEXT,
                    intervention_status TEXT NOT NULL DEFAULT 'pending_dispatch',
                    after_image_saved_as TEXT,
                    after_image_sha256 TEXT,
                    after_uploaded_at TEXT,
                    status TEXT NOT NULL DEFAULT 'pending_review',
                    status_updated_at TEXT
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    actor_username TEXT NOT NULL,
                    actor_role TEXT NOT NULL,
                    action TEXT NOT NULL,
                    report_id INTEGER,
                    ip_address TEXT,
                    status TEXT NOT NULL,
                    detail_json TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS report_notes_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    report_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    actor_username TEXT NOT NULL,
                    actor_role TEXT NOT NULL,
                    note_text TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    seen_at TEXT,
                    notification_type TEXT NOT NULL,
                    report_id INTEGER,
                    recipient_email TEXT,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS citizen_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    is_verified INTEGER NOT NULL DEFAULT 0,
                    verification_code_hash TEXT,
                    verification_expires_at TEXT,
                    password_reset_code_hash TEXT,
                    password_reset_expires_at TEXT,
                    verified_at TEXT
                )
                """
            )
            ensure_reports_schema(connection)
            ensure_citizen_users_schema(connection)
            connection.commit()
        finally:
            connection.close()


def ensure_citizen_users_schema(connection: sqlite3.Connection) -> None:
    existing_columns = {
        row[1]
        for row in connection.execute("PRAGMA table_info(citizen_users)").fetchall()
    }
    required_columns = {
        "password_reset_code_hash": "ALTER TABLE citizen_users ADD COLUMN password_reset_code_hash TEXT",
        "password_reset_expires_at": "ALTER TABLE citizen_users ADD COLUMN password_reset_expires_at TEXT",
    }
    for column_name, statement in required_columns.items():
        if column_name not in existing_columns:
            connection.execute(statement)


def drop_sha256_unique_constraint(connection: sqlite3.Connection) -> None:
    """Eski DB'lerde reports.sha256 uzerindeki UNIQUE kisitini kaldirir.

    Boylece ayni foto tekrar yuklenebilir. SQLite sutun kisitini ALTER ile
    dusuremedigi icin tabloyu mevcut semayi koruyarak yeniden olusturur."""
    has_unique = False
    for idx in connection.execute("PRAGMA index_list('reports')").fetchall():
        if idx["unique"]:
            cols = [c["name"] for c in connection.execute(f"PRAGMA index_info('{idx['name']}')").fetchall()]
            if cols == ["sha256"]:
                has_unique = True
                break
    if not has_unique:
        return

    # Mevcut CREATE ifadesini al (ALTER ile eklenen tum sutunlari icerir), tablo
    # adini gecici yap ve sha256'daki UNIQUE'i kaldir.
    row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='reports'"
    ).fetchone()
    if row is None or not row["sql"]:
        return
    create_sql = re.sub(
        r"CREATE TABLE (IF NOT EXISTS )?\"?reports\"?",
        lambda m: f"CREATE TABLE {m.group(1) or ''}reports_rebuild",
        row["sql"],
        count=1,
    )
    create_sql = create_sql.replace("sha256 TEXT NOT NULL UNIQUE", "sha256 TEXT NOT NULL")

    columns = [c["name"] for c in connection.execute("PRAGMA table_info('reports')").fetchall()]
    col_list = ", ".join(f'"{c}"' for c in columns)
    connection.execute(create_sql)
    connection.execute(f"INSERT INTO reports_rebuild ({col_list}) SELECT {col_list} FROM reports")
    connection.execute("DROP TABLE reports")
    connection.execute("ALTER TABLE reports_rebuild RENAME TO reports")
    connection.commit()
    print("[migration] reports.sha256 UNIQUE kisiti kaldirildi (ayni foto tekrar yuklenebilir).")


def ensure_reports_schema(connection: sqlite3.Connection) -> None:
    existing_columns = {
        row[1]
        for row in connection.execute("PRAGMA table_info(reports)").fetchall()
    }
    required_columns = {
        "ipfs_cid": "ALTER TABLE reports ADD COLUMN ipfs_cid TEXT",
        "ipfs_url": "ALTER TABLE reports ADD COLUMN ipfs_url TEXT",
        "ipfs_pinned_at": "ALTER TABLE reports ADD COLUMN ipfs_pinned_at TEXT",
        "proof_payload_hash": "ALTER TABLE reports ADD COLUMN proof_payload_hash TEXT",
        "proof_chain_hash": "ALTER TABLE reports ADD COLUMN proof_chain_hash TEXT",
        "proof_previous_hash": "ALTER TABLE reports ADD COLUMN proof_previous_hash TEXT",
        "proof_sealed_at": "ALTER TABLE reports ADD COLUMN proof_sealed_at TEXT",
        "perceptual_hash": "ALTER TABLE reports ADD COLUMN perceptual_hash TEXT",
        "assigned_team": "ALTER TABLE reports ADD COLUMN assigned_team TEXT",
        "assigned_to": "ALTER TABLE reports ADD COLUMN assigned_to TEXT",
        "report_notes": "ALTER TABLE reports ADD COLUMN report_notes TEXT",
        "citizen_note": "ALTER TABLE reports ADD COLUMN citizen_note TEXT",
        "intervention_status": "ALTER TABLE reports ADD COLUMN intervention_status TEXT NOT NULL DEFAULT 'pending_dispatch'",
        "assigned_at": "ALTER TABLE reports ADD COLUMN assigned_at TEXT",
        "intervention_started_at": "ALTER TABLE reports ADD COLUMN intervention_started_at TEXT",
        "resolved_at": "ALTER TABLE reports ADD COLUMN resolved_at TEXT",
        "after_image_saved_as": "ALTER TABLE reports ADD COLUMN after_image_saved_as TEXT",
        "after_image_sha256": "ALTER TABLE reports ADD COLUMN after_image_sha256 TEXT",
        "after_uploaded_at": "ALTER TABLE reports ADD COLUMN after_uploaded_at TEXT",
        "browser_latitude": "ALTER TABLE reports ADD COLUMN browser_latitude REAL",
        "browser_longitude": "ALTER TABLE reports ADD COLUMN browser_longitude REAL",
        "exif_latitude": "ALTER TABLE reports ADD COLUMN exif_latitude REAL",
        "exif_longitude": "ALTER TABLE reports ADD COLUMN exif_longitude REAL",
        "location_status": "ALTER TABLE reports ADD COLUMN location_status TEXT",
        "location_distance_meters": "ALTER TABLE reports ADD COLUMN location_distance_meters REAL",
        "province_name": "ALTER TABLE reports ADD COLUMN province_name TEXT",
        "district_name": "ALTER TABLE reports ADD COLUMN district_name TEXT",
        "neighborhood_name": "ALTER TABLE reports ADD COLUMN neighborhood_name TEXT",
        "location_source": "ALTER TABLE reports ADD COLUMN location_source TEXT",
        "location_geocoded_at": "ALTER TABLE reports ADD COLUMN location_geocoded_at TEXT",
        "citizen_user_id": "ALTER TABLE reports ADD COLUMN citizen_user_id INTEGER",
        "status_updated_at": "ALTER TABLE reports ADD COLUMN status_updated_at TEXT",
    }
    for column_name, ddl in required_columns.items():
        if column_name not in existing_columns:
            connection.execute(ddl)

    drop_sha256_unique_constraint(connection)

    # Historically `report_notes` held BOTH the citizen's submission note and
    # the admin's operational note (the admin note overwrote the citizen's).
    # Split them: a report with no admin notes history still carries the
    # citizen's original note in `report_notes`, so move it to `citizen_note`
    # and clear the admin field. Reports that already have an admin notes
    # history keep `report_notes` as the admin note.
    if "citizen_note" not in existing_columns:
        try:
            connection.execute(
                """
                UPDATE reports
                SET citizen_note = report_notes
                WHERE citizen_note IS NULL
                  AND report_notes IS NOT NULL
                  AND TRIM(report_notes) != ''
                  AND id NOT IN (SELECT DISTINCT report_id FROM report_notes_history)
                """
            )
            connection.execute(
                """
                UPDATE reports
                SET report_notes = ''
                WHERE citizen_note IS NOT NULL
                  AND TRIM(citizen_note) != ''
                  AND id NOT IN (SELECT DISTINCT report_id FROM report_notes_history)
                """
            )
        except sqlite3.OperationalError:
            # report_notes_history not created yet on a fresh DB — nothing to
            # backfill in that case.
            pass

    connection.execute(
        """
        UPDATE reports
        SET citizen_user_id = (
            SELECT citizen_users.id
            FROM citizen_users
            WHERE LOWER(citizen_users.email) = LOWER(reports.wallet_address)
        )
        WHERE citizen_user_id IS NULL
          AND wallet_address IS NOT NULL
          AND wallet_address != ?
        """,
        (ANONYMOUS_WALLET_LABEL,),
    )

    notification_columns = {
        row[1]
        for row in connection.execute("PRAGMA table_info(notifications)").fetchall()
    }
    if "recipient_email" not in notification_columns:
        connection.execute("ALTER TABLE notifications ADD COLUMN recipient_email TEXT")


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_location_snapshot(
    exif_metadata: dict[str, object],
    browser_latitude: float | None,
    browser_longitude: float | None,
) -> dict[str, object]:
    exif_gps = exif_metadata.get("gps") if isinstance(exif_metadata, dict) else None
    exif_latitude = exif_gps.get("latitude") if isinstance(exif_gps, dict) else None
    exif_longitude = exif_gps.get("longitude") if isinstance(exif_gps, dict) else None

    primary_latitude = browser_latitude if browser_latitude is not None else exif_latitude
    primary_longitude = browser_longitude if browser_longitude is not None else exif_longitude

    distance_meters = None
    location_status = "unverified"
    if browser_latitude is not None and browser_longitude is not None and exif_latitude is not None and exif_longitude is not None:
        distance_meters = round(
            haversine_distance_meters(browser_latitude, browser_longitude, exif_latitude, exif_longitude),
            2,
        )
        location_status = "matched" if distance_meters <= LOCATION_MATCH_THRESHOLD_METERS else "mismatch"
    elif browser_latitude is not None and browser_longitude is not None:
        location_status = "browser_only"
    elif exif_latitude is not None and exif_longitude is not None:
        location_status = "exif_only"

    return {
        "primary_latitude": primary_latitude,
        "primary_longitude": primary_longitude,
        "browser_latitude": browser_latitude,
        "browser_longitude": browser_longitude,
        "exif_latitude": exif_latitude,
        "exif_longitude": exif_longitude,
        "location_status": location_status,
        "distance_meters": distance_meters,
    }


def reverse_geocode_location(latitude: float | None, longitude: float | None) -> dict[str, str]:
    if latitude is None or longitude is None:
        return {"province": "", "district": "", "neighborhood": "", "source": "unavailable"}

    try:
        query = urllib.parse.urlencode(
            {
                "format": "jsonv2",
                "lat": latitude,
                "lon": longitude,
                "zoom": 18,
                "addressdetails": 1,
            }
        )
        request = urllib.request.Request(
            f"{LOCATION_GEOCODER_URL}?{query}",
            headers={"User-Agent": LOCATION_GEOCODER_USER_AGENT, "Accept-Language": "tr"},
        )
        with urllib.request.urlopen(request, timeout=LOCATION_GEOCODER_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return {"province": "", "district": "", "neighborhood": "", "source": "fallback"}

    address = payload.get("address") if isinstance(payload, dict) else {}
    if not isinstance(address, dict):
        address = {}
    province = str(address.get("state") or address.get("province") or address.get("region") or "").strip()
    district = str(
        address.get("county")
        or address.get("district")
        or address.get("city_district")
        or address.get("town")
        or address.get("municipality")
        or ""
    ).strip()
    neighborhood = str(
        address.get("neighbourhood")
        or address.get("suburb")
        or address.get("quarter")
        or address.get("hamlet")
        or ""
    ).strip()
    return {
        "province": province,
        "district": district,
        "neighborhood": neighborhood,
        "source": "nominatim" if province or district or neighborhood else "fallback",
    }


def backfill_report_location_scope() -> int:
    updated_count = 0
    with db_lock:
        connection = get_db_connection()
        try:
            rows = connection.execute(
                """
                SELECT id, gps_latitude, gps_longitude, browser_latitude, browser_longitude, exif_latitude, exif_longitude,
                       province_name, district_name, neighborhood_name, location_source
                FROM reports
                """
            ).fetchall()
            for row in rows:
                province_name = str(row["province_name"] or "").strip()
                district_name = str(row["district_name"] or "").strip()
                neighborhood_name = str(row["neighborhood_name"] or "").strip()
                if province_name and district_name:
                    continue

                latitude = row["gps_latitude"]
                longitude = row["gps_longitude"]
                if latitude is None or longitude is None:
                    latitude = row["browser_latitude"] if row["browser_latitude"] is not None else row["exif_latitude"]
                    longitude = row["browser_longitude"] if row["browser_longitude"] is not None else row["exif_longitude"]

                location_geocode = reverse_geocode_location(latitude, longitude)
                if not location_geocode["province"] and not location_geocode["district"] and not location_geocode["neighborhood"]:
                    continue

                connection.execute(
                    """
                    UPDATE reports
                    SET province_name = ?, district_name = ?, neighborhood_name = ?, location_source = ?, location_geocoded_at = ?
                    WHERE id = ?
                    """,
                    (
                        location_geocode["province"] or province_name,
                        location_geocode["district"] or district_name,
                        location_geocode["neighborhood"] or neighborhood_name,
                        location_geocode["source"],
                        utc_now().isoformat(),
                        row["id"],
                    ),
                )
                updated_count += 1
            connection.commit()
        finally:
            connection.close()
    return updated_count


def row_to_report(row: sqlite3.Row) -> dict[str, object]:
    top_detection = json.loads(row["top_detection_json"])
    detections = json.loads(row["detections_json"])
    gps = None
    if row["gps_latitude"] is not None and row["gps_longitude"] is not None:
        gps = {"latitude": row["gps_latitude"], "longitude": row["gps_longitude"]}

    report = {
        "id": row["id"],
        "created_at": row["created_at"],
        "filename": row["filename"],
        "saved_as": row["saved_as"],
        "citizen_user_id": row["citizen_user_id"],
        "wallet_address": None if row["wallet_address"] == ANONYMOUS_WALLET_LABEL else row["wallet_address"],
        "reporter_label": "Anonymous citizen" if row["wallet_address"] == ANONYMOUS_WALLET_LABEL else row["wallet_address"],
        "sha256": row["sha256"],
        "perceptual_hash": row["perceptual_hash"],
        "captured_at": row["captured_at"],
        "gps": gps,
        "location": {
            "reported": gps,
            "browser": {
                "latitude": row["browser_latitude"],
                "longitude": row["browser_longitude"],
            }
            if row["browser_latitude"] is not None and row["browser_longitude"] is not None
            else None,
            "exif": {
                "latitude": row["exif_latitude"],
                "longitude": row["exif_longitude"],
            }
            if row["exif_latitude"] is not None and row["exif_longitude"] is not None
            else None,
            "status": row["location_status"] or "unverified",
            "distance_meters": row["location_distance_meters"],
        },
        "location_scope": {
            "province": row["province_name"],
            "district": row["district_name"],
            "neighborhood": row["neighborhood_name"],
            "source": row["location_source"],
            "geocoded_at": row["location_geocoded_at"],
        },
        "province_name": row["province_name"],
        "district_name": row["district_name"],
        "neighborhood_name": row["neighborhood_name"],
        "image_size": {"width": row["image_width"], "height": row["image_height"]},
        "num_detections": row["num_detections"],
        "report_type": row["report_type"],
        "reward_points": row["reward_points"],
        "top_confidence": row["top_confidence"],
        "top_detection": top_detection,
        "detections": detections,
        "ipfs": {
            "cid": row["ipfs_cid"],
            "url": row["ipfs_url"],
            "pinned_at": row["ipfs_pinned_at"],
        }
        if row["ipfs_cid"] or row["ipfs_url"] or row["ipfs_pinned_at"]
        else None,
        "proof": {
            "payload_hash": row["proof_payload_hash"],
            "chain_hash": row["proof_chain_hash"],
            "previous_hash": row["proof_previous_hash"],
            "sealed_at": row["proof_sealed_at"],
        }
        if row["proof_payload_hash"] or row["proof_chain_hash"] or row["proof_previous_hash"] or row["proof_sealed_at"]
        else None,
        "assignment": {
            "assigned_team": normalize_team_label(row["assigned_team"], province=str(row["province_name"] or ""), district=str(row["district_name"] or ""), report_type=str(row["report_type"] or "")),
            "assigned_to": row["assigned_to"],
            "intervention_status": row["intervention_status"] or "pending_dispatch",
            "assigned_at": row["assigned_at"],
            "intervention_started_at": row["intervention_started_at"],
            "resolved_at": row["resolved_at"],
        },
        "notes": row["report_notes"] or "",
        "citizen_note": row["citizen_note"] or "",
        "after_image": {
            "saved_as": row["after_image_saved_as"],
            "sha256": row["after_image_sha256"],
            "uploaded_at": row["after_uploaded_at"],
            "url": f"/uploads/{row['after_image_saved_as']}" if row["after_image_saved_as"] else None,
        }
        if row["after_image_saved_as"] or row["after_image_sha256"] or row["after_uploaded_at"]
        else None,
        "status": row["status"],
        "status_updated_at": row["status_updated_at"],
    }
    report["priority"] = calculate_priority(report)
    assignment = report["assignment"]
    resolved_at = parse_iso_datetime(assignment.get("resolved_at"))
    started_at = parse_iso_datetime(assignment.get("intervention_started_at"))
    assigned_at = parse_iso_datetime(assignment.get("assigned_at"))
    created_at = parse_iso_datetime(report.get("created_at"))
    duration = {
        "assignment_hours": round(max(0.0, ((assigned_at or utc_now()) - created_at).total_seconds() / 3600), 2)
        if created_at and assigned_at
        else None,
        "resolution_hours": round(max(0.0, (resolved_at - created_at).total_seconds() / 3600), 2)
        if created_at and resolved_at
        else None,
        "field_work_hours": round(max(0.0, (resolved_at - started_at).total_seconds() / 3600), 2)
        if started_at and resolved_at
        else None,
    }
    report["duration"] = duration
    return report


def parse_iso_datetime(value: object) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def calculate_priority(report: dict[str, object]) -> dict[str, object]:
    report_type = str(report.get("report_type") or "")
    status = str(report.get("status") or "")
    base_score = PRIORITY_TYPE_WEIGHTS.get(report_type, 25)
    confidence = max(0.0, min(1.0, float(report.get("top_confidence") or 0)))
    confidence_boost = confidence * 25
    status_boost = PRIORITY_STATUS_BOOST.get(status, 0)
    gps_boost = 4 if report.get("gps") else 0

    age_boost = 0.0
    created_at = parse_iso_datetime(report.get("created_at"))
    if created_at is not None:
        age_hours = max(0.0, (utc_now() - created_at).total_seconds() / 3600)
        age_boost = min(10.0, age_hours / 4.8)

    score = int(round(max(0.0, min(100.0, base_score + confidence_boost + status_boost + gps_boost + age_boost))))
    if score >= 80:
        label = "critical"
    elif score >= 60:
        label = "high"
    elif score >= 40:
        label = "medium"
    else:
        label = "low"
    return {"score": score, "label": label}


def find_report_by_sha256(sha256: str) -> dict[str, object] | None:
    with db_lock:
        connection = get_db_connection()
        try:
            row = connection.execute("SELECT * FROM reports WHERE sha256 = ?", (sha256,)).fetchone()
        finally:
            connection.close()
    return row_to_report(row) if row is not None else None


def insert_report(
    *,
    filename: str | None,
    saved_as: str,
    wallet_address: str,
    citizen_user_id: int | None = None,
    sha256: str,
    perceptual_hash: str,
    exif_metadata: dict[str, object],
    browser_latitude: float | None,
    browser_longitude: float | None,
    image_width: int,
    image_height: int,
    num_detections: int,
    report_type: str,
    reward_points: int,
    top_detection: dict[str, object],
    detections: list[dict[str, object]],
    report_notes: str = "",
) -> dict[str, object]:
    location_snapshot = build_location_snapshot(exif_metadata, browser_latitude, browser_longitude)
    location_geocode = reverse_geocode_location(
        location_snapshot["primary_latitude"],
        location_snapshot["primary_longitude"],
    )
    created_at = utc_now().isoformat()

    with db_lock:
        connection = get_db_connection()
        try:
            cursor = connection.execute(
                """
                INSERT INTO reports (
                    created_at, filename, saved_as, wallet_address, citizen_user_id, sha256, captured_at,
                    gps_latitude, gps_longitude, image_width, image_height, num_detections,
                    report_type, reward_points, top_confidence, top_detection_json, perceptual_hash,
                    detections_json, status, browser_latitude, browser_longitude, exif_latitude,
                    exif_longitude, location_status, location_distance_meters, province_name,
                    district_name, neighborhood_name, location_source, location_geocoded_at, citizen_note
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    created_at,
                    filename or saved_as,
                    saved_as,
                    wallet_address,
                    citizen_user_id,
                    sha256,
                    exif_metadata.get("captured_at"),
                    location_snapshot["primary_latitude"],
                    location_snapshot["primary_longitude"],
                    image_width,
                    image_height,
                    num_detections,
                    report_type,
                    reward_points,
                    float(top_detection["confidence"]),
                    json.dumps(top_detection),
                    perceptual_hash,
                    json.dumps(detections),
                    "pending_review",
                    location_snapshot["browser_latitude"],
                    location_snapshot["browser_longitude"],
                    location_snapshot["exif_latitude"],
                    location_snapshot["exif_longitude"],
                    location_snapshot["location_status"],
                    location_snapshot["distance_meters"],
                    location_geocode["province"],
                    location_geocode["district"],
                    location_geocode["neighborhood"],
                    location_geocode["source"],
                    utc_now().isoformat(),
                    report_notes.strip(),
                ),
            )
            report_id = cursor.lastrowid
            connection.commit()
            row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        finally:
            connection.close()

    add_notification(
        notification_type="new_report",
        report_id=report_id,
        title=f"Yeni bildirim #{report_id}",
        message=f"Yeni bir {REPORT_TYPE_LABELS_TR.get(row['report_type'], 'sorun')} bildirimi oluşturuldu.",
        payload={"report_type": row["report_type"], "status": row["status"]},
    )
    return row_to_report(row)


CRACK_TYPES = ("alligator_crack", "block_crack", "longitudinal_crack", "oblique_crack", "transverse_crack")


def list_reports(
    *,
    limit: int = 100,
    offset: int = 0,
    report_type: str | None = None,
    status: str | None = None,
    intervention_status: str | None = None,
    wallet_address: str | None = None,
    citizen_user_id: int | None = None,
    wallet_query: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    min_confidence: float | None = None,
    session: dict[str, str] | None = None,
) -> list[dict[str, object]]:
    query = "SELECT * FROM reports"
    conditions: list[str] = []
    params: list[object] = []

    if report_type == "crack":
        placeholders = ",".join("?" * len(CRACK_TYPES))
        conditions.append(f"report_type IN ({placeholders})")
        params.extend(CRACK_TYPES)
    elif report_type:
        conditions.append("report_type = ?")
        params.append(report_type)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if intervention_status:
        conditions.append("intervention_status = ?")
        params.append(intervention_status)
    if citizen_user_id and wallet_address:
        conditions.append("(citizen_user_id = ? OR (citizen_user_id IS NULL AND LOWER(wallet_address) = ?))")
        params.extend([citizen_user_id, wallet_address.lower()])
    elif citizen_user_id:
        conditions.append("citizen_user_id = ?")
        params.append(citizen_user_id)
    elif wallet_address:
        conditions.append("LOWER(wallet_address) = ?")
        params.append(wallet_address.lower())
    if wallet_query:
        conditions.append("LOWER(wallet_address) LIKE ?")
        params.append(f"%{wallet_query.lower()}%")
    if created_from:
        conditions.append("created_at >= ?")
        params.append(created_from)
    if created_to:
        conditions.append("created_at <= ?")
        params.append(created_to)
    if min_confidence is not None:
        conditions.append("top_confidence >= ?")
        params.append(min_confidence)

    query, params = apply_scope_filter_to_query(query, conditions, params, session)

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with db_lock:
        connection = get_db_connection()
        try:
            rows = connection.execute(query, tuple(params)).fetchall()
        finally:
            connection.close()
    return [row_to_report(row) for row in rows]


def count_reports(
    *,
    report_type: str | None = None,
    status: str | None = None,
    intervention_status: str | None = None,
    wallet_address: str | None = None,
    citizen_user_id: int | None = None,
    wallet_query: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    min_confidence: float | None = None,
    session: dict[str, str] | None = None,
) -> int:
    query = "SELECT COUNT(*) FROM reports"
    conditions: list[str] = []
    params: list[object] = []

    if report_type == "crack":
        placeholders = ",".join("?" * len(CRACK_TYPES))
        conditions.append(f"report_type IN ({placeholders})")
        params.extend(CRACK_TYPES)
    elif report_type:
        conditions.append("report_type = ?")
        params.append(report_type)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if intervention_status:
        conditions.append("intervention_status = ?")
        params.append(intervention_status)
    if citizen_user_id and wallet_address:
        conditions.append("(citizen_user_id = ? OR (citizen_user_id IS NULL AND LOWER(wallet_address) = ?))")
        params.extend([citizen_user_id, wallet_address.lower()])
    elif citizen_user_id:
        conditions.append("citizen_user_id = ?")
        params.append(citizen_user_id)
    elif wallet_address:
        conditions.append("LOWER(wallet_address) = ?")
        params.append(wallet_address.lower())
    if wallet_query:
        conditions.append("LOWER(wallet_address) LIKE ?")
        params.append(f"%{wallet_query.lower()}%")
    if created_from:
        conditions.append("created_at >= ?")
        params.append(created_from)
    if created_to:
        conditions.append("created_at <= ?")
        params.append(created_to)
    if min_confidence is not None:
        conditions.append("top_confidence >= ?")
        params.append(min_confidence)

    query, params = apply_scope_filter_to_query(query, conditions, params, session)

    with db_lock:
        connection = get_db_connection()
        try:
            total = connection.execute(query, tuple(params)).fetchone()[0]
        finally:
            connection.close()
    return int(total)


def get_report(report_id: int) -> dict[str, object] | None:
    with db_lock:
        connection = get_db_connection()
        try:
            row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        finally:
            connection.close()
    return row_to_report(row) if row is not None else None


def get_citizen_report(report_id: int, session: dict[str, str]) -> dict[str, object] | None:
    owner_conditions, owner_params = build_citizen_scope_conditions(session)
    owner_clause = owner_conditions[0] if owner_conditions else "1=0"
    if owner_clause == "1=0":
        return None
    with db_lock:
        connection = get_db_connection()
        try:
            row = connection.execute(
                f"SELECT * FROM reports WHERE id = ? AND {owner_clause}",
                (report_id, *owner_params),
            ).fetchone()
        finally:
            connection.close()
    return row_to_report(row) if row is not None else None


def citizen_report_summary(session: dict[str, str]) -> dict[str, object]:
    owner_conditions, owner_params = build_citizen_scope_conditions(session)
    owner_clause = owner_conditions[0] if owner_conditions else "1=0"
    if owner_clause == "1=0":
        return {
            "total_reports": 0,
            "pending_review_reports": 0,
            "approved_reports": 0,
            "resolved_reports": 0,
            "in_progress_reports": 0,
            "rejected_reports": 0,
            "recent_reports": [],
        }

    with db_lock:
        connection = get_db_connection()
        try:
            total_reports = connection.execute(
                f"SELECT COUNT(*) FROM reports WHERE {owner_clause}",
                tuple(owner_params),
            ).fetchone()[0]
            pending_review_reports = connection.execute(
                f"SELECT COUNT(*) FROM reports WHERE {owner_clause} AND status != 'rejected' AND COALESCE(intervention_status, '') != 'resolved'",
                tuple(owner_params),
            ).fetchone()[0]
            approved_reports = connection.execute(
                f"SELECT COUNT(*) FROM reports WHERE {owner_clause} AND status = 'approved'",
                tuple(owner_params),
            ).fetchone()[0]
            rejected_reports = connection.execute(
                f"SELECT COUNT(*) FROM reports WHERE {owner_clause} AND status = 'rejected'",
                tuple(owner_params),
            ).fetchone()[0]
            in_progress_reports = connection.execute(
                f"""
                SELECT COUNT(*)
                FROM reports
                WHERE {owner_clause}
                  AND status != 'pending_review'
                  AND intervention_status IN ('assigned', 'in_progress')
                """,
                tuple(owner_params),
            ).fetchone()[0]
            resolved_reports = connection.execute(
                f"SELECT COUNT(*) FROM reports WHERE {owner_clause} AND intervention_status = 'resolved'",
                tuple(owner_params),
            ).fetchone()[0]
            recent_rows = connection.execute(
                f"""
                SELECT *
                FROM reports
                WHERE {owner_clause}
                ORDER BY created_at DESC, id DESC
                LIMIT 3
                """,
                tuple(owner_params),
            ).fetchall()
        finally:
            connection.close()

    recent_reports = []
    for row in recent_rows:
        report = row_to_report(row)
        recent_reports.append(
            {
                "id": report["id"],
                "created_at": report["created_at"],
                "report_type": report["report_type"],
                "status": report["status"],
                "intervention_status": report["assignment"].get("intervention_status") if isinstance(report.get("assignment"), dict) else None,
                "priority": report["priority"],
                "province": report["location_scope"].get("province") if isinstance(report.get("location_scope"), dict) else "",
                "district": report["location_scope"].get("district") if isinstance(report.get("location_scope"), dict) else "",
            }
        )

    return {
        "total_reports": int(total_reports),
        "pending_review_reports": int(pending_review_reports),
        "approved_reports": int(approved_reports),
        "resolved_reports": int(resolved_reports),
        "in_progress_reports": int(in_progress_reports),
        "rejected_reports": int(rejected_reports),
        "recent_reports": recent_reports,
    }


def get_scoped_report_or_404(report_id: int, session: dict[str, str]) -> dict[str, object]:
    report = get_report(report_id)
    if report is None or not report_in_admin_scope(report, session):
        raise HTTPException(status_code=404, detail="Report not found.")
    return report


def update_report_status(report_id: int, status: str) -> dict[str, object] | None:
    if status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid report status.")

    with db_lock:
        connection = get_db_connection()
        try:
            current_row = connection.execute("SELECT status FROM reports WHERE id = ?", (report_id,)).fetchone()
            if current_row is None:
                return None
            current_status = str(current_row["status"] or "pending_review")
            if status != current_status:
                allowed_next = REVIEW_STATUS_TRANSITIONS.get(current_status, set())
                if status not in allowed_next:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Invalid report status transition: {current_status} -> {status}.",
                    )
            connection.execute("UPDATE reports SET status = ?, status_updated_at = ? WHERE id = ?", (status, utc_now().isoformat(), report_id))
            connection.commit()
            row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        finally:
            connection.close()
    if row is not None and status != current_status:
        add_notification(
            notification_type="report_status",
            report_id=report_id,
            title=f"Bildirim #{report_id} durumu güncellendi",
            message=REVIEW_STATUS_NOTIF_TR.get(status, f"Bildirim durumu {REVIEW_STATUS_LABELS_TR.get(status, status)} olarak güncellendi."),
            payload={"status": status},
        )
    return row_to_report(row) if row is not None else None


def update_report_ipfs(report_id: int, cid: str, url: str, pinned_at: str) -> dict[str, object] | None:
    with db_lock:
        connection = get_db_connection()
        try:
            connection.execute(
                "UPDATE reports SET ipfs_cid = ?, ipfs_url = ?, ipfs_pinned_at = ? WHERE id = ?",
                (cid, url, pinned_at, report_id),
            )
            connection.commit()
            row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        finally:
            connection.close()
    return row_to_report(row) if row is not None else None


def get_report_ipfs_source_path(report: dict[str, object]) -> Path:
    after_image = report.get("after_image") if isinstance(report, dict) else None
    if isinstance(after_image, dict):
        saved_as = str(after_image.get("saved_as") or "").strip()
        if saved_as:
            after_path = UPLOAD_DIR / saved_as
            if after_path.exists():
                return after_path

    saved_as = str(report.get("saved_as") or "").strip()
    if saved_as:
        original_path = UPLOAD_DIR / saved_as
        if original_path.exists():
            return original_path

    raise HTTPException(status_code=500, detail="Source image for automatic IPFS pinning was not found.")


def update_report_proof(
    report_id: int,
    payload_hash: str,
    chain_hash: str,
    previous_hash: str,
    sealed_at: str,
) -> dict[str, object] | None:
    with db_lock:
        connection = get_db_connection()
        try:
            connection.execute(
                """
                UPDATE reports
                SET proof_payload_hash = ?, proof_chain_hash = ?, proof_previous_hash = ?, proof_sealed_at = ?
                WHERE id = ?
                """,
                (payload_hash, chain_hash, previous_hash, sealed_at, report_id),
            )
            connection.commit()
            row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        finally:
            connection.close()
    return row_to_report(row) if row is not None else None


def finalize_report_evidence_if_ready(report_id: int) -> dict[str, object] | None:
    report = get_report(report_id)
    if report is None:
        return None

    if str(report.get("status") or "") != "approved":
        return report

    assignment = report.get("assignment") if isinstance(report.get("assignment"), dict) else {}
    if not isinstance(assignment, dict) or str(assignment.get("intervention_status") or "") != "resolved":
        return report

    current_report = report
    has_ipfs = isinstance(current_report.get("ipfs"), dict) and bool(current_report["ipfs"].get("cid"))
    has_proof = isinstance(current_report.get("proof"), dict) and bool(current_report["proof"].get("chain_hash"))

    if not has_ipfs:
        source_path = get_report_ipfs_source_path(current_report)
        ipfs_payload = upload_file_to_ipfs(file_path=source_path, report=current_report)
        updated_report = update_report_ipfs(
            report_id,
            ipfs_payload["cid"],
            ipfs_payload["url"],
            ipfs_payload["pinned_at"],
        )
        if updated_report is not None:
            current_report = updated_report
        add_notification(
            notification_type="report_status",
            report_id=report_id,
            title=f"Bildirim #{report_id} kayıt tamamlandı",
            message="Bildiriminiz çözüldü.",
            payload={"cid": ipfs_payload["cid"]},
        )
        record_audit_log(
            actor_username="system",
            actor_role="system",
            action="report_auto_pin_ipfs",
            report_id=report_id,
            ip_address=None,
            status="success",
            detail={"cid": ipfs_payload["cid"]},
        )

    if not has_proof:
        proof_payload = build_report_proof(current_report)
        updated_report = update_report_proof(
            report_id,
            proof_payload["payload_hash"],
            proof_payload["chain_hash"],
            proof_payload["previous_hash"],
            proof_payload["sealed_at"],
        )
        if updated_report is not None:
            current_report = updated_report
        add_notification(
            notification_type="report_status",
            report_id=report_id,
            title=f"Bildirim #{report_id} tamamlandı",
            message="Bildiriminiz çözüldü.",
            payload={"chain_hash": proof_payload["chain_hash"]},
        )
        record_audit_log(
            actor_username="system",
            actor_role="system",
            action="report_auto_seal_proof",
            report_id=report_id,
            ip_address=None,
            status="success",
            detail={"chain_hash": proof_payload["chain_hash"]},
        )

    refreshed_report = get_report(report_id)
    return refreshed_report if refreshed_report is not None else current_report


def seal_pending_resolved_reports(session: dict[str, str]) -> dict[str, object]:
    """Pin + seal every approved & resolved report that is still missing a
    proof chain hash, processing them in resolution order so the hash chain
    stays sequential. Used to recover reports whose automatic sealing failed
    (e.g. a transient IPFS outage)."""
    query, params = build_scoped_query(
        """
        SELECT id FROM reports
        WHERE status = 'approved'
          AND intervention_status = 'resolved'
          AND (proof_chain_hash IS NULL OR proof_chain_hash = '')
        ORDER BY resolved_at ASC, id ASC
        """,
        session=session,
    )
    with db_lock:
        connection = get_db_connection()
        try:
            pending_ids = [int(row["id"]) for row in connection.execute(query, params).fetchall()]
        finally:
            connection.close()

    sealed: list[int] = []
    failed: list[dict[str, object]] = []
    for report_id in pending_ids:
        try:
            finalize_report_evidence_if_ready(report_id)
            report = get_report(report_id)
            proof = report.get("proof") if isinstance(report, dict) else None
            if isinstance(proof, dict) and proof.get("chain_hash"):
                sealed.append(report_id)
            else:
                failed.append({"report_id": report_id, "error": "Mühürleme tamamlanamadı."})
        except HTTPException as exc:
            failed.append({"report_id": report_id, "error": str(exc.detail)})
        except Exception as exc:  # noqa: BLE001 - surface any unexpected failure
            failed.append({"report_id": report_id, "error": str(exc)})

    return {
        "pending": len(pending_ids),
        "sealed": sealed,
        "sealed_count": len(sealed),
        "failed": failed,
        "latest_chain_hash": get_latest_proof_chain_hash(),
    }


def update_report_assignment(
    report_id: int,
    *,
    assigned_team: str,
    assigned_to: str,
    intervention_status: str,
) -> dict[str, object] | None:
    if intervention_status not in ALLOWED_INTERVENTION_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid intervention status.")

    with db_lock:
        connection = get_db_connection()
        try:
            current_row = connection.execute(
                """
                SELECT status, intervention_status, assigned_team, assigned_to,
                       assigned_at, intervention_started_at, resolved_at,
                       province_name, district_name, report_type
                FROM reports
                WHERE id = ?
                """,
                (report_id,),
            ).fetchone()
            if current_row is None:
                return None
            current_review_status = str(current_row["status"] or "pending_review")
            if current_review_status in {"pending_review", "rejected"}:
                raise HTTPException(
                    status_code=409,
                    detail="The report must be moved to review before assignment can be saved.",
                )
            current_assigned_team = str(current_row["assigned_team"] or "").strip()
            current_assigned_to = str(current_row["assigned_to"] or "").strip()
            requested_assigned_team = assigned_team.strip()
            requested_assigned_to = assigned_to.strip()
            normalized_assigned_team = normalize_team_label(
                requested_assigned_team or current_assigned_team,
                province=str(current_row["province_name"] or ""),
                district=str(current_row["district_name"] or ""),
                report_type=str(current_row["report_type"] or ""),
            )
            normalized_assigned_to = requested_assigned_to or current_assigned_to
            effective_intervention_status = intervention_status
            if effective_intervention_status == "pending_dispatch" and (normalized_assigned_team or normalized_assigned_to):
                effective_intervention_status = "assigned"
            current_intervention_status = str(current_row["intervention_status"] or "pending_dispatch")
            if effective_intervention_status != current_intervention_status:
                allowed_next = INTERVENTION_STATUS_TRANSITIONS.get(current_intervention_status, set())
                if effective_intervention_status not in allowed_next:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Invalid intervention status transition: {current_intervention_status} -> {effective_intervention_status}.",
                    )
            assigned_at = current_row["assigned_at"]
            started_at = current_row["intervention_started_at"]
            resolved_at = current_row["resolved_at"]
            now_iso = utc_now().isoformat()
            if not assigned_at and (normalized_assigned_team or normalized_assigned_to or effective_intervention_status in {"assigned", "in_progress", "resolved"}):
                assigned_at = now_iso
            if not started_at and effective_intervention_status in {"in_progress", "resolved"}:
                started_at = now_iso
            if effective_intervention_status == "resolved":
                resolved_at = now_iso
            elif resolved_at and effective_intervention_status != "resolved":
                resolved_at = None
            connection.execute(
                """
                UPDATE reports
                SET assigned_team = ?, assigned_to = ?, intervention_status = ?,
                    assigned_at = ?, intervention_started_at = ?, resolved_at = ?
                WHERE id = ?
                """,
                (
                    normalized_assigned_team,
                    normalized_assigned_to,
                    effective_intervention_status,
                    assigned_at,
                    started_at,
                    resolved_at,
                    report_id,
                ),
            )
            connection.commit()
            row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        finally:
            connection.close()
    finalized_report: dict[str, object] | None = None
    if row is not None and effective_intervention_status == "resolved":
        try:
            finalized_report = finalize_report_evidence_if_ready(report_id)
        except HTTPException as exc:
            add_notification(
                notification_type="report_status",
                report_id=report_id,
                title=f"Bildirim #{report_id} otomatik kan?t tamamlanamad?",
                message=str(exc.detail),
                payload={"error": str(exc.detail)},
            )
    if row is not None and effective_intervention_status != current_intervention_status:
        add_notification(
            notification_type="intervention_status",
            report_id=report_id,
            title=f"Bildirim #{report_id} saha durumu güncellendi",
            message=INTERVENTION_STATUS_NOTIF_TR.get(effective_intervention_status, f"Saha durumu {INTERVENTION_STATUS_LABELS_TR.get(effective_intervention_status, effective_intervention_status)} olarak güncellendi."),
            payload={
                "assigned_team": normalized_assigned_team,
                "intervention_status": effective_intervention_status,
            },
        )
    if finalized_report is not None:
        return finalized_report
    return row_to_report(row) if row is not None else None


def append_report_note_entry(report_id: int, *, actor_username: str, actor_role: str, note_text: str) -> None:
    with db_lock:
        connection = get_db_connection()
        try:
            connection.execute(
                """
                INSERT INTO report_notes_history (report_id, created_at, actor_username, actor_role, note_text)
                VALUES (?, ?, ?, ?, ?)
                """,
                (report_id, utc_now().isoformat(), actor_username, actor_role, note_text.strip()),
            )
            connection.commit()
        finally:
            connection.close()


def list_report_note_entries(report_id: int) -> list[dict[str, object]]:
    with db_lock:
        connection = get_db_connection()
        try:
            rows = connection.execute(
                """
                SELECT *
                FROM report_notes_history
                WHERE report_id = ?
                ORDER BY created_at DESC, id DESC
                """,
                (report_id,),
            ).fetchall()
        finally:
            connection.close()
    return [
        {
            "id": row["id"],
            "report_id": row["report_id"],
            "created_at": row["created_at"],
            "actor_username": row["actor_username"],
            "actor_role": row["actor_role"],
            "note_text": row["note_text"],
        }
        for row in rows
    ]


def update_report_notes(report_id: int, notes: str) -> dict[str, object] | None:
    with db_lock:
        connection = get_db_connection()
        try:
            connection.execute("UPDATE reports SET report_notes = ? WHERE id = ?", (notes.strip(), report_id))
            connection.commit()
            row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        finally:
            connection.close()
    return row_to_report(row) if row is not None else None


def update_report_after_image(report_id: int, *, saved_as: str, sha256: str, uploaded_at: str) -> dict[str, object] | None:
    with db_lock:
        connection = get_db_connection()
        try:
            connection.execute(
                """
                UPDATE reports
                SET after_image_saved_as = ?, after_image_sha256 = ?, after_uploaded_at = ?
                WHERE id = ?
                """,
                (saved_as, sha256, uploaded_at, report_id),
            )
            connection.commit()
            row = connection.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        finally:
            connection.close()
    if row is None:
        return None
    report = row_to_report(row)
    if str(report.get("status") or "") == "approved" and str(report.get("assignment", {}).get("intervention_status") if isinstance(report.get("assignment"), dict) else "") == "resolved":
        try:
            finalized_report = finalize_report_evidence_if_ready(report_id)
            if finalized_report is not None:
                return finalized_report
        except HTTPException as exc:
            add_notification(
                notification_type="report_status",
                report_id=report_id,
                title=f"Bildirim #{report_id} otomatik kanıt tamamlanamadı",
                message=str(exc.detail),
                payload={"error": str(exc.detail)},
            )
    return report


def record_audit_log(
    *,
    actor_username: str,
    actor_role: str,
    action: str,
    report_id: int | None,
    ip_address: str | None,
    status: str,
    detail: dict[str, object],
) -> None:
    with db_lock:
        connection = get_db_connection()
        try:
            connection.execute(
                """
                INSERT INTO audit_logs (
                    created_at, actor_username, actor_role, action, report_id,
                    ip_address, status, detail_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    utc_now().isoformat(),
                    actor_username,
                    actor_role,
                    action,
                    report_id,
                    ip_address,
                    status,
                    json.dumps(detail),
                ),
            )
            connection.commit()
        finally:
            connection.close()


def list_audit_logs(limit: int = 50) -> list[dict[str, object]]:
    safe_limit = max(1, min(limit, 200))
    with db_lock:
        connection = get_db_connection()
        try:
            rows = connection.execute(
                """
                SELECT *
                FROM audit_logs
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
        finally:
            connection.close()

    return [
        {
            "id": row["id"],
            "created_at": row["created_at"],
            "actor_username": row["actor_username"],
            "actor_role": row["actor_role"],
            "action": row["action"],
            "report_id": row["report_id"],
            "ip_address": row["ip_address"],
            "status": row["status"],
            "detail": json.loads(row["detail_json"]),
        }
        for row in rows
    ]


def get_admin_summary(session: dict[str, str] | None = None) -> dict[str, object]:
    with db_lock:
        connection = get_db_connection()
        try:
            total_reports = connection.execute(*build_scoped_query("SELECT COUNT(*) FROM reports", session=session)).fetchone()[0]
            total_points = connection.execute(*build_scoped_query("SELECT COALESCE(SUM(reward_points), 0) FROM reports", session=session)).fetchone()[0]
            avg_confidence = connection.execute(*build_scoped_query("SELECT COALESCE(AVG(top_confidence), 0) FROM reports", session=session)).fetchone()[0]
            gps_verified_count = connection.execute(
                *build_scoped_query(
                    "SELECT COUNT(*) FROM reports",
                    session=session,
                    extra_conditions=["gps_latitude IS NOT NULL AND gps_longitude IS NOT NULL"],
                )
            ).fetchone()[0]
            ipfs_pinned_count = connection.execute(
                *build_scoped_query("SELECT COUNT(*) FROM reports", session=session, extra_conditions=["ipfs_cid IS NOT NULL"])
            ).fetchone()[0]
            proof_sealed_count = connection.execute(
                *build_scoped_query("SELECT COUNT(*) FROM reports", session=session, extra_conditions=["proof_chain_hash IS NOT NULL"])
            ).fetchone()[0]
            by_type_rows = connection.execute(
                *build_scoped_query(
                    "SELECT report_type, COUNT(*) AS count FROM reports GROUP BY report_type ORDER BY count DESC",
                    session=session,
                )
            ).fetchall()
            by_status_rows = connection.execute(
                *build_scoped_query(
                    "SELECT status, COUNT(*) AS count FROM reports GROUP BY status ORDER BY count DESC",
                    session=session,
                )
            ).fetchall()
            intervention_rows = connection.execute(
                *build_scoped_query(
                    """
                    SELECT intervention_status, COUNT(*) AS count
                    FROM reports
                    GROUP BY intervention_status
                    ORDER BY count DESC
                    """.strip(),
                    session=session,
                )
            ).fetchall()
            avg_by_type_rows = connection.execute(
                *build_scoped_query(
                    """
                    SELECT report_type, AVG(top_confidence) AS avg_confidence
                    FROM reports
                    GROUP BY report_type
                    ORDER BY avg_confidence DESC
                    """.strip(),
                    session=session,
                )
            ).fetchall()
            recent_daily_rows = connection.execute(
                *build_scoped_query(
                    """
                    SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
                    FROM reports
                    WHERE created_at >= ?
                    GROUP BY substr(created_at, 1, 10)
                    ORDER BY day ASC
                    """.strip(),
                    session=session,
                    extra_params=[(utc_now() - timedelta(days=6)).date().isoformat()],
                )
            ).fetchall()
            avg_resolution_hours = connection.execute(
                *build_scoped_query(
                    """
                    SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24.0)
                    FROM reports
                    WHERE resolved_at IS NOT NULL
                    """.strip(),
                    session=session,
                )
            ).fetchone()[0]
        finally:
            connection.close()

    active_priority_reports = list_reports(limit=500, offset=0, session=session)
    active_priority_scores = [
        int(report["priority"]["score"])
        for report in active_priority_reports
        if str(report.get("status") or "") != "rejected"
        and str(report.get("assignment", {}).get("intervention_status") if isinstance(report.get("assignment"), dict) else "") != "resolved"
    ]
    high_priority_count = sum(1 for score in active_priority_scores if score >= 60)
    critical_priority_count = sum(1 for score in active_priority_scores if score >= 80)

    return {
        "total_reports": total_reports,
        "total_reward_points": total_points,
        "avg_confidence": round(float(avg_confidence or 0), 4),
        "avg_priority_score": round(sum(active_priority_scores) / len(active_priority_scores), 1) if active_priority_scores else 0.0,
        "high_priority_count": high_priority_count,
        "critical_priority_count": critical_priority_count,
        "avg_resolution_hours": round(float(avg_resolution_hours or 0), 2),
        "gps_verified_count": gps_verified_count,
        "ipfs_pinned_count": ipfs_pinned_count,
        "proof_sealed_count": proof_sealed_count,
        "reports_by_type": {row["report_type"]: row["count"] for row in by_type_rows},
        "reports_by_status": {row["status"]: row["count"] for row in by_status_rows},
        "intervention_by_status": {row["intervention_status"]: row["count"] for row in intervention_rows},
        "avg_confidence_by_type": {
            row["report_type"]: round(float(row["avg_confidence"] or 0), 4) for row in avg_by_type_rows
        },
        "recent_daily_reports": [{"day": row["day"], "count": row["count"]} for row in recent_daily_rows],
    }


def get_public_summary() -> dict[str, object]:
    with db_lock:
        connection = get_db_connection()
        try:
            total_reports = connection.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
            approved_reports = connection.execute(
                "SELECT COUNT(*) FROM reports WHERE status = 'approved'"
            ).fetchone()[0]
            resolved_reports = connection.execute(
                "SELECT COUNT(*) FROM reports WHERE intervention_status = 'resolved'"
            ).fetchone()[0]
            by_type_rows = connection.execute(
                "SELECT report_type, COUNT(*) AS count FROM reports GROUP BY report_type ORDER BY count DESC"
            ).fetchall()
            by_province_rows = connection.execute(
                """
                SELECT province_name, COUNT(*) AS count
                FROM reports
                WHERE province_name IS NOT NULL AND TRIM(province_name) != ''
                GROUP BY province_name
                ORDER BY count DESC, province_name ASC
                """
            ).fetchall()
            recent_daily_rows = connection.execute(
                """
                SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
                FROM reports
                WHERE created_at >= ?
                GROUP BY substr(created_at, 1, 10)
                ORDER BY day ASC
                """,
                ((utc_now() - timedelta(days=6)).date().isoformat(),),
            ).fetchall()
        finally:
            connection.close()

    return {
        "total_reports": total_reports,
        "approved_reports": approved_reports,
        "resolved_reports": resolved_reports,
        "reports_by_type": {row["report_type"]: row["count"] for row in by_type_rows},
        "reports_by_province": {row["province_name"]: row["count"] for row in by_province_rows},
        "top_provinces": [
            {"province": row["province_name"], "count": row["count"]}
            for row in by_province_rows[:8]
        ],
        "active_provinces_count": len(by_province_rows),
        "recent_daily_reports": [{"day": row["day"], "count": row["count"]} for row in recent_daily_rows],
    }


def list_public_reports(limit: int = 12) -> list[dict[str, object]]:
    safe_limit = max(1, min(limit, 50))
    with db_lock:
        connection = get_db_connection()
        try:
            rows = connection.execute(
                """
                SELECT *
                FROM reports
                WHERE status IN ('approved', 'in_review')
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
        finally:
            connection.close()

    public_reports: list[dict[str, object]] = []
    for row in rows:
        report = row_to_report(row)
        public_reports.append(
            {
                "id": report["id"],
                "created_at": report["created_at"],
                "report_type": report["report_type"],
                "status": report["status"],
                "top_confidence": report["top_confidence"],
                "priority": report["priority"],
                "gps": report["gps"],
                "after_image_available": bool(report.get("after_image")),
            }
        )
    return public_reports


def build_ipfs_multipart_body(
    *,
    file_path: Path,
    metadata: dict[str, object],
) -> tuple[bytes, str]:
    boundary = f"----UrbanChain{uuid4().hex}"
    filename = file_path.name
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    metadata_payload = json.dumps(metadata)

    body = bytearray()

    def append_text_part(name: str, value: str) -> None:
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(value.encode("utf-8"))
        body.extend(b"\r\n")

    append_text_part("pinataMetadata", metadata_payload)

    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode("utf-8")
    )
    body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
    body.extend(file_path.read_bytes())
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    return bytes(body), boundary


def upload_file_to_ipfs(*, file_path: Path, report: dict[str, object]) -> dict[str, str]:
    if IPFS_PROVIDER.lower() != "pinata":
        raise HTTPException(status_code=501, detail="Configured IPFS provider is not supported yet.")
    if not IPFS_JWT:
        raise HTTPException(status_code=503, detail="IPFS provider credentials are not configured.")

    metadata = {
        "name": f"urbanchain-report-{report['id']}",
        "keyvalues": {
            "report_id": str(report["id"]),
            "report_type": str(report["report_type"]),
            "wallet_address": str(report["wallet_address"]),
            "sha256": str(report["sha256"]),
        },
    }
    body, boundary = build_ipfs_multipart_body(file_path=file_path, metadata=metadata)
    request = urllib.request.Request(
        IPFS_PIN_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {IPFS_JWT}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=IPFS_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"IPFS upload failed: {detail or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"IPFS provider unreachable: {exc.reason}") from exc

    cid = payload.get("IpfsHash")
    if not cid:
        raise HTTPException(status_code=502, detail="IPFS provider response did not include a CID.")

    pinned_at = utc_now().isoformat()
    return {
        "cid": str(cid),
        "url": f"{IPFS_GATEWAY.rstrip('/')}/{cid}",
        "pinned_at": pinned_at,
    }


def compute_perceptual_hash(file_path: Path) -> str:
    with Image.open(file_path) as image:
        grayscale = image.convert("L").resize((9, 8))
        pixels = list(grayscale.getdata())

    bits: list[str] = []
    for row in range(8):
        row_offset = row * 9
        for col in range(8):
            left = pixels[row_offset + col]
            right = pixels[row_offset + col + 1]
            bits.append("1" if left > right else "0")

    return f"{int(''.join(bits), 2):016x}"


def hamming_distance(hash_a: str, hash_b: str) -> int:
    try:
        return bin(int(hash_a, 16) ^ int(hash_b, 16)).count("1")
    except ValueError:
        return 999


def find_similar_report_by_perceptual_hash(perceptual_hash: str) -> dict[str, object] | None:
    with db_lock:
        connection = get_db_connection()
        try:
            rows = connection.execute(
                """
                SELECT *
                FROM reports
                WHERE perceptual_hash IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 250
                """
            ).fetchall()
        finally:
            connection.close()

    best_match: sqlite3.Row | None = None
    best_distance = 999
    for row in rows:
        row_hash = row["perceptual_hash"]
        if not row_hash:
            continue
        distance = hamming_distance(perceptual_hash, str(row_hash))
        if distance < best_distance:
            best_distance = distance
            best_match = row

    if best_match is not None and best_distance <= PERCEPTUAL_HASH_DISTANCE_THRESHOLD:
        report = row_to_report(best_match)
        report["perceptual_distance"] = best_distance
        return report
    return None


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def get_latest_proof_chain_hash() -> str:
    with db_lock:
        connection = get_db_connection()
        try:
            row = connection.execute(
                """
                SELECT proof_chain_hash
                FROM reports
                WHERE proof_chain_hash IS NOT NULL
                ORDER BY proof_sealed_at DESC, id DESC
                LIMIT 1
                """
            ).fetchone()
        finally:
            connection.close()
    return str(row["proof_chain_hash"]) if row and row["proof_chain_hash"] else "GENESIS"


def build_report_proof(report: dict[str, object]) -> dict[str, str]:
    ipfs = report.get("ipfs") if isinstance(report, dict) else None
    if not isinstance(ipfs, dict) or not ipfs.get("cid"):
        raise HTTPException(status_code=409, detail="Report must be pinned to IPFS before proof sealing.")

    gps = report.get("gps") if isinstance(report, dict) else None
    payload = {
        "report_id": report["id"],
        "created_at": report["created_at"],
        "wallet_address": report["wallet_address"],
        "report_type": report["report_type"],
        "reward_points": report["reward_points"],
        "sha256": report["sha256"],
        "ipfs_cid": ipfs["cid"],
        "gps": gps,
        "status": report["status"],
    }
    payload_hash = sha256_text(json.dumps(payload, sort_keys=True, separators=(",", ":")))
    previous_hash = get_latest_proof_chain_hash()
    chain_hash = sha256_text(f"{previous_hash}:{payload_hash}")
    sealed_at = utc_now().isoformat()
    return {
        "payload_hash": payload_hash,
        "previous_hash": previous_hash,
        "chain_hash": chain_hash,
        "sealed_at": sealed_at,
    }


def verify_report_proof(report: dict[str, object], previous_chain_hash: str) -> dict[str, object]:
    proof = report.get("proof")
    ipfs = report.get("ipfs")
    result = {
        "report_id": report["id"],
        "ok": False,
        "reason": "",
        "expected_previous_hash": previous_chain_hash,
        "stored_previous_hash": proof.get("previous_hash") if isinstance(proof, dict) else None,
        "expected_payload_hash": None,
        "stored_payload_hash": proof.get("payload_hash") if isinstance(proof, dict) else None,
        "expected_chain_hash": None,
        "stored_chain_hash": proof.get("chain_hash") if isinstance(proof, dict) else None,
    }
    if not isinstance(ipfs, dict) or not ipfs.get("cid"):
        result["reason"] = "missing_ipfs"
        return result
    if not isinstance(proof, dict) or not proof.get("payload_hash") or not proof.get("chain_hash"):
        result["reason"] = "missing_proof"
        return result

    payload = {
        "report_id": report["id"],
        "created_at": report["created_at"],
        "wallet_address": report["wallet_address"],
        "report_type": report["report_type"],
        "reward_points": report["reward_points"],
        "sha256": report["sha256"],
        "ipfs_cid": ipfs["cid"],
        "gps": report.get("gps"),
        "status": report["status"],
    }
    expected_payload_hash = sha256_text(json.dumps(payload, sort_keys=True, separators=(",", ":")))
    expected_chain_hash = sha256_text(f"{previous_chain_hash}:{expected_payload_hash}")
    result["expected_payload_hash"] = expected_payload_hash
    result["expected_chain_hash"] = expected_chain_hash

    if proof.get("previous_hash") != previous_chain_hash:
        result["reason"] = "previous_hash_mismatch"
        return result
    if proof.get("payload_hash") != expected_payload_hash:
        result["reason"] = "payload_hash_mismatch"
        return result
    if proof.get("chain_hash") != expected_chain_hash:
        result["reason"] = "chain_hash_mismatch"
        return result

    result["ok"] = True
    result["reason"] = "verified"
    return result


def verify_proof_chain() -> dict[str, object]:
    with db_lock:
        connection = get_db_connection()
        try:
            rows = connection.execute(
                """
                SELECT *
                FROM reports
                WHERE proof_chain_hash IS NOT NULL
                ORDER BY proof_sealed_at ASC, id ASC
                """
            ).fetchall()
        finally:
            connection.close()

    previous_hash = "GENESIS"
    checks: list[dict[str, object]] = []
    valid_count = 0
    first_error: dict[str, object] | None = None
    for row in rows:
        report = row_to_report(row)
        check = verify_report_proof(report, previous_hash)
        checks.append(check)
        if check["ok"]:
            valid_count += 1
            previous_hash = str(check["stored_chain_hash"])
        elif first_error is None:
            first_error = check
            previous_hash = str(check["stored_chain_hash"] or previous_hash)

    return {
        "ok": first_error is None,
        "checked_reports": len(checks),
        "valid_reports": valid_count,
        "invalid_reports": len(checks) - valid_count,
        "latest_chain_hash": previous_hash if checks else "GENESIS",
        "first_error": first_error,
        "checks": checks,
    }


def rebuild_proof_chain() -> dict[str, object]:
    with db_lock:
        connection = get_db_connection()
        try:
            rows = connection.execute(
                """
                SELECT *
                FROM reports
                WHERE proof_chain_hash IS NOT NULL
                ORDER BY proof_sealed_at ASC, id ASC
                """
            ).fetchall()
            previous_hash = "GENESIS"
            rebuilt_ids: list[int] = []
            for row in rows:
                report = row_to_report(row)
                ipfs = report.get("ipfs") if isinstance(report, dict) else None
                if not isinstance(ipfs, dict) or not ipfs.get("cid"):
                    raise HTTPException(status_code=409, detail=f"Report #{report['id']} cannot be rebuilt without IPFS.")

                payload = {
                    "report_id": report["id"],
                    "created_at": report["created_at"],
                    "wallet_address": report["wallet_address"],
                    "report_type": report["report_type"],
                    "reward_points": report["reward_points"],
                    "sha256": report["sha256"],
                    "ipfs_cid": ipfs["cid"],
                    "gps": report.get("gps"),
                    "status": report["status"],
                }
                payload_hash = sha256_text(json.dumps(payload, sort_keys=True, separators=(",", ":")))
                chain_hash = sha256_text(f"{previous_hash}:{payload_hash}")
                sealed_at = str(row["proof_sealed_at"] or utc_now().isoformat())
                connection.execute(
                    """
                    UPDATE reports
                    SET proof_payload_hash = ?, proof_chain_hash = ?, proof_previous_hash = ?, proof_sealed_at = ?
                    WHERE id = ?
                    """,
                    (payload_hash, chain_hash, previous_hash, sealed_at, report["id"]),
                )
                previous_hash = chain_hash
                rebuilt_ids.append(report["id"])
            connection.commit()
        finally:
            connection.close()
    return {"ok": True, "rebuilt_reports": rebuilt_ids, "latest_chain_hash": previous_hash}


def build_reports_csv(
    *,
    report_type: str | None = None,
    status: str | None = None,
    intervention_status: str | None = None,
    wallet_query: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    min_confidence: float | None = None,
    session: dict[str, str] | None = None,
) -> str:
    reports = list_reports(
        limit=1000,
        offset=0,
        report_type=report_type,
        status=status,
        intervention_status=intervention_status,
        wallet_query=wallet_query,
        created_from=created_from,
        created_to=created_to,
        min_confidence=min_confidence,
        session=session,
    )
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "report_id",
            "created_at",
            "report_type",
            "status",
            "intervention_status",
            "wallet_address",
            "top_confidence",
            "priority_score",
            "priority_label",
            "reward_points",
            "gps_latitude",
            "gps_longitude",
            "province_name",
            "district_name",
            "neighborhood_name",
            "ipfs_cid",
            "proof_chain_hash",
            "sha256",
        ]
    )
    for report in reports:
        gps = report.get("gps") if isinstance(report.get("gps"), dict) else None
        ipfs = report.get("ipfs") if isinstance(report.get("ipfs"), dict) else None
        proof = report.get("proof") if isinstance(report.get("proof"), dict) else None
        priority = report.get("priority") if isinstance(report.get("priority"), dict) else {}
        writer.writerow(
            [
                report["id"],
                report["created_at"],
                report["report_type"],
                report["status"],
                report["assignment"]["intervention_status"],
                report["wallet_address"],
                report["top_confidence"],
                priority.get("score"),
                priority.get("label"),
                report["reward_points"],
                gps.get("latitude") if gps else "",
                gps.get("longitude") if gps else "",
                report.get("location_scope", {}).get("province", "") if isinstance(report.get("location_scope"), dict) else "",
                report.get("location_scope", {}).get("district", "") if isinstance(report.get("location_scope"), dict) else "",
                report.get("location_scope", {}).get("neighborhood", "") if isinstance(report.get("location_scope"), dict) else "",
                ipfs.get("cid") if ipfs else "",
                proof.get("chain_hash") if proof else "",
                report["sha256"],
            ]
        )
    return output.getvalue()


def compute_sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def save_validated_upload(file: UploadFile) -> Path:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported image format.")

    ensure_upload_dir()
    upload_path = UPLOAD_DIR / f"{uuid4().hex}{suffix}"

    bytes_written = 0
    with upload_path.open("wb") as buffer:
        while chunk := file.file.read(1024 * 1024):
            bytes_written += len(chunk)
            if bytes_written > MAX_UPLOAD_BYTES:
                upload_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Uploaded image exceeds size limit.")
            buffer.write(chunk)

    try:
        with Image.open(upload_path) as image:
            image.verify()
    except (UnidentifiedImageError, OSError) as exc:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Invalid image file.") from exc

    return upload_path


def to_float(value: object) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, tuple) and len(value) == 2:
        numerator, denominator = value
        return float(numerator) / float(denominator)
    if isinstance(value, Fraction):
        return float(value)
    return float(value)  # type: ignore[arg-type]


def convert_gps_to_decimal(values: object, ref: object) -> float | None:
    if not isinstance(values, tuple) or len(values) != 3 or ref is None:
        return None
    degrees = to_float(values[0])
    minutes = to_float(values[1])
    seconds = to_float(values[2])
    decimal = degrees + minutes / 60.0 + seconds / 3600.0
    if str(ref).upper() in {"S", "W"}:
        decimal *= -1
    return round(decimal, 6)


def extract_exif_metadata(file_path: Path) -> dict[str, object]:
    try:
        with Image.open(file_path) as image:
            raw_exif = image.getexif()
    except (UnidentifiedImageError, OSError):
        return {"captured_at": None, "gps": None}

    if not raw_exif:
        return {"captured_at": None, "gps": None}

    captured_at = raw_exif.get(306) or raw_exif.get(36867)
    gps_payload = raw_exif.get(GPS_TAG)
    gps = None

    if gps_payload:
        gps_info = {}
        for key, value in gps_payload.items():
            gps_info[ExifTags.GPSTAGS.get(key, key)] = value

        latitude = convert_gps_to_decimal(gps_info.get("GPSLatitude"), gps_info.get("GPSLatitudeRef"))
        longitude = convert_gps_to_decimal(gps_info.get("GPSLongitude"), gps_info.get("GPSLongitudeRef"))
        if latitude is not None and longitude is not None:
            gps = {"latitude": latitude, "longitude": longitude}

    return {"captured_at": captured_at, "gps": gps}


@app.on_event("startup")
def startup() -> None:
    ensure_upload_dir()
    get_model()
    init_db()
    backfill_report_location_scope()
    if not REPORT_INDEX_PATH.exists():
        save_report_index({})


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": MODEL_PATH.name, "model_path": str(MODEL_PATH)}


@app.get("/public/summary")
def public_summary() -> dict[str, object]:
    return get_public_summary()


@app.get("/geo/reverse")
def geo_reverse(latitude: float, longitude: float) -> dict[str, str]:
    return reverse_geocode_location(latitude, longitude)


@app.get("/public/reports")
def public_reports(limit: int = 12) -> dict[str, object]:
    reports = list_public_reports(limit=limit)
    return {"count": len(reports), "reports": reports}


@app.get("/public/reports/{report_id}")
def public_report_detail(report_id: int) -> dict[str, object]:
    report = get_report(report_id)
    if report is None or report.get("status") not in {"approved", "in_review"}:
        raise HTTPException(status_code=404, detail="Report not found.")
    return {
        "id": report["id"],
        "created_at": report["created_at"],
        "report_type": report["report_type"],
        "status": report["status"],
        "top_confidence": report["top_confidence"],
        "priority": report["priority"],
        "gps": report["gps"],
        "after_image_available": bool(report.get("after_image")),
    }


@app.get("/citizen/summary")
def citizen_summary(session: dict[str, str] = Depends(require_citizen_token)) -> dict[str, object]:
    return citizen_report_summary(session)


@app.get("/citizen/reports")
def citizen_reports(
    limit: int = 30,
    offset: int = 0,
    report_type: str | None = None,
    status: str | None = None,
    intervention_status: str | None = None,
    session: dict[str, str] = Depends(require_citizen_token),
) -> dict[str, object]:
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    citizen_user_id, citizen_email = get_citizen_identity(session)
    reports = list_reports(
        limit=safe_limit,
        offset=safe_offset,
        report_type=report_type,
        status=status,
        intervention_status=intervention_status,
        wallet_address=citizen_email,
        citizen_user_id=citizen_user_id or None,
    )
    total = count_reports(
        report_type=report_type,
        status=status,
        intervention_status=intervention_status,
        wallet_address=citizen_email,
        citizen_user_id=citizen_user_id or None,
    )
    return {
        "count": len(reports),
        "total": total,
        "offset": safe_offset,
        "limit": safe_limit,
        "reports": reports,
    }


@app.get("/citizen/reports/{report_id}")
def citizen_report_detail(
    report_id: int,
    session: dict[str, str] = Depends(require_citizen_token),
) -> dict[str, object]:
    report = get_citizen_report(report_id, session)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    return report


@app.get("/citizen/notifications")
def citizen_notifications(
    limit: int = 10,
    session: dict[str, str] = Depends(require_citizen_token),
) -> dict[str, object]:
    return list_citizen_notifications(limit=limit, session=session)


@app.post("/citizen/notifications/mark-seen")
def citizen_notifications_mark_seen(
    session: dict[str, str] = Depends(require_citizen_token),
) -> dict[str, object]:
    updated = mark_citizen_notifications_seen(session)
    return {"updated": updated}


@app.post("/citizen/register")
def citizen_register(payload: CitizenRegisterRequest) -> dict[str, object]:
    full_name = payload.full_name.strip()
    if len(full_name) < 3:
        raise HTTPException(status_code=400, detail="Ad soyad en az 3 karakter olmalı.")
    email = normalize_email(payload.email)
    code = f"{secrets.randbelow(1_000_000):06d}"
    upsert_citizen_user(full_name=full_name, email=email, password=payload.password, code=code)
    delivery = send_verification_email_runtime(email, code)
    response: dict[str, object] = {
        "status": "verification_required",
        "email": email,
        "delivery": delivery,
        "message": "Doğrulama kodu e-posta adresinize gönderildi.",
    }
    if delivery == "log":
        response["message"] = "SMTP ayarlı değil. Doğrulama kodu backend terminaline yazıldı."
        if EMAIL_EXPOSE_DEV_CODES:
            response["development_code"] = code
    return response


@app.post("/citizen/verify", response_model=CitizenSessionResponse)
def citizen_verify(payload: CitizenVerifyRequest) -> CitizenSessionResponse:
    email = normalize_email(payload.email)
    code = payload.code.strip()
    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(status_code=400, detail="Doğrulama kodu 6 haneli olmalı.")
    row = get_citizen_by_email(email)
    if row is None:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı.")
    expires_at = row["verification_expires_at"]
    if not expires_at or datetime.fromisoformat(expires_at) <= utc_now():
        raise HTTPException(status_code=410, detail="Doğrulama kodunun süresi doldu. Tekrar kayıt kodu alın.")
    expected_hash = str(row["verification_code_hash"] or "")
    if not secrets.compare_digest(hashlib.sha256(code.encode("utf-8")).hexdigest(), expected_hash):
        raise HTTPException(status_code=400, detail="Doğrulama kodu hatalı.")
    with db_lock:
        connection = get_db_connection()
        try:
            connection.execute(
                """
                UPDATE citizen_users
                SET is_verified = 1, verified_at = ?, verification_code_hash = NULL,
                    verification_expires_at = NULL
                WHERE email = ?
                """,
                (utc_now().isoformat(), email),
            )
            connection.commit()
        finally:
            connection.close()
    return create_citizen_session(email=email, full_name=str(row["full_name"]), user_id=int(row["id"]))


@app.post("/citizen/login", response_model=CitizenSessionResponse)
def citizen_login(payload: CitizenLoginRequest) -> CitizenSessionResponse:
    email = normalize_email(payload.email)
    row = get_citizen_by_email(email)
    if row is None or not verify_password(payload.password, str(row["password_hash"])):
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı.")
    if int(row["is_verified"] or 0) != 1:
        raise HTTPException(status_code=403, detail="Giriş için önce e-posta doğrulaması yapın.")
    return create_citizen_session(email=email, full_name=str(row["full_name"]), user_id=int(row["id"]))


@app.post("/citizen/password-reset/request")
def citizen_password_reset_request(payload: CitizenPasswordResetRequest) -> dict[str, object]:
    email = normalize_email(payload.email)
    row = get_citizen_by_email(email)
    response: dict[str, object] = {
        "status": "reset_requested",
        "email": email,
        "delivery": "email",
        "message": "E-posta adresiniz kayıtlıysa şifre sıfırlama kodu gönderildi.",
    }
    if row is None:
        return response

    code = f"{secrets.randbelow(1_000_000):06d}"
    store_citizen_password_reset_code(email, code)
    delivery = send_password_reset_email_runtime(email, code)
    response["delivery"] = delivery
    if delivery == "log":
        response["message"] = "SMTP ayarlı değil. Şifre sıfırlama kodu backend terminaline yazıldı."
        if EMAIL_EXPOSE_DEV_CODES:
            response["development_code"] = code
    return response


@app.post("/citizen/password-reset/confirm", response_model=CitizenSessionResponse)
def citizen_password_reset_confirm(payload: CitizenPasswordResetConfirmRequest) -> CitizenSessionResponse:
    email = normalize_email(payload.email)
    code = payload.code.strip()
    if not re.fullmatch(r"\d{6}", code):
        raise HTTPException(status_code=400, detail="Şifre sıfırlama kodu 6 haneli olmalı.")
    row = consume_citizen_password_reset(email, code, payload.password)
    return create_citizen_session(email=email, full_name=str(row["full_name"]), user_id=int(row["id"]))


@app.get("/citizen/me", response_model=CitizenSessionResponse)
def citizen_me(session: dict[str, str] = Depends(require_citizen_token)) -> CitizenSessionResponse:
    user_id, email = get_citizen_identity(session)
    return CitizenSessionResponse(
        token="",
        user_id=user_id,
        full_name=session["full_name"],
        email=email,
        verified=True,
    )


@app.post("/admin/login", response_model=AdminSessionResponse)
def admin_login(payload: AdminLoginRequest, request: Request) -> AdminSessionResponse:
    username = normalize_admin_identifier(payload.username)
    assert_login_allowed(request, username)
    user_record = ADMIN_USERS.get(username)
    if not (user_record and secrets.compare_digest(payload.password, str(user_record["password"]))):
        record_failed_login(request, username)
        record_audit_log(
            actor_username=username,
            actor_role="unknown",
            action="admin_login",
            report_id=None,
            ip_address=request.client.host if request.client else None,
            status="failed",
            detail={"reason": "invalid_credentials"},
        )
        raise HTTPException(status_code=401, detail="Invalid admin credentials.")
    clear_failed_logins(request, username)
    session = create_admin_session(username)
    record_audit_log(
        actor_username=session.username,
        actor_role=session.role,
        action="admin_login",
        report_id=None,
        ip_address=request.client.host if request.client else None,
        status="success",
        detail={"expires_at": session.expires_at},
    )
    return session


@app.post("/admin/verify", response_model=AdminSessionResponse)
def admin_verify(payload: AdminVerifyRequest, request: Request) -> AdminSessionResponse:
    username = normalize_admin_identifier(payload.username)
    assert_login_allowed(request, username)
    try:
        consume_admin_verification(username, payload.challenge_id.strip(), payload.code.strip())
    except HTTPException:
        record_failed_login(request, username)
        record_audit_log(
            actor_username=username,
            actor_role="unknown",
            action="admin_verify",
            report_id=None,
            ip_address=request.client.host if request.client else None,
            status="failed",
            detail={"reason": "invalid_or_expired_code"},
        )
        raise
    clear_failed_logins(request, username)
    session = create_admin_session(username)
    record_audit_log(
        actor_username=session.username,
        actor_role=session.role,
        action="admin_login",
        report_id=None,
        ip_address=request.client.host if request.client else None,
        status="success",
        detail={"expires_at": session.expires_at, "verification": "email_code"},
    )
    return session


@app.get("/admin/me")
def admin_me(authorization: str | None = Header(default=None)) -> dict[str, object]:
    session = require_admin_token(authorization)
    return {
        "username": session["username"],
        "role": session["role"],
        "expires_at": session["expires_at"],
        "province_scope": session.get("province_scope") or None,
        "district_scopes": parse_district_scopes(session.get("district_scopes")),
    }


@app.post("/admin/logout")
def admin_logout(request: Request, authorization: str | None = Header(default=None)) -> dict[str, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Admin authentication required.")
    token = authorization.split(" ", 1)[1].strip()
    session = get_admin_session(token)
    with admin_sessions_lock:
        admin_sessions.pop(token, None)
    record_audit_log(
        actor_username=session["username"],
        actor_role=session["role"],
        action="admin_logout",
        report_id=None,
        ip_address=request.client.host if request and request.client else None,
        status="success",
        detail={},
    )
    return {"status": "logged_out"}


@app.get("/admin/summary")
def admin_summary(authorization: str | None = Header(default=None)) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "viewer")
    return get_admin_summary(session)


@app.get("/admin/notifications")
def admin_notifications(
    limit: int = 10,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "viewer")
    return list_notifications(limit=limit, session=session)


@app.post("/admin/notifications/mark-seen")
def admin_notifications_mark_seen(
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "viewer")
    updated = mark_notifications_seen(session)
    return {"updated": updated}


@app.get("/admin/reports")
def admin_reports(
    limit: int = 25,
    page: int = 1,
    report_type: str | None = None,
    status: str | None = None,
    intervention_status: str | None = None,
    wallet_query: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    min_confidence: float | None = None,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "viewer")
    safe_limit = max(1, min(limit, 100))
    safe_page = max(1, page)
    offset = (safe_page - 1) * safe_limit
    total = count_reports(
        report_type=report_type,
        status=status,
        intervention_status=intervention_status,
        wallet_query=wallet_query,
        created_from=created_from,
        created_to=created_to,
        min_confidence=min_confidence,
        session=session,
    )
    reports = list_reports(
        limit=safe_limit,
        offset=offset,
        report_type=report_type,
        status=status,
        intervention_status=intervention_status,
        wallet_query=wallet_query,
        created_from=created_from,
        created_to=created_to,
        min_confidence=min_confidence,
        session=session,
    )
    return {
        "count": len(reports),
        "total": total,
        "page": safe_page,
        "page_size": safe_limit,
        "total_pages": max(1, (total + safe_limit - 1) // safe_limit),
        "reports": reports,
    }


@app.get("/admin/reports/export")
def admin_reports_export(
    report_type: str | None = None,
    status: str | None = None,
    intervention_status: str | None = None,
    wallet_query: str | None = None,
    created_from: str | None = None,
    created_to: str | None = None,
    min_confidence: float | None = None,
    authorization: str | None = Header(default=None),
) -> Response:
    session = require_admin_token(authorization)
    require_role(session, "viewer")
    csv_body = build_reports_csv(
        report_type=report_type,
        status=status,
        intervention_status=intervention_status,
        wallet_query=wallet_query,
        created_from=created_from,
        created_to=created_to,
        min_confidence=min_confidence,
        session=session,
    )
    filename = f"urbanchain_reports_{utc_now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_body,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/admin/reports/{report_id}")
def admin_report_detail(report_id: int, authorization: str | None = Header(default=None)) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "viewer")
    return get_scoped_report_or_404(report_id, session)


@app.get("/admin/reports/{report_id}/notes-history")
def admin_report_notes_history(report_id: int, authorization: str | None = Header(default=None)) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "viewer")
    get_scoped_report_or_404(report_id, session)
    return {"report_id": report_id, "entries": list_report_note_entries(report_id)}


@app.patch("/admin/reports/{report_id}/status")
def admin_report_status(
    report_id: int,
    payload: ReportStatusUpdate,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "reviewer")
    get_scoped_report_or_404(report_id, session)
    report = update_report_status(report_id, payload.status)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    record_audit_log(
        actor_username=session["username"],
        actor_role=session["role"],
        action="report_status_update",
        report_id=report_id,
        ip_address=request.client.host if request and request.client else None,
        status="success",
        detail={"status": payload.status},
    )
    return report


@app.patch("/admin/reports/{report_id}/assignment")
def admin_report_assignment(
    report_id: int,
    payload: ReportAssignmentUpdate,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "reviewer")
    get_scoped_report_or_404(report_id, session)
    report = update_report_assignment(
        report_id,
        assigned_team=payload.assigned_team,
        assigned_to=payload.assigned_to,
        intervention_status=payload.intervention_status,
    )
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    record_audit_log(
        actor_username=session["username"],
        actor_role=session["role"],
        action="report_assignment_update",
        report_id=report_id,
        ip_address=request.client.host if request.client else None,
        status="success",
        detail={
            "assigned_team": payload.assigned_team,
            "assigned_to": payload.assigned_to,
            "intervention_status": payload.intervention_status,
        },
    )
    return report


@app.patch("/admin/reports/{report_id}/notes")
def admin_report_notes(
    report_id: int,
    payload: ReportNotesUpdate,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "reviewer")
    get_scoped_report_or_404(report_id, session)
    report = update_report_notes(report_id, payload.notes)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")
    if payload.notes.strip():
        append_report_note_entry(
            report_id,
            actor_username=session["username"],
            actor_role=session["role"],
            note_text=payload.notes,
        )
    record_audit_log(
        actor_username=session["username"],
        actor_role=session["role"],
        action="report_notes_update",
        report_id=report_id,
        ip_address=request.client.host if request.client else None,
        status="success",
        detail={"notes_length": len(payload.notes.strip())},
    )
    return report


@app.post("/admin/reports/{report_id}/pin-ipfs")
def admin_report_pin_ipfs(
    report_id: int,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "reviewer")
    report = get_scoped_report_or_404(report_id, session)
    if report["status"] != "approved":
        raise HTTPException(status_code=409, detail="Only approved reports can be pinned to IPFS.")

    existing_ipfs = report.get("ipfs")
    if isinstance(existing_ipfs, dict) and existing_ipfs.get("cid"):
        return {
            "report_id": report_id,
            "already_pinned": True,
            "ipfs": existing_ipfs,
        }

    image_path = UPLOAD_DIR / str(report["saved_as"])
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Stored report image could not be found.")

    ipfs_payload = upload_file_to_ipfs(file_path=image_path, report=report)
    updated_report = update_report_ipfs(
        report_id,
        ipfs_payload["cid"],
        ipfs_payload["url"],
        ipfs_payload["pinned_at"],
    )
    record_audit_log(
        actor_username=session["username"],
        actor_role=session["role"],
        action="report_pin_ipfs",
        report_id=report_id,
        ip_address=request.client.host if request and request.client else None,
        status="success",
        detail={"cid": ipfs_payload["cid"]},
    )
    return {
        "report_id": report_id,
        "already_pinned": False,
        "ipfs": ipfs_payload,
        "report": updated_report,
    }


@app.post("/admin/reports/{report_id}/after-photo")
async def admin_report_after_photo(
    report_id: int,
    request: Request,
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "reviewer")
    report = get_scoped_report_or_404(report_id, session)

    upload_path = save_validated_upload(file)
    sha256 = compute_sha256(upload_path)
    updated_report = update_report_after_image(
        report_id,
        saved_as=upload_path.name,
        sha256=sha256,
        uploaded_at=utc_now().isoformat(),
    )
    record_audit_log(
        actor_username=session["username"],
        actor_role=session["role"],
        action="report_after_photo_upload",
        report_id=report_id,
        ip_address=request.client.host if request.client else None,
        status="success",
        detail={"saved_as": upload_path.name},
    )
    return {
        "report_id": report_id,
        "after_image": updated_report["after_image"] if updated_report else None,
        "report": updated_report,
    }


@app.post("/admin/reports/{report_id}/seal-proof")
def admin_report_seal_proof(
    report_id: int,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "reviewer")
    report = get_scoped_report_or_404(report_id, session)
    if report["status"] != "approved":
        raise HTTPException(status_code=409, detail="Only approved reports can be sealed.")

    existing_proof = report.get("proof")
    if isinstance(existing_proof, dict) and existing_proof.get("chain_hash"):
        return {
            "report_id": report_id,
            "already_sealed": True,
            "proof": existing_proof,
        }

    proof_payload = build_report_proof(report)
    updated_report = update_report_proof(
        report_id,
        proof_payload["payload_hash"],
        proof_payload["chain_hash"],
        proof_payload["previous_hash"],
        proof_payload["sealed_at"],
    )
    record_audit_log(
        actor_username=session["username"],
        actor_role=session["role"],
        action="report_seal_proof",
        report_id=report_id,
        ip_address=request.client.host if request and request.client else None,
        status="success",
        detail={"chain_hash": proof_payload["chain_hash"]},
    )
    return {
        "report_id": report_id,
        "already_sealed": False,
        "proof": proof_payload,
        "report": updated_report,
    }


@app.get("/admin/proof-chain/verify")
def admin_verify_proof_chain(authorization: str | None = Header(default=None)) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "viewer")
    return verify_proof_chain()


@app.post("/admin/proof-chain/rebuild")
def admin_rebuild_proof_chain(
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "admin")
    result = rebuild_proof_chain()
    record_audit_log(
        actor_username=session["username"],
        actor_role=session["role"],
        action="proof_chain_rebuild",
        report_id=None,
        ip_address=request.client.host if request.client else None,
        status="success",
        detail={"rebuilt_reports": result["rebuilt_reports"], "latest_chain_hash": result["latest_chain_hash"]},
    )
    return result


@app.post("/admin/proof-chain/seal-pending")
def admin_seal_pending_proof_chain(
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "reviewer")
    result = seal_pending_resolved_reports(session)
    record_audit_log(
        actor_username=session["username"],
        actor_role=session["role"],
        action="proof_chain_seal_pending",
        report_id=None,
        ip_address=request.client.host if request.client else None,
        status="success" if not result["failed"] else "partial",
        detail={
            "pending": result["pending"],
            "sealed_count": result["sealed_count"],
            "failed_count": len(result["failed"]),
        },
    )
    return result


@app.get("/admin/audit-logs")
def admin_audit_logs(
    limit: int = 30,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    session = require_admin_token(authorization)
    require_role(session, "admin")
    logs = list_audit_logs(limit=limit)
    return {"count": len(logs), "logs": logs}


@app.post("/predict")
async def predict(
    require_gps: bool = True,
    browser_latitude: float | None = None,
    browser_longitude: float | None = None,
    file: UploadFile = File(...),
    notes: str = Form(default=""),
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bildirim göndermek için giriş yapmanız gerekiyor.")
    citizen_session = get_citizen_session(authorization.split(" ", 1)[1].strip())
    if not citizen_session:
        raise HTTPException(status_code=401, detail="Oturum geçersiz veya süresi dolmuş.")
    citizen_user_id, citizen_email = get_citizen_identity(citizen_session)
    if citizen_user_id <= 0 or not citizen_email:
        raise HTTPException(status_code=401, detail="Kullanıcı kimliği doğrulanamadı.")
    normalized_wallet_address = citizen_email
    upload_path = save_validated_upload(file)

    sha256 = compute_sha256(upload_path)
    perceptual_hash = compute_perceptual_hash(upload_path)
    exif_metadata = extract_exif_metadata(upload_path)
    has_browser_gps = browser_latitude is not None and browser_longitude is not None
    if require_gps and exif_metadata["gps"] is None and not has_browser_gps:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Location data is required for this report.")

    # Sahne kapisi kopya kontrolunden ONCE calisir: daha once raporlanmis gecersiz bir
    # gorsel (ornegin bir tablo) yeniden yuklenirse, eski rapora yonlendirmek yerine
    # modelin reddini gosterelim ki kullanici ve test eden net geri bildirim alsin.
    scene_gate = evaluate_scene_gate(upload_path)
    if scene_gate is not None and not scene_gate["is_real_scene"]:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail="Bu görsel gerçek bir sokak/kent fotoğrafı gibi görünmüyor. Lütfen sahadan çekilmiş gerçek bir fotoğraf yükleyin.",
        )

    if DUPLICATE_CHECK_ENABLED:
      with report_index_lock:
        report_index = load_report_index()
        duplicate_of = report_index.get(sha256)
        if duplicate_of is not None:
            upload_path.unlink(missing_ok=True)
            existing_report = find_report_by_sha256(sha256)
            visible_existing_report = existing_report if report_belongs_to_citizen(existing_report, citizen_session) else None
            return {
                "filename": file.filename,
                "duplicate": True,
                "sha256": sha256,
                "wallet_address": None if normalized_wallet_address == ANONYMOUS_WALLET_LABEL else normalized_wallet_address,
                "reporter_label": "Anonymous citizen" if normalized_wallet_address == ANONYMOUS_WALLET_LABEL else normalized_wallet_address,
                "duplicate_of": duplicate_of if visible_existing_report else None,
                "existing_report": visible_existing_report,
                "exif": exif_metadata,
                "browser_location": {
                    "latitude": browser_latitude,
                    "longitude": browser_longitude,
                }
                if has_browser_gps
                else None,
                "message": "This image was already submitted before.",
            }

    similar_report = find_similar_report_by_perceptual_hash(perceptual_hash) if DUPLICATE_CHECK_ENABLED else None
    if similar_report is not None:
        upload_path.unlink(missing_ok=True)
        visible_similar_report = similar_report if report_belongs_to_citizen(similar_report, citizen_session) else None
        return {
            "filename": file.filename,
            "duplicate": True,
            "duplicate_kind": "perceptual",
            "sha256": sha256,
            "perceptual_hash": perceptual_hash,
            "wallet_address": None if normalized_wallet_address == ANONYMOUS_WALLET_LABEL else normalized_wallet_address,
            "reporter_label": "Anonymous citizen" if normalized_wallet_address == ANONYMOUS_WALLET_LABEL else normalized_wallet_address,
            "existing_report": visible_similar_report,
            "exif": exif_metadata,
            "browser_location": {
                "latitude": browser_latitude,
                "longitude": browser_longitude,
            }
            if has_browser_gps
            else None,
            "message": "A visually similar image was already submitted before.",
        }

    results = get_model().predict(
        str(upload_path),
        imgsz=MODEL_IMGSZ,
        conf=0.35,
        iou=0.45,
        device=resolve_model_device(),
        verbose=False,
    )
    result = results[0]

    detections: list[dict[str, object]] = []
    for box in result.boxes:
        xyxy = [round(value, 2) for value in box.xyxy[0].tolist()]
        detections.append(
            {
                "class_id": int(box.cls.item()),
                "class_name": result.names[int(box.cls.item())],
                "confidence": round(float(box.conf.item()), 4),
                "bbox_xyxy": xyxy,
            }
        )

    top_detection = max(detections, key=lambda item: item["confidence"], default=None)
    if top_detection is None:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Görselde herhangi bir sorun tespit edilemedi.")
    if float(top_detection["confidence"]) < MIN_CONFIDENCE:
        upload_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail="Modelin güveni düşük. Lütfen daha net, daha yakın ve iyi ışıkta bir fotoğraf yükleyin.",
        )

    report_type = str(top_detection["class_name"])

    if report_type == "garbage":
        garbage_detections = [d for d in detections if str(d["class_name"]) == "garbage"]
        num_garbage = len(garbage_detections)
        img_area = result.orig_shape[0] * result.orig_shape[1]
        bbox = top_detection["bbox_xyxy"]
        bbox_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        bbox_ratio = bbox_area / img_area if img_area > 0 else 0.0
        sufficient_area = num_garbage >= 2 or bbox_ratio >= MIN_GARBAGE_BBOX_AREA_RATIO
        if float(top_detection["confidence"]) < MIN_GARBAGE_CONFIDENCE or not sufficient_area:
            upload_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=422,
                detail="Görüntüde belediyeyi ilgilendirecek düzeyde çöp tespit edilemedi. Daha büyük veya belirgin bir çöp alanını kapsayan fotoğraf yükleyin.",
            )
    reward_points = REPORT_POINTS.get(report_type, 0)
    stored_report = insert_report(
        filename=file.filename,
        saved_as=upload_path.name,
        wallet_address=normalized_wallet_address,
        citizen_user_id=citizen_user_id,
        sha256=sha256,
        perceptual_hash=perceptual_hash,
        exif_metadata=exif_metadata,
        browser_latitude=browser_latitude,
        browser_longitude=browser_longitude,
        image_width=result.orig_shape[1],
        image_height=result.orig_shape[0],
        num_detections=len(detections),
        report_type=report_type,
        reward_points=reward_points,
        top_detection=top_detection,
        detections=detections,
        report_notes=notes[:1200],
    )
    response = {
        "report_id": stored_report["id"],
        "filename": file.filename,
        "saved_as": upload_path.name,
        "duplicate": False,
        "sha256": sha256,
        "perceptual_hash": perceptual_hash,
        "wallet_address": None if normalized_wallet_address == ANONYMOUS_WALLET_LABEL else normalized_wallet_address,
        "reporter_label": "Anonymous citizen" if normalized_wallet_address == ANONYMOUS_WALLET_LABEL else normalized_wallet_address,
        "exif": exif_metadata,
        "browser_location": {
            "latitude": browser_latitude,
            "longitude": browser_longitude,
        }
        if has_browser_gps
        else None,
        "location": stored_report["location"],
        "image_size": {"width": result.orig_shape[1], "height": result.orig_shape[0]},
        "num_detections": len(detections),
        "report_type": report_type,
        "reward_points": reward_points,
        "status": stored_report["status"],
        "top_detection": top_detection,
        "detections": detections,
        "notes": stored_report.get("notes", ""),
        "citizen_note": stored_report.get("citizen_note", ""),
        "assignment": stored_report.get("assignment"),
        "after_image": stored_report.get("after_image"),
    }

    with report_index_lock:
        report_index = load_report_index()
        report_index[sha256] = {
            "saved_as": upload_path.name,
            "wallet_address": None if normalized_wallet_address == ANONYMOUS_WALLET_LABEL else normalized_wallet_address,
            "citizen_user_id": citizen_user_id,
            "report_type": report_type,
            "top_detection": top_detection,
        }
        save_report_index(report_index)

    return response
