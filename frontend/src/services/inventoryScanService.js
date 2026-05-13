import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const inventoryScanService = {
    async uploadAndScan(file) {
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await axios.post(`${API_URL}/scan/inventory/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 180000
        });
        
        return response.data;
    },

    async getHistory(limit = 50, offset = 0) {
        const response = await axios.get(`${API_URL}/scan/inventory/history`, {
            params: { limit, offset }
        });
        return response.data;
    },

    async getStats() {
        const response = await axios.get(`${API_URL}/scan/inventory/stats`);
        return response.data;
    },

    async getCodeConfigs() {
        const response = await axios.get(`${API_URL}/scan/inventory/config`);
        return response.data;
    },

    async updateCodeConfig(id, data) {
        const response = await axios.put(`${API_URL}/scan/inventory/config/${id}`, data);
        return response.data;
    },

    async toggleCodeConfig(id, isActive) {
        const response = await axios.patch(`${API_URL}/scan/inventory/config/${id}/toggle`, { isActive });
        return response.data;
    },

    async checkOllamaStatus() {
        const response = await axios.get(`${API_URL}/scan/inventory/status/ollama`);
        return response.data;
    },

    async deleteScan(id) {
        const response = await axios.delete(`${API_URL}/scan/inventory/${id}`);
        return response.data;
    },

    async getLearningStatus() {
        const response = await axios.get(`${API_URL}/scan/inventory/learn/status`);
        return response.data;
    },

    async learnCodes(codes) {
        const response = await axios.post(`${API_URL}/scan/inventory/learn`, { codes });
        return response.data;
    },

    async clearLearning() {
        const response = await axios.delete(`${API_URL}/scan/inventory/learn`);
        return response.data;
    },

    exportCSV() {
        window.open(`${API_URL}/scan/inventory/export`, '_blank');
    }
};

export default inventoryScanService;