import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, HardDrive, Link2, Loader2, Search, ShieldCheck, X } from "lucide-react";
import { fetchJson, sealPendingProofChain, verifyAdminProofChain } from "../lib/api";

export function AdminVerification() {
  const [summary, setSummary] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [proofResult, setProofResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sealing, setSealing] = useState(false);
  const [sealMessage, setSealMessage] = useState("");
  const [sealError, setSealError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summaryData, reportsData, proofData] = await Promise.all([
        fetchJson("/admin/summary"),
        fetchJson("/admin/reports?limit=100&page=1"),
        verifyAdminProofChain().catch(() => null),
      ]);
      setSummary(summaryData);
      setReports(reportsData.reports || []);
      setProofResult(proofData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Doğrulama görünümü yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isResolved = (r: any) =>
    r.status === "approved" && r.assignment?.intervention_status === "resolved";
  const isSealed = (r: any) => Boolean(r.ipfs?.cid && r.proof?.chain_hash);

  const chainTs = (r: any) =>
    r.proof?.created_at || r.resolved_at || r.ipfs?.pinned_at || r.created_at;

  // Pending = resolved reports that are not fully sealed yet (their automatic
  // sealing failed, e.g. a transient IPFS outage).
  const pendingReports = reports.filter((r) => isResolved(r) && !isSealed(r));

  const handleSealPending = useCallback(async () => {
    if (sealing) return;
    setSealing(true);
    setSealMessage("");
    setSealError(false);
    try {
      const result = await sealPendingProofChain();
      const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
      if (result.pending === 0) {
        setSealMessage("Mühürlenecek bekleyen kayıt yok.");
      } else if (failedCount === 0) {
        setSealMessage(`${result.sealed_count} kayıt zincire eklendi.`);
      } else {
        setSealError(true);
        const firstErr = result.failed?.[0]?.error ? ` (${result.failed[0].error})` : "";
        setSealMessage(`${result.sealed_count} kayıt mühürlendi, ${failedCount} kayıt başarısız${firstErr}.`);
      }
      await load();
    } catch (err) {
      setSealError(true);
      setSealMessage(err instanceof Error ? err.message : "Mühürleme başarısız.");
    } finally {
      setSealing(false);
    }
  }, [sealing, load]);

  // Show sealed reports AND resolved-but-pending ones so gaps are visible.
  const verifiedReports = reports
    .filter((r) => r.ipfs?.cid || r.proof?.chain_hash || isResolved(r))
    .sort((a, b) => new Date(chainTs(b)).getTime() - new Date(chainTs(a)).getTime());

  const filteredReports = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return verifiedReports;
    return verifiedReports.filter((report) => {
      const haystack = [
        report.id,
        report.created_at,
        report.report_type,
        report.status,
        report.ipfs?.cid,
        report.proof?.chain_hash,
        report.province_name,
        report.district_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [verifiedReports, searchText]);

  if (loading) {
    return <div className="admin-empty-state">Kanıt verileri yükleniyor...</div>;
  }

  if (error) {
    return <div className="admin-status-error">{error}</div>;
  }

  return (
    <div>
      <div className="admin-stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="admin-stat">
          <small>IPFS'e sabitlenen</small>
          <strong>{summary?.ipfs_pinned_count ?? 0}</strong>
          <span>Dağıtık depolama</span>
        </div>
        <div className="admin-stat">
          <small>Mühürlenen</small>
          <strong>{summary?.proof_sealed_count ?? 0}</strong>
          <span>Kanıt zinciri kaydı</span>
        </div>
        <div className="admin-stat">
          <small>Sistem bütünlüğü</small>
          <strong>{proofResult?.ok ? "Geçerli" : "—"}</strong>
          <span>{proofResult?.valid_reports ?? 0} kayıt doğrulandı</span>
        </div>
      </div>

      {proofResult ? (
        <div className={`admin-proof-banner ${proofResult.ok ? "is-ok" : "is-warn"}`}>
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>
            {proofResult.ok
              ? `Kanıt zinciri ${proofResult.valid_reports} mühürlü kayıt için doğrulandı · Son özet: ${String(proofResult.latest_chain_hash || "").slice(0, 20)}...`
              : proofResult.first_error?.reason || "Kanıt zinciri uyuşmazlığı tespit edildi."}
          </span>
        </div>
      ) : null}

      {sealMessage ? (
        <div className={sealError ? "admin-status-error" : "admin-flash-message"}>{sealMessage}</div>
      ) : null}

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <h3>Kanıt kayıtları</h3>
            <p>IPFS ile sabitlenmiş ve mühürlenmiş bildirimler</p>
          </div>
          {pendingReports.length > 0 ? (
            <button
              type="button"
              onClick={handleSealPending}
              disabled={sealing}
              className="flex items-center gap-2 rounded-lg border border-teal-400/30 bg-teal-500/15 px-3 py-2 text-sm font-semibold text-teal-300 transition-colors hover:bg-teal-500/25 disabled:opacity-50"
            >
              {sealing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {sealing ? "Mühürleniyor..." : `Bekleyen ${pendingReports.length} kaydı mühürle`}
            </button>
          ) : null}
          <div className="admin-search-wrap">
            <Search className="admin-search-icon" style={{ width: 15, height: 15 }} />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="No veya hash ara..."
              className="admin-search-input"
            />
            {searchText ? (
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="admin-search-clear"
                aria-label="Aramayı temizle"
              >
                <X style={{ width: 13, height: 13 }} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="admin-proof-table-wrap">
          <table className="admin-proof-table">
            <thead>
              <tr>
                <th>Bildirim No</th>
                <th>Tarih</th>
                <th>IPFS Kimliği</th>
                <th>Denetim Özeti</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => (
                <tr key={report.id}>
                  <td><strong style={{ color: "var(--uc-text)" }}>#{report.id}</strong></td>
                  <td>{new Date(chainTs(report)).toLocaleString("tr-TR")}</td>
                  <td>
                    {report.ipfs?.cid ? (
                      <span className="admin-hash-cell">
                        <HardDrive style={{ width: 13, height: 13 }} />
                        {String(report.ipfs.cid).slice(0, 18)}…
                      </span>
                    ) : (
                      <span className="admin-hash-empty">Beklemede</span>
                    )}
                  </td>
                  <td>
                    {report.proof?.chain_hash ? (
                      <span className="admin-hash-cell">
                        <ShieldCheck style={{ width: 13, height: 13 }} />
                        {String(report.proof.chain_hash).slice(0, 18)}…
                      </span>
                    ) : (
                      <span className="admin-hash-empty">Mühürlenmedi</span>
                    )}
                  </td>
                  <td>
                    {report.ipfs?.cid && report.proof?.chain_hash ? (
                      <span className="admin-pill live" style={{ gap: 5 }}>
                        <CheckCircle2 style={{ width: 11, height: 11 }} /> Doğrulandı
                      </span>
                    ) : (
                      <span className="admin-priority mid" style={{ gap: 5 }}>
                        <Clock style={{ width: 11, height: 11 }} /> Eşitleniyor
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!filteredReports.length ? (
                <tr>
                  <td colSpan={5} className="admin-proof-empty-row">
                    Eşleşen kanıt kaydı bulunamadı.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
