import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const scanService = {
    async uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await axios.post(`${API_URL}/scan/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000
        });
        
        return response.data;
    },

    async processScan(scanId) {
        const response = await axios.post(`${API_URL}/scan/process/${scanId}`, {}, {
            timeout: 120000
        });
        
        return response.data;
    },

    async getScan(scanId) {
        const response = await axios.get(`${API_URL}/scan/scan/${scanId}`, {
            timeout: 10000
        });
        
        return response.data;
    },

    async updateScan(scanId, data) {
        const response = await axios.put(`${API_URL}/scan/scan/${scanId}`, data, {
            timeout: 10000
        });
        
        return response.data;
    },

    async validateScan(scanId) {
        const response = await axios.post(`${API_URL}/scan/scan/${scanId}/validate`, {}, {
            timeout: 10000
        });
        
        return response.data;
    },

    async getHistory(limit = 50, offset = 0, status = null) {
        const params = { limit, offset };
        if (status) params.status = status;
        
        const response = await axios.get(`${API_URL}/scan/history`, {
            params,
            timeout: 10000
        });
        
        return response.data;
    }
};

export default scanService;