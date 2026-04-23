import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Grid,
  Paper,
  Button,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Plot from 'react-plotly.js';
import { analysesAPI } from '../api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`visualization-tabpanel-${index}`}
      aria-labelledby={`visualization-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const AnalysisResultsPage: React.FC = () => {
  const { analysisId } = useParams<{ analysisId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<any>(null);
  const [analysisMethod, setAnalysisMethod] = useState<string>('');
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    loadResults();
  }, [analysisId]);

  const loadResults = async () => {
    if (!analysisId) return;

    try {
      // First get analysis info to determine method
      const analysisResponse = await analysesAPI.getAnalysis(analysisId);
      const method = analysisResponse.data.method;
      setAnalysisMethod(method);

      // Redirect to LIME page if it's a LIME analysis
      if (method === 'lime') {
        navigate(`/analysis/${analysisId}/lime-results`, { replace: true });
        return;
      }

      // Then get results for SHAP
      const response = await analysesAPI.getAnalysisResults(analysisId);
      setResults(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load results:', error);
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const renderImage = (viz: any, altText: string) => {
    if (!viz) return null;

    // Handle base64 images (SHAP native plots)
    if (viz.type === 'image') {
      return (
        <Box sx={{ textAlign: 'center', bgcolor: 'white', p: 2, borderRadius: 1 }}>
          <img
            src={viz.image}
            alt={altText}
            style={{ maxWidth: '100%', height: 'auto' }}
          />
        </Box>
      );
    }

    // Handle Plotly graphs (LIME and old format)
    if (viz.data && viz.layout) {
      return (
        <Box sx={{ textAlign: 'center', bgcolor: 'white', p: 2, borderRadius: 1 }}>
          <Plot
            data={viz.data}
            layout={viz.layout}
            config={{ responsive: true }}
            style={{ width: '100%' }}
          />
        </Box>
      );
    }

    return null;
  };

  const renderMetrics = () => {
    if (!results?.visualizations?.metrics) return null;

    const metrics = results.visualizations.metrics;

    return (
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {Object.entries(metrics).map(([key, value]) => (
          <Grid item xs={12} sm={6} md={4} lg={2.4} key={key}>
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#f5f5f5' }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {key.toUpperCase().replace('_', ' ')}
              </Typography>
              <Typography variant="h5" color="primary">
                {(value as number).toFixed(4)}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    );
  };

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!results) {
    return (
      <Container maxWidth="lg">
        <Box sx={{ my: 4 }}>
          <Alert severity="error">Failed to load analysis results</Alert>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box sx={{ my: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/analysis')}
            sx={{ mr: 2 }}
          >
            Back to Analysis
          </Button>
          <Typography variant="h4">
            Analysis Results
          </Typography>
        </Box>

        {renderMetrics()}

        <Card>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={handleTabChange} variant="scrollable" scrollButtons="auto">
              {analysisMethod === 'shap' ? (
                <>
                  <Tab label="Summary Plot" />
                  <Tab label="Feature Importance" />
                  <Tab label="Dependence Plot" />
                  <Tab label="Waterfall Plot" />
                  <Tab label="Confusion Matrix" />
                </>
              ) : (
                <>
                  <Tab label="Feature Importance" />
                  <Tab label="Confusion Matrix" />
                </>
              )}
            </Tabs>
          </Box>

          {analysisMethod === 'shap' ? (
            <>
              <TabPanel value={tabValue} index={0}>
                <Typography variant="h6" gutterBottom>
                  SHAP Summary Plot
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Shows the distribution of SHAP values for each feature. Each dot represents a sample, colored by feature value (red=high, blue=low).
                </Typography>
                {renderImage(results.visualizations?.shap_summary_plot, 'SHAP Summary Plot')}
              </TabPanel>

              <TabPanel value={tabValue} index={1}>
                <Typography variant="h6" gutterBottom>
                  Feature Importance
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Shows the mean absolute SHAP value for each feature, indicating global feature importance.
                </Typography>
                {renderImage(results.visualizations?.feature_importance_bar, 'Feature Importance')}
              </TabPanel>

              <TabPanel value={tabValue} index={2}>
                <Typography variant="h6" gutterBottom>
                  SHAP Dependence Plot
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Shows how the model output varies with a single feature, revealing interactions and non-linear relationships.
                </Typography>
                {renderImage(results.visualizations?.shap_dependence_plot, 'SHAP Dependence Plot')}
              </TabPanel>

              <TabPanel value={tabValue} index={3}>
                <Typography variant="h6" gutterBottom>
                  SHAP Waterfall Plot
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Shows how each feature contributes to push the model output from the base value to the final prediction for a single instance.
                </Typography>
                {renderImage(results.visualizations?.shap_waterfall, 'SHAP Waterfall Plot')}
              </TabPanel>

              <TabPanel value={tabValue} index={4}>
                <Typography variant="h6" gutterBottom>
                  Confusion Matrix
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Shows the model's classification performance across all classes.
                </Typography>
                {renderImage(results.visualizations?.confusion_matrix, 'Confusion Matrix')}
              </TabPanel>
            </>
          ) : (
            <>
              <TabPanel value={tabValue} index={0}>
                <Typography variant="h6" gutterBottom>
                  LIME Feature Importance
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Shows the local feature importance for a single prediction using LIME.
                </Typography>
                {renderImage(results.visualizations?.lime_bar_chart, 'LIME Feature Importance')}
              </TabPanel>

              <TabPanel value={tabValue} index={1}>
                <Typography variant="h6" gutterBottom>
                  Confusion Matrix
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Shows the model's classification performance across all classes.
                </Typography>
                {renderImage(results.visualizations?.confusion_matrix, 'Confusion Matrix')}
              </TabPanel>
            </>
          )}
        </Card>

        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Analysis Summary
            </Typography>
            <Typography variant="body2">
              Method: {analysisMethod?.toUpperCase()}
            </Typography>
            <Typography variant="body2">
              Samples analyzed: {results.num_samples || 'N/A'}
            </Typography>
            <Typography variant="body2">
              Features: {results.num_features || 'N/A'}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Container>
  );
};

export default AnalysisResultsPage;
