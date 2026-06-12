import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Filter, MapPin, RotateCcw } from "lucide-react";
import { fetchJson } from "../lib/api";
import { reportTypeLabel } from "../lib/labels";

// ── Helpers ────────────────────────────────────────────────────────────────

function getMarkerColor(report: any): string {
  const s = String(report?.status || "");
  const i = String(report?.assignment?.intervention_status || "");
  if (s === "rejected") return "#64748b";
  if (s === "pending_review") return "#f59e0b";
  if (s === "in_review") return "#60a5fa";
  if (s === "approved") {
    if (i === "resolved") return "#10b981";
    if (i === "assigned" || i === "in_progress") return "#22d3ee";
    return "#86efac";
  }
  return "#94a3b8";
}

function getStatusLabel(report: any): string {
  const s = String(report?.status || "");
  const i = String(report?.assignment?.intervention_status || "");
  if (s === "rejected") return "Reddedildi";
  if (s === "pending_review") return "İnceleme Bekliyor";
  if (s === "in_review") return "İncelemede";
  if (s === "approved") {
    if (i === "resolved") return "Çözüldü";
    if (i === "assigned") return "Ekip Atandı";
    if (i === "in_progress") return "Sahada";
    return "Onaylandı";
  }
  return s;
}

function getLocationLabel(r: any): string {
  const n = String(r?.neighborhood_name || "").trim();
  const d = String(r?.district_name || "").trim();
  const p = String(r?.province_name || "").trim();
  return [n, d, p].filter(Boolean).join(", ") || "Konum bilgisi yok";
}

function buildPopupHtml(report: any): string {
  const color = getMarkerColor(report);
  const status = getStatusLabel(report);
  const loc = getLocationLabel(report);
  const lat = Number(report.gps.latitude).toFixed(5);
  const lng = Number(report.gps.longitude).toFixed(5);
  return `
    <div class="ktz-map-popup">
      <div class="ktz-map-popup-header">
        <span class="ktz-map-popup-id">RP-${report.id}</span>
        <span class="ktz-map-popup-status" style="background:${color}28;color:${color};border:1px solid ${color}44">${status}</span>
      </div>
      <p class="ktz-map-popup-type">${reportTypeLabel(report.report_type)}</p>
      <p class="ktz-map-popup-loc">${loc}</p>
      <p class="ktz-map-popup-coords">${lat}, ${lng}</p>
      <button class="ktz-map-popup-link" data-id="${report.id}">Detay Gör ↗</button>
    </div>
  `;
}

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "Tüm Durumlar" },
  { value: "pending_review", label: "İnceleme Bekliyor" },
  { value: "in_review", label: "İncelemede" },
  { value: "approved", label: "Onaylandı" },
  { value: "rejected", label: "Reddedildi" },
];

const LEGEND = [
  { color: "#f59e0b", label: "İnceleme Bekliyor" },
  { color: "#60a5fa", label: "İncelemede" },
  { color: "#86efac", label: "Onaylandı" },
  { color: "#22d3ee", label: "Ekip Atandı" },
  { color: "#10b981", label: "Çözüldü" },
  { color: "#64748b", label: "Reddedildi" },
];

// ── Component ──────────────────────────────────────────────────────────────

export function AdminMap() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [allReports, setAllReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Fetch reports
  useEffect(() => {
    fetchJson<any>("/admin/reports?limit=500")
      .then((d) => setAllReports(d.reports || []))
      .catch((e) => setError(e instanceof Error ? e.message : "Raporlar yüklenemedi."))
      .finally(() => setLoading(false));
  }, []);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { center: [39.0, 35.0], zoom: 6, zoomControl: true });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Update markers when data or filter changes
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const mapped = allReports.filter((r) => r.gps?.latitude != null && r.gps?.longitude != null);
    const filtered = filterStatus ? mapped.filter((r) => r.status === filterStatus) : mapped;

    if (filtered.length > 0) {
      const lats = filtered.map((r) => Number(r.gps.latitude));
      const lngs = filtered.map((r) => Number(r.gps.longitude));
      const bounds = L.latLngBounds(
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      );
      map.fitBounds(bounds.pad(0.15), { maxZoom: 15, animate: true });
    }

    filtered.forEach((report) => {
      const lat = Number(report.gps.latitude);
      const lng = Number(report.gps.longitude);
      const color = getMarkerColor(report);

      const marker = L.circleMarker([lat, lng], {
        radius: 9,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2,
      });

      const popup = L.popup({ className: "ktz-leaflet-popup", minWidth: 195 }).setContent(buildPopupHtml(report));
      marker.bindPopup(popup);

      marker.on("popupopen", () => {
        const btn = document.querySelector(`.leaflet-popup-content [data-id="${report.id}"]`);
        if (btn) {
          L.DomEvent.addListener(btn as HTMLElement, "click", () => {
            navigate(`/admin/reports/${report.id}`);
          });
        }
      });

      group.addLayer(marker);
    });
  }, [allReports, filterStatus, navigate]);

  const mapped = allReports.filter((r) => r.gps?.latitude != null && r.gps?.longitude != null);
  const filtered = filterStatus ? mapped.filter((r) => r.status === filterStatus) : mapped;
  const noGps = allReports.length - mapped.length;
  const counts = {
    pending_review: mapped.filter((r) => r.status === "pending_review").length,
    in_review: mapped.filter((r) => r.status === "in_review").length,
    approved: mapped.filter((r) => r.status === "approved").length,
    rejected: mapped.filter((r) => r.status === "rejected").length,
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="admin-panel">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={15} className="text-slate-400 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-300">Filtrele:</span>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="ktz-filter-select">
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {filterStatus ? (
            <button type="button" onClick={() => setFilterStatus("")} className="admin-ghost-btn inline-flex items-center gap-1.5 text-xs">
              <RotateCcw size={12} /> Sıfırla
            </button>
          ) : null}
          <div className="ml-auto flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <MapPin size={12} className="text-cyan-400" />{filtered.length} haritada
            </span>
            {noGps > 0 && <span className="text-slate-500">{noGps} konumsuz rapor gizlendi</span>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="admin-panel overflow-hidden p-0" style={{ height: "calc(100vh - 270px)", minHeight: 420 }}>
        {error ? (
          <div className="admin-status-error m-4">{error}</div>
        ) : loading ? (
          <div className="admin-empty-state h-full flex items-center justify-center">Harita yükleniyor…</div>
        ) : (
          <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "İnceleme Bekliyor", count: counts.pending_review, color: "#f59e0b" },
          { label: "İncelemede", count: counts.in_review, color: "#60a5fa" },
          { label: "Onaylandı", count: counts.approved, color: "#86efac" },
          { label: "Reddedildi", count: counts.rejected, color: "#64748b" },
        ].map((s) => (
          <div key={s.label} className="admin-panel flex items-center gap-3">
            <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <div>
              <p className="text-lg font-bold text-white">{s.count}</p>
              <p className="text-[10px] text-slate-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
