import axios from 'axios';
import { message } from 'antd';
import config from '../config';
import { clearToken, getToken } from '../services/http';

const createAxiosInstance = (baseURL: string) => {
  const axiosInstance = axios.create({
    baseURL,
  });

  axiosInstance.interceptors.request.use((request) => {
    const token = getToken();
    if (token) {
      request.headers.Authorization = `Bearer ${token}`;
    }
    return request;
  });

  axiosInstance.interceptors.response.use(
    (response) => {
      const responseType = response.config.responseType;
      if (responseType === 'blob' || responseType === 'arraybuffer') {
        return response;
      }

      const payload = response.data;
      if (payload && typeof payload === 'object' && 'data' in payload && 'code' in payload) {
        response.data = payload.data;
      }

      return response;
    },
    (error) => {
      if (error?.response?.status === 401) {
        clearToken();
        message.warning('登录已过期，请重新登录');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    },
  );

  return axiosInstance;
};

const axiosInstances = [createAxiosInstance(config.server_url), createAxiosInstance(config.server_url)];

export default axiosInstances;
export { createAxiosInstance };
