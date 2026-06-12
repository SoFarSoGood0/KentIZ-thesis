# UrbanChain

UrbanChain is an AI-assisted municipal issue reporting platform built around three goals:

1. detect common street issues from uploaded photos
2. review and manage reports through an admin control panel
3. preserve evidence integrity with IPFS and a chained proof mechanism

This repository contains the trained detection workflow, the FastAPI backend, and the web-based admin dashboard.

## Project Status

The project is currently at an advanced MVP stage.

Implemented:

- unified multi-class dataset preparation
- YOLOv8 training pipeline
- trained issue-detection model
- FastAPI backend with image inference
- duplicate prevention with SHA256 and perceptual hash
- EXIF/GPS validation
- admin authentication and role-based access
- SQLite report storage
- admin dashboard with filtering, map view, analytics and export
- IPFS evidence pinning
- chained proof sealing for tamper-evident audit trails
- field assignment, notes history and intervention lifecycle tracking

Current issue classes:

- `pothole`
- `garbage`
- `sidewalk`

## High-Level Architecture

UrbanChain follows a web-first workflow:

1. a citizen or operator uploads an image
2. the backend runs the trained YOLO model
3. the report is validated and stored
4. admins review the report in the dashboard
5. approved evidence can be pinned to IPFS
6. approved and pinned reports can be sealed into a chained proof log
7. field teams can be assigned, notes can be added and intervention status can be tracked

Core components:

- `prepare_dataset.py`
  - merges source datasets into a single YOLO dataset
- `train_model.py`
  - trains the detection model
- `backend/main.py`
  - API, validation, storage, IPFS and proof logic
- `frontend/`
  - admin dashboard UI

## Why IPFS + Proof Chain

For the MVP, UrbanChain uses:

- `IPFS` for evidence persistence
- a `local chained proof mechanism` for tamper-evident auditability

This is intentionally simpler than a public blockchain deployment.

Why:

- no faucet or gas dependency
- no contract deployment overhead
- still demonstrates record integrity and chained audit logic

Each sealed report stores:

- payload hash
- previous proof hash
- current chain hash
- sealed timestamp

If a sealed report is modified later, the proof chain verification will fail.

## Admin Dashboard Features

The admin control room supports:

- live report listing
- advanced filtering
- map view for GPS-tagged incidents
- confidence and priority insights
- CSV export
- PDF print/export for individual reports
- report approval and rejection
- IPFS pinning
- proof-chain verification
- audit logs
- team assignment
- intervention status tracking
- notes and notes history
- before/after intervention evidence flow

## Roles

Current roles:

- `viewer`
  - read-only dashboard access
- `reviewer`
  - can update reports, pin IPFS, seal proof, assign teams and manage notes
- `admin`
  - reviewer abilities plus audit visibility and full admin control

## Running The Project

## 1. Backend

Run the API:

```powershell
venv\Scripts\python.exe -m uvicorn backend.main:app
```

Backend default URL:

- `http://127.0.0.1:8000`

Useful endpoints:

- `GET /health`
- `POST /predict`
- `GET /admin/summary`
- `GET /admin/reports`

## 2. Frontend

Serve the dashboard:

```powershell
cd frontend
python -m http.server 5500
```

Open:

- `http://127.0.0.1:5500`

## 3. Admin Login

Admin credentials and city scopes are read from `.env`. In the production-style flow, an admin first enters the city-authorized e-mail and password, then confirms the 6-digit code sent to that e-mail.

Example city-scoped admin list:

```env
URBANCHAIN_ADMIN_USERS_JSON=[{"email":"abc@istanbul.gov.tr","password":"change-this-password","role":"admin","province":"İstanbul"},{"email":"abc@nigde.gov.tr","password":"change-this-password","role":"admin","province":"Niğde"}]
```

For real e-mail delivery, configure SMTP:

```env
URBANCHAIN_SMTP_HOST=smtp.gmail.com
URBANCHAIN_SMTP_PORT=587
URBANCHAIN_SMTP_USERNAME=your-mail@gmail.com
URBANCHAIN_SMTP_PASSWORD=your-app-password
URBANCHAIN_SMTP_FROM_EMAIL=Kentİz <your-mail@gmail.com>
URBANCHAIN_REQUIRE_SMTP=1
```

See:

- `.env.example`

Important:

- keep `.env` out of version control
- rotate secrets if they are ever exposed

## Environment Configuration

Key variables include:

- admin users and roles
- allowed CORS origins
- upload size limit
- login brute-force controls
- Pinata/IPFS credentials
- perceptual hash threshold

Use:

- [.env.example](./.env.example)

as the baseline for configuration.

## Model Notes

The current model was trained as an MVP-oriented YOLOv8s configuration to balance:

- training time
- hardware limits
- acceptable detection quality

The backend loads the trained model from:

- `runs/detect/urbanchain_yolov8s_v2_8class/weights/best.pt`

The previous model is still kept as a backup at:

- `runs/detect/urbanchain_yolov8s_mvp/weights/best.pt`

If you want to try a stronger model without touching the current one, use:

- `prepare_dataset_v2.py`
- `train_model_v2.py`
- `start_train_v2.ps1`

The v2 dataset expands the road-surface taxonomy into:

- `pothole`
- `garbage`
- `alligator_crack`
- `block_crack`
- `longitudinal_crack`
- `oblique_crack`
- `repair`
- `transverse_crack`

The training script writes to a separate run directory:

- `runs/detect/urbanchain_yolov8s_v2_8class/weights/best.pt`

To launch training in the background on Windows:

```powershell
.\start_train_v2.ps1
```

The backend model path can also be overridden with:

- `URBANCHAIN_MODEL_PATH`

## Security Features

Implemented protections:

- optional anonymous submission flow
- EXIF/GPS enforcement
- duplicate image prevention
- perceptual duplicate detection
- role-based admin authorization
- login attempt throttling
- upload size limit
- audit trail recording
- IPFS pinning restricted to approved reports
- proof sealing restricted to approved and pinned reports

## Suggested Demo Flow

Recommended presentation order:

1. upload or show a detected report
2. inspect it in the admin dashboard
3. approve it
4. pin it to IPFS
5. seal it into the proof chain
6. assign a field team
7. add notes
8. upload an after photo
9. show proof verification and export

## Next Possible Steps

Strong next directions:

- citizen-facing web interface
- better visual dashboards and charts
- report archive and intervention history pages
- PDF template improvements
- production-grade session storage
- external database migration
- public-chain integration in a later phase if needed

## Repository Notes

The repository may still contain experimental or legacy artifacts from development, such as:

- older YOLO weight files
- contract drafts kept for reference

The current active MVP flow is:

- AI detection
- backend validation
- admin review
- IPFS evidence
- chained proof verification
