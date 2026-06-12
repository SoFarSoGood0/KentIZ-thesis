export const API_BASE = import.meta.env.VITE_URBANCHAIN_API_BASE || "http://127.0.0.1:8000";

const ADMIN_TOKEN_KEY = "urbanchain_admin_token";
const ADMIN_USER_KEY = "urbanchain_admin_user";
const ADMIN_ROLE_KEY = "urbanchain_admin_role";
const ADMIN_REMEMBER_KEY = "urbanchain_admin_remember";
const ADMIN_SAVED_EMAIL_KEY = "urbanchain_admin_saved_email";
const CITIZEN_TOKEN_KEY = "urbanchain_citizen_token";
const CITIZEN_EMAIL_KEY = "urbanchain_citizen_email";
const CITIZEN_NAME_KEY = "urbanchain_citizen_name";
const CITIZEN_ID_KEY = "urbanchain_citizen_id";

export function getStoredAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

export function setStoredAdminSession(token: string, username = "", role = "guest") {
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.setItem(ADMIN_USER_KEY, username);
    localStorage.setItem(ADMIN_ROLE_KEY, role);
    return;
  }
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
  localStorage.removeItem(ADMIN_ROLE_KEY);
}

export function getStoredAdminUser() {
  return localStorage.getItem(ADMIN_USER_KEY) || "";
}

export function getStoredAdminRole() {
  return localStorage.getItem(ADMIN_ROLE_KEY) || "guest";
}

export function clearStoredAdminSession() {
  setStoredAdminSession("");
}

export function getAdminRemembered(): boolean {
  return localStorage.getItem(ADMIN_REMEMBER_KEY) === "1";
}

export function getAdminSavedEmail(): string {
  return localStorage.getItem(ADMIN_SAVED_EMAIL_KEY) || "";
}

export function setAdminRemember(remember: boolean, email: string): void {
  if (remember) {
    localStorage.setItem(ADMIN_REMEMBER_KEY, "1");
    localStorage.setItem(ADMIN_SAVED_EMAIL_KEY, email);
  } else {
    localStorage.removeItem(ADMIN_REMEMBER_KEY);
    localStorage.removeItem(ADMIN_SAVED_EMAIL_KEY);
  }
}

function getAuthHeaders() {
  const token = getStoredAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getStoredCitizenToken() {
  return localStorage.getItem(CITIZEN_TOKEN_KEY) || "";
}

export function getStoredCitizenEmail() {
  return localStorage.getItem(CITIZEN_EMAIL_KEY) || "";
}

export function getStoredCitizenName() {
  return localStorage.getItem(CITIZEN_NAME_KEY) || "";
}

export function getStoredCitizenId() {
  return Number(localStorage.getItem(CITIZEN_ID_KEY) || 0);
}

export function setStoredCitizenSession(session?: { token?: string; user_id?: number; email?: string; full_name?: string }) {
  if (session?.token) {
    localStorage.setItem(CITIZEN_TOKEN_KEY, session.token);
    localStorage.setItem(CITIZEN_ID_KEY, String(session.user_id || 0));
    localStorage.setItem(CITIZEN_EMAIL_KEY, session.email || "");
    localStorage.setItem(CITIZEN_NAME_KEY, session.full_name || "");
    return;
  }
  localStorage.removeItem(CITIZEN_TOKEN_KEY);
  localStorage.removeItem(CITIZEN_ID_KEY);
  localStorage.removeItem(CITIZEN_EMAIL_KEY);
  localStorage.removeItem(CITIZEN_NAME_KEY);
}

export function clearStoredCitizenSession() {
  setStoredCitizenSession();
}

function getCitizenAuthHeaders() {
  const token = getStoredCitizenToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  Object.entries(getAuthHeaders()).forEach(([key, value]) => headers.set(key, value));
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  return response;
}

export async function fetchJson<T>(path: string, init: RequestInit = {}) {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json() as Promise<T>;
}

export async function postJson<T>(path: string, payload: unknown) {
  return fetchJson<T>(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function citizenFetchJson<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  Object.entries(getCitizenAuthHeaders()).forEach(([key, value]) => headers.set(key, value));
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  return response.json() as Promise<T>;
}

export async function patchJson<T>(path: string, payload: unknown) {
  return fetchJson<T>(path, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchBlob(path: string) {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
  const contentDisposition = response.headers.get("Content-Disposition") || "";
  const filename = contentDisposition.match(/filename="([^"]+)"/)?.[1] || "urbanchain_reports.csv";
  return { blob: await response.blob(), filename };
}

async function readApiError(response: Response) {
  const fallback = `Request failed: ${response.status}`;
  const raw = await response.text().catch(() => "");
  if (!raw) return fallback;
  try {
    const payload = JSON.parse(raw);
    if (typeof payload?.detail === "string") return payload.detail;
    if (typeof payload?.message === "string") return payload.message;
    return raw;
  } catch {
    return raw;
  }
}

export type AdminSessionResponse = { token: string; username: string; role: string; expires_at: string };
export type AdminLoginVerificationResponse = {
  status: "verification_required";
  username: string;
  challenge_id: string;
  masked_email: string;
  delivery: string;
  message: string;
  expires_at: string;
  development_code?: string;
};

export async function loginAdmin(username: string, password: string) {
  return fetchJson<AdminLoginVerificationResponse | AdminSessionResponse>("/admin/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function verifyAdminLogin(username: string, challengeId: string, code: string) {
  return fetchJson<AdminSessionResponse>("/admin/verify", {
    method: "POST",
    body: JSON.stringify({ username, challenge_id: challengeId, code }),
  });
}

export async function registerCitizen(fullName: string, email: string, password: string) {
  return citizenFetchJson<{ status: string; email: string; delivery: string; message: string; development_code?: string }>("/citizen/register", {
    method: "POST",
    body: JSON.stringify({ full_name: fullName, email, password }),
  });
}

export async function verifyCitizen(email: string, code: string) {
  return citizenFetchJson<{ token: string; user_id: number; full_name: string; email: string; verified: boolean }>("/citizen/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function loginCitizen(email: string, password: string) {
  return citizenFetchJson<{ token: string; user_id: number; full_name: string; email: string; verified: boolean }>("/citizen/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function requestCitizenPasswordReset(email: string) {
  return citizenFetchJson<{ status: string; email: string; delivery: string; message: string; development_code?: string }>("/citizen/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function confirmCitizenPasswordReset(email: string, code: string, password: string) {
  return citizenFetchJson<{ token: string; user_id: number; full_name: string; email: string; verified: boolean }>("/citizen/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ email, code, password }),
  });
}

export async function getCitizenMe() {
  return citizenFetchJson<{ token: string; user_id: number; full_name: string; email: string; verified: boolean }>("/citizen/me");
}

export async function getCitizenSummary() {
  return citizenFetchJson<any>("/citizen/summary");
}

export async function getCitizenReports(limit = 12) {
  return citizenFetchJson<{ count: number; total: number; reports: any[] }>(`/citizen/reports?limit=${limit}&offset=0`);
}

export async function getCitizenReport(reportId: string | number) {
  return citizenFetchJson<any>(`/citizen/reports/${reportId}`);
}

export async function getAdminMe() {
  return fetchJson<{ username: string; role: string; expires_at: string; province_scope?: string | null; district_scopes?: string[] }>("/admin/me");
}

export async function getPublicSummary() {
  return fetchJson<any>("/public/summary");
}

export async function getPublicReports(limit = 12) {
  return fetchJson<{ count: number; reports: any[] }>(`/public/reports?limit=${limit}`);
}

export async function getPublicReport(reportId: string | number) {
  return fetchJson<any>(`/public/reports/${reportId}`);
}

export async function getAdminSummary() {
  return fetchJson<any>("/admin/summary");
}

export async function getAdminReports(path = "") {
  return fetchJson<any>(path || "/admin/reports");
}

export async function getAdminReportDetail(reportId: string | number) {
  return fetchJson<any>(`/admin/reports/${reportId}`);
}

export async function getAdminNotesHistory(reportId: string | number) {
  return fetchJson<any>(`/admin/reports/${reportId}/notes-history`);
}

export async function updateAdminReportStatus(reportId: string | number, status: string) {
  return patchJson<any>(`/admin/reports/${reportId}/status`, { status });
}

export async function updateAdminAssignment(reportId: string | number, payload: any) {
  return patchJson<any>(`/admin/reports/${reportId}/assignment`, payload);
}

export async function updateAdminNotes(reportId: string | number, notes: string) {
  return patchJson<any>(`/admin/reports/${reportId}/notes`, { notes });
}

export async function uploadAdminAfterPhoto(reportId: string | number, formData: FormData) {
  return fetchJson<any>(`/admin/reports/${reportId}/after-photo`, {
    method: "POST",
    body: formData,
  });
}

export async function pinAdminReportToIpfs(reportId: string | number) {
  return postJson<any>(`/admin/reports/${reportId}/pin-ipfs`, {});
}

export async function sealAdminReportProof(reportId: string | number) {
  return postJson<any>(`/admin/reports/${reportId}/seal-proof`, {});
}

export async function verifyAdminProofChain() {
  return fetchJson<any>("/admin/proof-chain/verify");
}

export async function sealPendingProofChain() {
  return postJson<any>("/admin/proof-chain/seal-pending", {});
}

export async function getAdminAuditLogs(limit = 50) {
  return fetchJson<any>(`/admin/audit-logs?limit=${limit}`);
}

export async function getAdminNotifications(limit = 10) {
  return fetchJson<any>(`/admin/notifications?limit=${limit}`);
}

export async function markAdminNotificationsSeen() {
  return postJson<any>("/admin/notifications/mark-seen", {});
}

export async function predictReport(formData: FormData, query: Record<string, string | number | boolean | undefined> = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  const headers = new Headers();
  Object.entries(getCitizenAuthHeaders()).forEach(([key, value]) => headers.set(key, value));
  const response = await fetch(`${API_BASE}/predict?${params.toString()}`, {
    method: "POST",
    headers,
    body: formData,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((payload && (payload.detail || payload.message)) || `Request failed: ${response.status}`);
  }
  return payload;
}
