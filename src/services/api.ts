import axios from 'axios';
import { API } from '../utils/constant';

const baseURL = API;
const axiosInstance = axios.create({
  baseURL: `${baseURL}`,
});

export const AuthAPI = {
  registerDeviceToken: async (data: { userId: string; deviceToken: string }) => {
    try {
      const response = await axiosInstance.post('/api/device-tokens/register', data);
      return response.data;
    } catch (error) {
      console.error('Error registering device token:', error);
      throw error;
    }
  },

  removeDeviceToken: async (data: { userId: string; deviceToken: string }) => {
    try {
      const response = await axiosInstance.post('/api/device-tokens/remove', data);
      return response.data;
    } catch (error) {
      console.error('Error removing device token:', error);
      throw error;
    }
  }
}; 