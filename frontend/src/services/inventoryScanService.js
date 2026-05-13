import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const inventoryScanService = {
    async uploadAndScan(file) {
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await axios.post(`${API_URL}/scan/inventory/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
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

    async deleteScan(id) {
        const response = await axios.delete(`${API_URL}/scan/inventory/${id}`);
        return response.data;
    },

    exportCSV() {
        window.open(`${API_URL}/scan/inventory/export`, '_blank');
    }
};

export default inventoryScanService;