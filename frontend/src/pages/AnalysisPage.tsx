import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  TablePagination,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import VisibilityIcon from '@mui/icons-material/Visibility';
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

interface Analysis {
  id: string;
  model_id: string;
  dataset_id: string;
  method: string;
  status: string;
  created_at: string;
  completed_at?: string;
}

const AnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const [models, setModels] = useState<Model[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | ''>('');
  const [selectedDataset, setSelectedDataset] = useState<string | ''>('');
  const [explainerType, setExplainerType] = useState<'shap' | 'lime'>('shap');
  const [loading, setLoading] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [results, setResults] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(20);

  useEffect(() => {
    loadModels();
    loadDatasets();
    loadAnalyses();
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

  const loadAnalyses = async () => {
    try {
      const response = await analysesAPI.listAnalyses();
      // Sort by created_at descending (newest first)
      const sortedAnalyses = response.data.sort((a: Analysis, b: Analysis) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setAnalyses(sortedAnalyses);
    } catch (error) {
      console.error('Failed to load analyses:', error);
    }
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const paginatedAnalyses = analyses.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

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
      loadAnalyses(); // Refresh list
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
      // Redirect to results page
      navigate(`/analysis/${analysisId}/results`);
      loadAnalyses(); // Refresh list
    } catch (error) {
      console.error('Failed to load results:', error);
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'success';
      case 'running':
        return 'info';
      case 'failed':
        return 'error';
      case 'pending':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getModelName = (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    return model ? model.name : modelId;
  };

  const getDatasetName = (datasetId: string) => {
    const dataset = datasets.find(d => d.id === datasetId);
    return dataset ? dataset.name : datasetId;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const renderFeatureImportance = () => {
    if (!results) return null;

    // Check if we have pre-generated visualizations from backend
    if (results.visualizations) {
      if (explainerType === 'shap' && results.visualizations.shap_summary_plot) {
        const viz = results.visualizations.shap_summary_plot;

        // Check if it's a native SHAP plot (base64 image)
        if (viz.type === 'image') {
          return (
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {viz.title || 'SHAP Summary Plot'}
                </Typography>
                <Box sx={{ textAlign: 'center' }}>
                  <img
                    src={viz.image}
                    alt="SHAP Summary Plot"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </Box>
              </CardContent>
            </Card>
          );
        }

        // Fallback to Plotly if it's the old format
        return (
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                SHAP Summary Plot
              </Typography>
              <Plot
                data={viz.data}
                layout={viz.layout}
                config={{ responsive: true }}
                style={{ width: '100%' }}
              />
            </CardContent>
          </Card>
        );
      }

      // Check for feature_importance_bar (native SHAP bar plot)
      if (explainerType === 'shap' && results.visualizations.feature_importance_bar) {
        const viz = results.visualizations.feature_importance_bar;

        if (viz.type === 'image') {
          return (
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {viz.title || 'Feature Importance'}
                </Typography>
                <Box sx={{ textAlign: 'center' }}>
                  <img
                    src={viz.image}
                    alt="Feature Importance"
                    style={{ maxWidth: '100%', height: 'auto' }}
                  />
                </Box>
              </CardContent>
            </Card>
          );
        }
      }

      if (explainerType === 'lime' && results.visualizations.lime_bar_chart) {
        return (
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                LIME Feature Importance
              </Typography>
              <Plot
                data={results.visualizations.lime_bar_chart.data}
                layout={results.visualizations.lime_bar_chart.layout}
                config={{ responsive: true }}
                style={{ width: '100%' }}
              />
            </CardContent>
          </Card>
        );
      }
    }

    // Fallback to old visualization if no pre-generated viz available
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

  const renderConfusionMatrix = () => {
    if (!results?.visualizations?.confusion_matrix) return null;

    return (
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Confusion Matrix
          </Typography>
          <Plot
            data={results.visualizations.confusion_matrix.data}
            layout={results.visualizations.confusion_matrix.layout}
            config={{ responsive: true }}
            style={{ width: '100%' }}
          />
        </CardContent>
      </Card>
    );
  };

  const renderMetrics = () => {
    if (!results?.visualizations?.metrics) return null;

    const metrics = results.visualizations.metrics;

    return (
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Model Performance Metrics
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mt: 2 }}>
            {Object.entries(metrics).map(([key, value]) => (
              <Paper key={key} sx={{ p: 2, textAlign: 'center', bgcolor: '#f5f5f5' }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {key.toUpperCase().replace('_', ' ')}
                </Typography>
                <Typography variant="h5" color="primary">
                  {(value as number).toFixed(4)}
                </Typography>
              </Paper>
            ))}
          </Box>
        </CardContent>
      </Card>
    );
  };

  const renderDependencePlot = () => {
    if (!results?.visualizations?.shap_dependence_plot) return null;

    const viz = results.visualizations.shap_dependence_plot;

    // Check if it's a native SHAP plot (base64 image)
    if (viz.type === 'image') {
      return (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {viz.title || 'SHAP Dependence Plot'}
            </Typography>
            <Box sx={{ textAlign: 'center' }}>
              <img
                src={viz.image}
                alt="SHAP Dependence Plot"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </Box>
          </CardContent>
        </Card>
      );
    }

    // Fallback to Plotly
    return (
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            SHAP Dependence Plot
          </Typography>
          <Plot
            data={viz.data}
            layout={viz.layout}
            config={{ responsive: true }}
            style={{ width: '100%' }}
          />
        </CardContent>
      </Card>
    );
  };

  const renderWaterfallPlot = () => {
    if (!results?.visualizations?.shap_waterfall) return null;

    const viz = results.visualizations.shap_waterfall;

    // Check if it's a native SHAP plot (base64 image)
    if (viz.type === 'image') {
      return (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {viz.title || 'SHAP Waterfall Plot'}
            </Typography>
            <Box sx={{ textAlign: 'center' }}>
              <img
                src={viz.image}
                alt="SHAP Waterfall Plot"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
            </Box>
          </CardContent>
        </Card>
      );
    }

    // Fallback to Plotly
    return (
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            SHAP Waterfall Plot
          </Typography>
          <Plot
            data={viz.data}
            layout={viz.layout}
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

            {renderMetrics()}
            {renderFeatureImportance()}
            {renderDependencePlot()}
            {renderWaterfallPlot()}
            {renderConfusionMatrix()}

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

      {/* Previous Analyses List */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Previous Analyses
        </Typography>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Model</TableCell>
                <TableCell>Dataset</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {analyses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No analyses yet
                  </TableCell>
                </TableRow>
              ) : (
                paginatedAnalyses.map((analysis) => (
                  <TableRow key={analysis.id}>
                    <TableCell>{getModelName(analysis.model_id)}</TableCell>
                    <TableCell>{getDatasetName(analysis.dataset_id)}</TableCell>
                    <TableCell>
                      <Chip
                        label={analysis.method.toUpperCase()}
                        size="small"
                        color={analysis.method === 'shap' ? 'primary' : 'secondary'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={analysis.status}
                        size="small"
                        color={getStatusColor(analysis.status) as any}
                      />
                    </TableCell>
                    <TableCell>{formatDate(analysis.created_at)}</TableCell>
                    <TableCell>
                      {analysis.status === 'completed' && (
                        <IconButton
                          color="primary"
                          onClick={() => navigate(`/analysis/${analysis.id}/results`)}
                          size="small"
                        >
                          <VisibilityIcon />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={analyses.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[20]}
          />
        </TableContainer>
      </Box>
    </Container>
  );
};

export default AnalysisPage;
