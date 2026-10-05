import axios, { type AxiosRequestConfig } from 'axios';

/**
 * Instancia de Axios preconfigurada para el backend.
 * Agrega automáticamente el token JWT de localStorage.
 */
export const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// -- Interceptor de request: agrega el token JWT ------------
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const clearSessionAndGoToLogin = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/auth/login';
};

// Si varias peticiones reciben 401 a la vez, comparten una sola llamada a
// /auth/refresh (cada refresh token sirve una vez: el backend lo rota).
let refreshPromise: Promise<string> | null = null;

const refreshAccessToken = (): Promise<string> => {
  if (!refreshPromise) {
    const refreshToken = localStorage.getItem('refreshToken');
    refreshPromise = (refreshToken
      ? axios.post('/api/v1/auth/refresh', { refreshToken })
      : Promise.reject(new Error('Sin refresh token'))
    )
      .then((res) => {
        const { accessToken, refreshToken: newRefreshToken, user } = res.data;
        localStorage.setItem('token', accessToken);
        localStorage.setItem('refreshToken', newRefreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        return accessToken as string;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// -- Interceptor de response: maneja errores 401 ------------
// El access token dura poco (JWT_ACCESS_EXPIRES_IN, 15 min por defecto): al
// vencer, se pide un par nuevo con el refresh token y se reintenta la petición
// una vez. Solo si eso falla se cierra la sesión.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;

    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      try {
        const newToken = await refreshAccessToken();
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return apiClient(original);
      } catch {
        clearSessionAndGoToLogin();
      }
    } else if (error.response?.status === 401) {
      clearSessionAndGoToLogin();
    }
    return Promise.reject(error);
  },
);
