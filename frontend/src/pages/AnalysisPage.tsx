import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Button,
  Box,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Card,
  CardContent,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Plot from 'react-plotly.js';
import { modelsAPI, datasetsAPI, analysesAPI } from '../api';

interface Model {
  id: string;
  name: string;
  model_type: string;
}

interface Dataset {
  id: string;
  name: string;
}

const AnalysisPage: React.FC = () => {
  const [models, setModels] = useState<Model[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | ''>('');
  const [selectedDataset, setSelectedDataset] = useState<string | ''>('');
  const [explainerType, setExplainerType] = useState<'shap' | 'lime'>('shap');
  const [loading, setLoading] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    loadModels();
    loadDatasets();
  }, []);

  useEffect(() => {
    if (analysisId && analysisStatus === 'running') {
      const interval = setInterval(() => {
        checkAnalysisStatus();
      }, 3000);

      return () => clearInterval(interval);
    }
  }, [analysisId, analysisStatus]);

  const loadModels = async () => {
    try {
      const response = await modelsAPI.listModels();
      setModels(response.data);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const loadDatasets = async () => {
    try {
      const response = await datasetsAPI.listDatasets();
      setDatasets(response.data);
    } catch (error) {
      console.error('Failed to load datasets:', error);
    }
  };

  const startAnalysis = async () => {
    if (!selectedModel || !selectedDataset) {
      alert('Please select model and dataset');
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const response = await analysesAPI.createAnalysis({
        model_id: selectedModel,
        dataset_id: selectedDataset,
        explainer_type: explainerType,
      });

      setAnalysisId(response.data.id);
      setAnalysisStatus('running');
    } catch (error) {
      console.error('Failed to start analysis:', error);
      alert('Failed to start analysis');
      setLoading(false);
    }
  };

  const checkAnalysisStatus = async () => {
    if (!analysisId) return;

    try {
      const response = await analysesAPI.getAnalysisStatus(analysisId);
      const status = response.data.status;
      setAnalysisStatus(status);

      if (status === 'completed') {
        loadResults();
      } else if (status === 'failed') {
        alert('Analysis failed');
        setLoading(false);
      }
    } catch (error) {
      console.error('Failed to check status:', error);
    }
  };

  const loadResults = async () => {
    if (!analysisId) return;

    try {
      const response = await analysesAPI.getAnalysisResults(analysisId);
      const downloadUrl = response.data.download_url;

      // Fetch results from S3
      const resultsResponse = await fetch(downloadUrl);
      const resultsData = await resultsResponse.json();

      setResults(resultsData);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load results:', error);
      setLoading(false);
    }
  };

  const renderFeatureImportance = () => {
    if (!results) return null;

    const importance = explainerType === 'shap'
      ? results.global_importance?.feature_importance
      : results.instance_explanations?.[0]?.explanation?.feature_importance;

    if (!importance) return null;

    const features = Object.keys(importance);
    const values = Object.values(importance) as number[];

    return (
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Feature Importance
          </Typography>
          <Plot
            data={[
              {
                type: 'bar',
                x: values,
                y: features,
                orientation: 'h',
                marker: { color: '#1976d2' },
              },
            ]}
            layout={{
              title: { text: `${explainerType.toUpperCase()} Feature Importance` },
              xaxis: { title: { text: 'Importance' } },
              yaxis: { title: { text: 'Features' } },
              height: 400,
              margin: { l: 150 },
            }}
            config={{ responsive: true }}
            style={{ width: '100%' }}
          />
        </CardContent>
      </Card>
    );
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" gutterBottom>
          Model Analysis
        </Typography>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Select Model</InputLabel>
              <Select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as string)}
              >
                {models.map((model) => (
                  <MenuItem key={model.id} value={model.id}>
                    {model.name} ({model.model_type})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Select Dataset</InputLabel>
              <Select
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value as string)}
              >
                {datasets.map((dataset) => (
                  <MenuItem key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Explainer Type</InputLabel>
              <Select
                value={explainerType}
                onChange={(e) => setExplainerType(e.target.value as 'shap' | 'lime')}
              >
                <MenuItem value="shap">SHAP</MenuItem>
                <MenuItem value="lime">LIME</MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={startAnalysis}
              disabled={loading || !selectedModel || !selectedDataset}
            >
              Start Analysis
            </Button>
          </Box>
        </Paper>

        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <CircularProgress />
            <Typography>
              Analysis in progress... Status: {analysisStatus}
            </Typography>
          </Box>
        )}

        {results && (
          <Box>
            <Alert severity="success" sx={{ mb: 3 }}>
              Analysis completed successfully!
            </Alert>

            {renderFeatureImportance()}

            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Analysis Summary
                </Typography>
                <Typography variant="body2">
                  Samples analyzed: {results.num_samples || 'N/A'}
                </Typography>
                <Typography variant="body2">
                  Features: {results.num_features || 'N/A'}
                </Typography>
                <Typography variant="body2">
                  Explainer: {explainerType.toUpperCase()}
                </Typography>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>
    </Container>
  );
};

export default AnalysisPage;
