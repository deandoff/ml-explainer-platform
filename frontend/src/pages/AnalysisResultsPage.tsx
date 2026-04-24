import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Grid,
  Paper,
  Button,
  Chip
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FilterListIcon from '@mui/icons-material/FilterList';
import { analysesAPI, shapInteractiveAPI } from '../api';
import InteractiveSummaryPlot from '../components/shap/InteractiveSummaryPlot';
import LocalExplanationPanel from '../components/shap/LocalExplanationPanel';
import InlineDependencePlot from '../components/shap/InlineDependencePlot';
import FilterPanel from '../components/shap/FilterPanel';
import ComparisonView from '../components/shap/ComparisonView';

interface SHAPData {
  points: Array<{
    sample_id: number;
    prediction: number;
    features: Record<string, {
      value: number;
      shap_value: number;
      abs_shap: number;
    }>;
  }>;
  feature_importance: Record<string, {
    mean_abs_shap: number;
    max_abs_shap: number;
    variance: number;
  }>;
  base_value: number;
  feature_names: string[];
  n_samples: number;
  n_features: number;
  summary_stats: {
    prediction_mean: number;
    prediction_std: number;
    prediction_min: number;
    prediction_max: number;
    shap_range?: {
      min: number;
      max: number;
    };
  };
}

const AnalysisResultsPage: React.FC = () => {
  const { analysisId } = useParams<{ analysisId: string }>();
  const navigate = useNavigate();

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shapData, setShapData] = useState<SHAPData | null>(null);
  const [selectedSample, setSelectedSample] = useState<number | null>(null);
  const [comparisonSamples, setComparisonSamples] = useState<number[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [dependencePlotOpen, setDependencePlotOpen] = useState(false);
  const [filteredData, setFilteredData] = useState<SHAPData | null>(null);
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  const loadAnalysis = useCallback(async () => {
    if (!analysisId) return;

    setLoading(true);
    setError(null);

    try {
      // Get analysis info
      const analysisResponse = await analysesAPI.getAnalysis(analysisId);
      const method = analysisResponse.data.method;

      // Redirect to LIME page if it's LIME
      if (method === 'lime') {
        navigate(`/analysis/${analysisId}/lime-results`, { replace: true });
        return;
      }

      // Load interactive SHAP data
      if (method === 'shap') {
        const shapResponse = await shapInteractiveAPI.getInteractiveData(analysisId);
        setShapData(shapResponse.data);
      }
    } catch (err: any) {
      console.error('Failed to load analysis:', err);
      setError(err.response?.data?.detail || 'Failed to load analysis');
    } finally {
      setLoading(false);
    }
  }, [analysisId, navigate]);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  // Event handlers
  const handlePointClick = useCallback((sampleId: number) => {
    setSelectedSample(sampleId);

    // Smooth scroll to local explanation
    setTimeout(() => {
      const element = document.getElementById('local-explanation-section');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, []);

  const handleAddToComparison = useCallback((sampleId: number) => {
    setComparisonSamples(prev =>
      prev.includes(sampleId)
        ? prev.filter(id => id !== sampleId)
        : [...prev, sampleId].slice(-4)
    );
  }, []);

  const handleCloseLocalExplanation = useCallback(() => {
    setSelectedSample(null);
  }, []);

  const handleFeatureClick = useCallback((featureName: string) => {
    setSelectedFeature(featureName);
    setDependencePlotOpen(true);

    // Smooth scroll to dependence plot
    setTimeout(() => {
      const element = document.getElementById('dependence-plot-section');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, []);

  const handleCloseDependencePlot = useCallback(() => {
    setDependencePlotOpen(false);
    setSelectedFeature(null);
  }, []);

  const handleFilterChange = useCallback(async (filters: any) => {
    if (!analysisId) return;

    setLoading(true);
    try {
      // Build query params
      const params = new URLSearchParams();

      // Check if filters are actually different from defaults
      const hasShapFilter = filters.shapRange && shapData && (
        filters.shapRange[0] !== shapData.summary_stats.shap_range?.min ||
        filters.shapRange[1] !== shapData.summary_stats.shap_range?.max
      );

      const hasPredictionFilter = filters.predictionRange && shapData && (
        filters.predictionRange[0] !== shapData.summary_stats.prediction_min ||
        filters.predictionRange[1] !== shapData.summary_stats.prediction_max
      );

      // SHAP range filter
      if (hasShapFilter) {
        params.append('shap_range_min', filters.shapRange[0].toString());
        params.append('shap_range_max', filters.shapRange[1].toString());
      }

      // Prediction range filter
      if (hasPredictionFilter) {
        params.append('prediction_range_min', filters.predictionRange[0].toString());
        params.append('prediction_range_max', filters.predictionRange[1].toString());
      }

      // Feature value filters
      if (filters.featureFilters && Object.keys(filters.featureFilters).length > 0) {
        params.append('feature_value_filters', JSON.stringify(filters.featureFilters));
      }

      // Load filtered data (or reset to original if no filters)
      if (params.toString()) {
        const response = await shapInteractiveAPI.getInteractiveData(analysisId, params);
        setFilteredData(response.data);
      } else {
        setFilteredData(null);
      }

      // Count active filters
      let count = 0;
      if (hasShapFilter) count++;
      if (hasPredictionFilter) count++;
      if (Object.keys(filters.featureFilters || {}).length > 0) {
        count += Object.keys(filters.featureFilters).length;
      }
      if (filters.showOutliers) count++;
      if (filters.showHighConfidence) count++;
      if (filters.showLowConfidence) count++;

      setActiveFiltersCount(count);
    } catch (error) {
      console.error('Failed to apply filters:', error);
    } finally {
      setLoading(false);
    }
  }, [analysisId, shapData]);

  // Use filtered data if available, otherwise use original
  const displayData = filteredData || shapData;

  // Render loading
  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  // Render error
  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/analysis')}>
          Back to Analysis
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Interactive Analysis Results
          </Typography>
          {shapData && (
            <Typography variant="body2" color="text.secondary">
              {shapData.n_samples} samples • {shapData.n_features} features • Method: SHAP
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={() => setFilterOpen(!filterOpen)}
            color={activeFiltersCount > 0 ? 'primary' : 'inherit'}
          >
            Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
          </Button>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/analysis')}
          >
            Back
          </Button>
        </Box>
      </Box>

      {/* Filter Panel (collapsible) */}
      <FilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        shapData={shapData}
        onFilterChange={handleFilterChange}
        activeFiltersCount={activeFiltersCount}
      />

      {/* Summary Stats */}
      {displayData && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'rgba(76, 175, 80, 0.08)' }}>
              <Typography variant="body2" color="text.secondary">Base Value</Typography>
              <Typography variant="h6" color="success.main">
                {displayData.base_value.toFixed(4)}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Mean Prediction</Typography>
              <Typography variant="h6">
                {displayData.summary_stats.prediction_mean.toFixed(4)}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Prediction Range</Typography>
              <Typography variant="h6">
                {displayData.summary_stats.prediction_min.toFixed(2)} - {displayData.summary_stats.prediction_max.toFixed(2)}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: activeFiltersCount > 0 ? 'rgba(25, 118, 210, 0.08)' : 'white' }}>
              <Typography variant="body2" color="text.secondary">
                {activeFiltersCount > 0 ? 'Filtered Samples' : 'Total Samples'}
              </Typography>
              <Typography variant="h6" color={activeFiltersCount > 0 ? 'primary.main' : 'inherit'}>
                {displayData.n_samples} {shapData && activeFiltersCount > 0 && `/ ${shapData.n_samples}`}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Main Content: Interactive Summary Plot + Feature Importance */}
      <Grid container spacing={3}>
        {/* Interactive Summary Plot */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, height: '750px', overflow: 'hidden' }}>
            <Typography variant="h6" gutterBottom>
              Interactive SHAP Summary Plot
            </Typography>
            <Typography variant="caption" color="text.secondary" paragraph>
              Click any point to see detailed explanation • Shift+Click to compare samples
            </Typography>
            <Box sx={{ height: 'calc(100% - 80px)', width: '100%' }}>
              <InteractiveSummaryPlot
                data={shapData}
                onPointClick={handlePointClick}
                onFeatureClick={handleFeatureClick}
                selectedSamples={comparisonSamples}
                onAddToComparison={handleAddToComparison}
                selectedFeature={selectedFeature}
                maxFeatures={20}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Feature Importance Sidebar */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: '750px', overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              Feature Importance
            </Typography>
            <Typography variant="caption" color="text.secondary" paragraph>
              Ranked by mean absolute SHAP value
            </Typography>

            {displayData && Object.entries(displayData.feature_importance)
              .sort((a, b) => b[1].mean_abs_shap - a[1].mean_abs_shap)
              .slice(0, 20)
              .map(([feature, importance], idx) => (
                <Box
                  key={feature}
                  onClick={() => handleFeatureClick(feature)}
                  sx={{
                    mb: 2,
                    p: 1.5,
                    bgcolor: selectedFeature === feature
                      ? 'rgba(25, 118, 210, 0.15)'
                      : idx < 3 ? 'rgba(25, 118, 210, 0.08)' : 'rgba(0,0,0,0.02)',
                    borderRadius: 1,
                    cursor: 'pointer',
                    border: selectedFeature === feature ? '2px solid' : '2px solid transparent',
                    borderColor: 'primary.main',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: 'rgba(25, 118, 210, 0.12)',
                      transform: 'translateX(4px)'
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {idx + 1}. {feature}
                    </Typography>
                    {idx < 3 && (
                      <Chip label="Top" size="small" color="primary" sx={{ height: 20 }} />
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Mean |SHAP|: {importance.mean_abs_shap.toFixed(4)}
                  </Typography>
                  <Box sx={{ mt: 0.5, height: 4, bgcolor: 'rgba(0,0,0,0.1)', borderRadius: 1 }}>
                    <Box
                      sx={{
                        height: '100%',
                        width: `${(importance.mean_abs_shap / Object.values(displayData.feature_importance)[0].mean_abs_shap) * 100}%`,
                        bgcolor: 'primary.main',
                        borderRadius: 1,
                        transition: 'width 0.3s ease-out'
                      }}
                    />
                  </Box>
                </Box>
              ))}
          </Paper>
        </Grid>
      </Grid>

      {/* Inline Dependence Plot (appears when feature clicked) */}
      {dependencePlotOpen && selectedFeature && displayData && analysisId && (
        <Box id="dependence-plot-section" sx={{ mt: 3 }}>
          <InlineDependencePlot
            analysisId={analysisId}
            featureName={selectedFeature}
            shapData={displayData}
            onClose={handleCloseDependencePlot}
            onPointClick={handlePointClick}
            selectedSamples={comparisonSamples}
          />
        </Box>
      )}

      {/* Comparison Bar (bottom, appears when samples selected) */}
      {comparisonSamples.length > 0 && (
        <Paper
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            p: 2,
            bgcolor: 'rgba(25, 118, 210, 0.95)',
            color: 'white',
            zIndex: 1200,
            boxShadow: '0 -4px 20px rgba(0,0,0,0.2)'
          }}
        >
          <Container maxWidth="xl">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  Comparing {comparisonSamples.length} sample{comparisonSamples.length > 1 ? 's' : ''}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  {comparisonSamples.map(id => (
                    <Chip
                      key={id}
                      label={`Sample ${id}`}
                      onDelete={() => handleAddToComparison(id)}
                      sx={{ bgcolor: 'white', color: 'primary.main' }}
                    />
                  ))}
                </Box>
              </Box>
              <Button
                variant="contained"
                color="inherit"
                onClick={() => setComparisonSamples([])}
              >
                Clear All
              </Button>
            </Box>
          </Container>
        </Paper>
      )}

      {/* Comparison View (appears when 2+ samples selected) */}
      {comparisonSamples.length >= 2 && analysisId && (
        <Box id="comparison-section" sx={{ mt: 3 }}>
          <ComparisonView
            analysisId={analysisId}
            sampleIds={comparisonSamples}
            onClose={() => setComparisonSamples([])}
          />
        </Box>
      )}

      {/* Local Explanation Panel (appears when sample clicked) */}
      {selectedSample !== null && analysisId && (
        <Box id="local-explanation-section" sx={{ mt: 3 }}>
          <LocalExplanationPanel
            analysisId={analysisId}
            sampleId={selectedSample}
            onClose={handleCloseLocalExplanation}
          />
        </Box>
      )}
    </Container>
  );
};

export default AnalysisResultsPage;
