"""
Mevcut best.pt üzerinden fine-tune — sadece garbage sınıfını güçlendirmek için.
Tam yeniden eğitim değil; 25 epoch, düşük lr ile hızlı uyum.
"""

from pathlib import Path
from ultralytics import YOLO

BASE_MODEL  = Path("runs/detect/urbanchain_yolov8s_v2_8class/weights/best.pt")
DATA_YAML   = Path("datasets/urbanchain_v2/data.yaml")
PROJECT     = "runs/detect"
RUN_NAME    = "urbanchain_yolov8s_v3_finetune"

def main():
    if not BASE_MODEL.exists():
        print(f"Model bulunamadi: {BASE_MODEL}")
        return
    if not DATA_YAML.exists():
        print(f"data.yaml bulunamadi: {DATA_YAML}")
        return

    model = YOLO(str(BASE_MODEL))

    model.train(
        data=str(DATA_YAML),
        epochs=25,
        imgsz=640,
        batch=8,
        lr0=0.0005,       # düşük lr — mevcut ağırlıkları bozmamak için
        lrf=0.01,
        warmup_epochs=2,
        patience=10,
        optimizer="AdamW",
        weight_decay=0.0005,
        augment=True,
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        fliplr=0.5,
        mosaic=1.0,
        project=PROJECT,
        name=RUN_NAME,
        exist_ok=True,
        device=0,
        workers=0,
        seed=42,
        verbose=True,
    )

    best = Path(PROJECT) / RUN_NAME / "weights" / "best.pt"
    print(f"\nEgitim tamamlandi.")
    print(f"Yeni model: {best}")
    print(f"\nBackend'de kullanmak icin main.py'deki model yolunu guncelle:")
    print(f'  DEFAULT_MODEL_PATH = ROOT / "{PROJECT}" / "{RUN_NAME}" / "weights" / "best.pt"')

if __name__ == "__main__":
    main()
