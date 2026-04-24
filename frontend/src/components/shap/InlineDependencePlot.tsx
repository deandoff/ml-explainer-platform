import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Chip,
  CircularProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Plot from 'react-plotly.js';
import { shapInteractiveAPI } from '../../api';

interface Props {
  analysisId: string;
  featureName: string;
  shapData: any;
  onClose: () => void;
  onPointClick?: (sampleId: number) => void;
  selectedSamples?: number[];
}

const InlineDependencePlot: React.FC<Props> = ({
  analysisId,
  featureName,
  shapData,
  onClose,
  onPointClick,
  selectedSamples = []
}) => {
  const [loading, setLoading] = useState(false);
  const [interactionFeature, setInteractionFeature] = useState<string>('auto');
  const [featureStats, setFeatureStats] = useState<any>(null);

  useEffect(() => {
    loadFeatureStats();
  }, [analysisId, featureName]);

  const loadFeatureStats = async () => {
    setLoading(true);
    try {
      const response = await shapInteractiveAPI.getFeatureStats(analysisId, featureName);
      setFeatureStats(response.data);
    } catch (error) {
      console.error('Failed to load feature stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Prepare dependence plot data
  const plotData = React.useMemo(() => {
    if (!shapData || !shapData.points) return [];

    // Extract data for this feature
    const points = shapData.points.map((p: any) => {
      const featureData = p.features[featureName];
      if (!featureData) return null;

      // Determine interaction feature color
      let colorValue = 0;
      if (interactionFeature !== 'auto' && interactionFeature !== 'none') {
        const interactionData = p.features[interactionFeature];
        colorValue = interactionData ? interactionData.value : 0;
      } else {
        // Auto: use feature value itself
        colorValue = featureData.value;
      }

      return {
        x: featureData.value,
        y: featureData.shap_value,
        sampleId: p.sample_id,
        prediction: p.prediction,
        colorValue: colorValue
      };
    }).filter((p: any) => p !== null);

    return [{
      type: 'scatter',
      mode: 'markers',
      x: points.map((p: any) => p.x),
      y: points.map((p: any) => p.y),
      customdata: points.map((p: any) => [p.sampleId, p.prediction]),
      marker: {
        size: 8,
        color: points.map((p: any) => p.colorValue),
        colorscale: 'Viridis',
        showscale: true,
        colorbar: {
          title: {
            text: interactionFeature === 'auto' || interactionFeature === 'none'
              ? featureName
              : interactionFeature,
            side: 'right'
          },
          x: 1.02,
          len: 0.7,
          thickness: 15
        },
        line: {
          color: points.map((p: any) =>
            selectedSamples.includes(p.sampleId) ? 'black' : 'rgba(0,0,0,0.2)'
          ),
          width: points.map((p: any) =>
            selectedSamples.includes(p.sampleId) ? 3 : 0.5
          )
        },
        opacity: 0.7
      },
      hovertemplate:
        `<b>${featureName}</b><br>` +
        'Feature value: %{x:.4f}<br>' +
        'SHAP value: %{y:.4f}<br>' +
        'Prediction: %{customdata[1]:.4f}<br>' +
        'Sample ID: %{customdata[0]}<br>' +
        '<extra></extra>'
    }];
  }, [shapData, featureName, interactionFeature, selectedSamples]);

  const layout = {
    title: {
      text: `Dependence Plot: ${featureName}`,
      font: { size: 16, weight: 600 }
    },
    xaxis: {
      title: `${featureName} value`,
      gridcolor: 'rgba(0,0,0,0.1)'
    },
    yaxis: {
      title: `SHAP value for ${featureName}`,
      zeroline: true,
      zerolinecolor: 'rgba(0,0,0,0.3)',
      zerolinewidth: 2,
      gridcolor: 'rgba(0,0,0,0.1)'
    },
    height: 400,
    hovermode: 'closest',
    showlegend: false,
    margin: { l: 60, r: 120, t: 60, b: 60 },
    plot_bgcolor: 'rgba(250,250,250,0.5)',
    paper_bgcolor: 'white'
  };

  const handlePlotClick = (event: any) => {
    if (event.points && event.points.length > 0 && onPointClick) {
      const point = event.points[0];
      const sampleId = point.customdata[0];
      onPointClick(sampleId);
    }
  };

  // Get available features for interaction selection
  const availableFeatures = shapData?.feature_names || [];

  return (
    <Paper
      sx={{
        p: 3,
        mb: 3,
        border: '2px solid',
        borderColor: 'primary.main',
        boxShadow: '0 4px 20px rgba(25, 118, 210, 0.15)'
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" color="primary">
          Feature Dependence Analysis
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Controls */}
      <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Interaction Feature</InputLabel>
          <Select
            value={interactionFeature}
            label="Interaction Feature"
            onChange={(e) => setInteractionFeature(e.target.value)}
          >
            <MenuItem value="auto">Auto-detect</MenuItem>
            <MenuItem value="none">None (use feature value)</MenuItem>
            {availableFeatures
              .filter((f: string) => f !== featureName)
              .slice(0, 10)
              .map((f: string) => (
                <MenuItem key={f} value={f}>{f}</MenuItem>
              ))}
          </Select>
        </FormControl>

        <Typography variant="caption" color="text.secondary">
          Color shows interaction with selected feature
        </Typography>
      </Box>

      {/* Plot */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Plot
          data={plotData as any}
          layout={layout as any}
          config={{
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
          }}
          onClick={handlePlotClick}
          style={{ width: '100%' }}
        />
      )}

      {/* Statistics */}
      {featureStats && (
        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Correlation
              </Typography>
              <Typography variant="h6" color={
                Math.abs(featureStats.statistics.correlation) > 0.7 ? 'error.main' :
                Math.abs(featureStats.statistics.correlation) > 0.4 ? 'warning.main' :
                'success.main'
              }>
                {featureStats.statistics.correlation.toFixed(3)}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Mean |SHAP|
              </Typography>
              <Typography variant="h6">
                {featureStats.statistics.mean_abs_shap.toFixed(4)}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Max Impact
              </Typography>
              <Typography variant="h6">
                {featureStats.statistics.max_impact.toFixed(4)}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.02)', textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                Positive Impact
              </Typography>
              <Typography variant="h6">
                {(featureStats.statistics.positive_impact_ratio * 100).toFixed(1)}%
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Insights */}
      <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(25, 118, 210, 0.04)', borderRadius: 1 }}>
        <Typography variant="subtitle2" gutterBottom>
          💡 Insights
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {featureStats && Math.abs(featureStats.statistics.correlation) > 0.7 ? (
            <>
              <strong>Strong correlation</strong> ({featureStats.statistics.correlation > 0 ? 'positive' : 'negative'})
              between feature value and SHAP value. Higher values of {featureName} tend to
              {featureStats.statistics.correlation > 0 ? ' increase' : ' decrease'} predictions.
            </>
          ) : featureStats && Math.abs(featureStats.statistics.correlation) < 0.2 ? (
            <>
              <strong>Weak correlation</strong> suggests non-linear relationship or interactions with other features.
              Consider checking interaction effects.
            </>
          ) : (
            <>
              <strong>Moderate correlation</strong> indicates some relationship between feature value and impact.
              The pattern may vary across different value ranges.
            </>
          )}
        </Typography>
      </Box>
    </Paper>
  );
};

export default InlineDependencePlot;
