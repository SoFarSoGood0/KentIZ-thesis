import { createBrowserRouter } from "react-router";
import { CitizenLayout } from "./components/CitizenLayout";
import { AdminLayout } from "./components/AdminLayout";
import { CitizenHome } from "./pages/CitizenHome";
import { CitizenReports } from "./pages/CitizenReports";
import { CitizenUpload } from "./pages/CitizenUpload";
import { CitizenResult } from "./pages/CitizenResult";
import { AdminLogin } from "./pages/AdminLogin";
import { AdminDashboard } from "./pages/AdminDashboard";
import { AdminReportDetail } from "./pages/AdminReportDetail";
import { AdminFieldTeams } from "./pages/AdminFieldTeams";
import { AdminVerification } from "./pages/AdminVerification";
import { AdminReports } from "./pages/AdminReports";
import { AdminSettings } from "./pages/AdminSettings";
import { AdminMap } from "./pages/AdminMap";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: CitizenLayout,
    children: [
      { index: true, Component: CitizenHome },
      { path: "reports", Component: CitizenReports },
      { path: "upload", Component: CitizenUpload },
      { path: "report/:id", Component: CitizenResult },
    ],
  },
  {
    path: "/admin/login",
    Component: AdminLogin,
  },
  {
    path: "/admin",
    Component: AdminLayout,
    children: [
      { index: true, Component: AdminDashboard },
      { path: "reports", Component: AdminReports },
      { path: "reports/:id", Component: AdminReportDetail },
      { path: "map", Component: AdminMap },
      { path: "teams", Component: AdminFieldTeams },
      { path: "verification", Component: AdminVerification },
      { path: "settings", Component: AdminSettings },
    ],
  },
]);
