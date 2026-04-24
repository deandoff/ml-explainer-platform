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

  getModel: (id: string) =>
    api.get(`/api/models/${id}`),

  deleteModel: (id: string) =>
    api.delete(`/api/models/${id}`),

  downloadModel: (id: string) =>
    api.get(`/api/models/${id}/download`),
};

// Datasets API
export const datasetsAPI = {
  getUploadUrl: () =>
    api.post('/api/datasets/upload-url'),

  createDataset: (data: any) =>
    api.post('/api/datasets/', data),

  listDatasets: () =>
    api.get('/api/datasets/'),

  getDataset: (id: string) =>
    api.get(`/api/datasets/${id}`),

  deleteDataset: (id: string) =>
    api.delete(`/api/datasets/${id}`),

  downloadDataset: (id: string) =>
    api.get(`/api/datasets/${id}/download`),
};

// Analyses API
export const analysesAPI = {
  createAnalysis: (data: any) =>
    api.post('/api/analyses/', data),

  getAnalysis: (id: string) =>
    api.get(`/api/analyses/${id}`),

  getAnalysisStatus: (id: string) =>
    api.get(`/api/analyses/${id}/status`),

  getAnalysisResults: (id: string) =>
    api.get(`/api/analyses/${id}/results`),

  listAnalyses: () =>
    api.get('/api/analyses/'),
};

// SHAP Interactive API
export const shapInteractiveAPI = {
  getInteractiveData: (id: string, params?: URLSearchParams) =>
    api.get(`/api/shap/${id}/interactive-data${params ? '?' + params.toString() : ''}`),

  getLocalExplanation: (analysisId: string, sampleId: number) =>
    api.get(`/api/shap/${analysisId}/local-explanation/${sampleId}`),

  getFeatureStats: (analysisId: string, featureName: string) =>
    api.get(`/api/shap/${analysisId}/feature-stats/${featureName}`),

  compareSamples: (analysisId: string, sampleIds: number[]) =>
    api.get(`/api/shap/${analysisId}/comparison?sample_ids=${sampleIds.join(',')}`),
};

// What-If Analysis API
export const whatIfAPI = {
  analyze: (analysisId: string, sampleId: number, modifiedFeatures: Record<string, number>) =>
    api.post(`/api/whatif/${analysisId}/what-if`, {
      sample_id: sampleId,
      modified_features: modifiedFeatures
    })
};

export default api;
