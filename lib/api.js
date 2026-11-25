import axios from "axios";

// same-origin now that frontend and backend are one Next.js app
const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("yap_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 on a normal API call means the saved login token is no longer valid
// (expired, the user/database changed, or the server's JWT secret changed).
// Instead of leaving the app half-broken with unhandled errors, clear the
// stale token and send the person to the login page.
let redirectingToLogin = false;
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || "";
    if (status === 401 && typeof window !== "undefined" && !url.startsWith("/auth/") && !redirectingToLogin) {
      redirectingToLogin = true;
      try {
        localStorage.removeItem("yap_token");
      } catch {
        /* ignore */
      }
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
