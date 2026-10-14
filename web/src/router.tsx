import { createBrowserRouter } from "react-router";
import { LoginPage } from "./features/auth/LoginPage";
import { NotFoundPage, RouteError } from "./features/NotFoundPage";
import { HomePage } from "./features/public/HomePage";
import { PublicLayout } from "./features/public/PublicLayout";
import { VerifyPage } from "./features/public/VerifyPage";
import { StudioLayout } from "./features/studio/StudioLayout";

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      // QR codes encode an upper-case URL (/V/ID); route matching ignores case.
      { path: "v/:id", element: <VerifyPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    path: "studio",
    element: <StudioLayout />,
    errorElement: <RouteError />,
    // Studio screens load on demand; render nothing while the first one arrives.
    hydrateFallbackElement: <div aria-busy="true" />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import("./features/studio/RegisterPage")).RegisterPage }) },
      // The signing workspace pulls in pdf.js and pdf-lib, so it loads on demand.
      { path: "sign", lazy: async () => ({ Component: (await import("./features/studio/SignPage")).SignPage }) },
      { path: "settings", lazy: async () => ({ Component: (await import("./features/studio/SettingsPage")).SettingsPage }) },
    ],
  },
]);
