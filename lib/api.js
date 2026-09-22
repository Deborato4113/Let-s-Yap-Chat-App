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

export default api;
