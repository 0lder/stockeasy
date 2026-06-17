import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { CustomThemeProvider } from "./ThemeContext";
import { AuthProvider } from "./AuthContext";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <CustomThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </CustomThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
