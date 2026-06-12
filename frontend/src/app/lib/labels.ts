const REPORT_TYPE_LABELS: Record<string, string> = {
  pothole: "Yol çukuru",
  garbage: "Çöp",
  sidewalk: "Kaldırım hasarı",
  road_damage: "Yol çukuru",
  pavement_damage: "Kaldırım hasarı",
  alligator_crack: "Çatlak",
  block_crack: "Çatlak",
  longitudinal_crack: "Çatlak",
  oblique_crack: "Çatlak",
  transverse_crack: "Çatlak",
  repair: "Onarım ihtiyacı",
};

const REPORT_STATUS_LABELS: Record<string, string> = {
  pending_review: "İnceleme bekliyor",
  in_review: "İncelemede",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

const INTERVENTION_STATUS_LABELS: Record<string, string> = {
  pending_dispatch: "Atama bekliyor",
  assigned: "Atandı",
  in_progress: "İşlemde",
  resolved: "Çözüldü",
};

export const STATUS_CLASS_MAP: Record<string, string> = {
  pending_review: "status-pending",
  in_review: "status-review",
  approved: "status-approved",
  rejected: "status-rejected",
  pending_dispatch: "status-pending",
  assigned: "status-assigned",
  in_progress: "status-progress",
  resolved: "status-resolved",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  critical: "Kritik",
};

export function reportTypeLabel(value: string | null | undefined) {
  const key = String(value || "").toLowerCase();
  return REPORT_TYPE_LABELS[key] || key.replaceAll("_", " ");
}

export function reportStatusLabel(value: string | null | undefined) {
  const key = String(value || "").toLowerCase();
  return REPORT_STATUS_LABELS[key] || key.replaceAll("_", " ");
}

export function interventionStatusLabel(value: string | null | undefined) {
  const key = String(value || "").toLowerCase();
  return INTERVENTION_STATUS_LABELS[key] || key.replaceAll("_", " ");
}

export function priorityLabel(value: string | null | undefined) {
  const key = String(value || "").toLowerCase();
  return PRIORITY_LABELS[key] || key.replaceAll("_", " ");
}
