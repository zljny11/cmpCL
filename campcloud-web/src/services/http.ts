import axios from 'axios';
import { appConfig } from '../app/config/env';

const TOKEN_KEY = 'campcloud_token';

export const http = axios.create({
  baseURL: appConfig.apiBaseUrl,
  timeout: 15000,
});

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use((response) => response.data, (error) => Promise.reject(error));
