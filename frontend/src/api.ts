import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Models API
export const modelsAPI = {
  getUploadUrl: (modelType: string) =>
    api.post('/api/models/upload-url', null, { params: { model_type: modelType } }),

  createModel: (data: any) =>
    api.post('/api/models/', data),

  listModels: () =>
    api.get('/api/models/'),

  getModel: (id: number) =>
    api.get(`/api/models/${id}`),

  deleteModel: (id: number) =>
    api.delete(`/api/models/${id}`),
};

// Datasets API
export const datasetsAPI = {
  getUploadUrl: () =>
    api.post('/api/datasets/upload-url'),

  createDataset: (data: any) =>
    api.post('/api/datasets/', data),

  listDatasets: () =>
    api.get('/api/datasets/'),

  getDataset: (id: number) =>
    api.get(`/api/datasets/${id}`),

  deleteDataset: (id: number) =>
    api.delete(`/api/datasets/${id}`),
};

// Analyses API
export const analysesAPI = {
  createAnalysis: (data: any) =>
    api.post('/api/analyses/', data),

  getAnalysis: (id: number) =>
    api.get(`/api/analyses/${id}`),

  getAnalysisStatus: (id: number) =>
    api.get(`/api/analyses/${id}/status`),

  getAnalysisResults: (id: number) =>
    api.get(`/api/analyses/${id}/results`),

  listAnalyses: () =>
    api.get('/api/analyses/'),
};

export default api;
