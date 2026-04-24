import React, { useMemo, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { Box, Typography, Chip, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

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
}

interface Props {
  data: SHAPData | null;
  onPointClick: (sampleId: number) => void;
  onFeatureClick?: (featureName: string) => void;
  selectedSamples?: number[];
  onAddToComparison?: (sampleId: number) => void;
  maxFeatures?: number;
  selectedFeature?: string | null;
}

const InteractiveSummaryPlot: React.FC<Props> = ({
  data,
  onPointClick,
  onFeatureClick,
  selectedSamples = [],
  onAddToComparison,
  maxFeatures = 20,
  selectedFeature = null
}) => {
  // Prepare data for Plotly
  const plotData = useMemo(() => {
    if (!data) return [];

    // Sort features by importance
    const sortedFeatures = Object.entries(data.feature_importance)
      .sort((a, b) => b[1].mean_abs_shap - a[1].mean_abs_shap)
      .slice(0, maxFeatures)
      .map(([name]) => name);

    // Create trace for each feature
    return sortedFeatures.map((featureName, featureIdx) => {
      const points = data.points.map(p => ({
        x: p.features[featureName]?.shap_value || 0,
        y: featureIdx,
        featureValue: p.features[featureName]?.value || 0,
        sampleId: p.sample_id,
        prediction: p.prediction
      }));

      // Highlight selected feature
      const isSelected = selectedFeature === featureName;

      return {
        type: 'scatter',
        mode: 'markers',
        name: featureName,
        x: points.map(p => p.x),
        y: points.map(p => p.y),
        customdata: points.map(p => [p.sampleId, p.featureValue, p.prediction]),
        marker: {
          size: isSelected ? 10 : 8,
          color: points.map(p => p.featureValue),
          colorscale: 'RdBu',
          reversescale: false,
          showscale: featureIdx === 0,
          colorbar: {
            title: {
              text: 'Feature<br>Value',
              side: 'right'
            },
            x: 1.02,
            len: 0.7,
            thickness: 15
          },
          line: {
            color: points.map(p =>
              selectedSamples.includes(p.sampleId) ? 'black' :
              isSelected ? 'rgba(25, 118, 210, 0.5)' :
              'rgba(0,0,0,0.1)'
            ),
            width: points.map(p =>
              selectedSamples.includes(p.sampleId) ? 3 :
              isSelected ? 2 :
              0.5
            )
          },
          opacity: isSelected ? 0.9 : 0.8
        },
        hovertemplate:
          '<b>%{fullData.name}</b><br>' +
          'SHAP value: %{x:.4f}<br>' +
          'Feature value: %{customdata[1]:.4f}<br>' +
          'Prediction: %{customdata[2]:.4f}<br>' +
          'Sample ID: %{customdata[0]}<br>' +
          '<extra></extra>'
      };
    });
  }, [data, selectedSamples, maxFeatures, selectedFeature]);

  const layout = useMemo(() => ({
    title: {
      text: 'SHAP Summary Plot (Interactive)',
      font: { size: 16, weight: 600 }
    },
    xaxis: {
      title: 'SHAP value (impact on model output)',
      zeroline: true,
      zerolinecolor: 'rgba(0,0,0,0.3)',
      zerolinewidth: 2,
      gridcolor: 'rgba(0,0,0,0.1)'
    },
    yaxis: {
      title: '',
      tickmode: 'array',
      tickvals: plotData.map((_, i) => i),
      ticktext: plotData.map(d => d.name),
      automargin: true,
      gridcolor: 'rgba(0,0,0,0.05)'
    },
    height: 650,
    hovermode: 'closest',
    showlegend: false,
    margin: { l: 150, r: 120, t: 60, b: 60 },
    plot_bgcolor: 'rgba(250,250,250,0.5)',
    paper_bgcolor: 'white',
    autosize: true
  }), [plotData]);

  const handleClick = useCallback((event: any) => {
    if (event.points && event.points.length > 0) {
      const point = event.points[0];
      const sampleId = point.customdata[0];

      // Shift+Click = add to comparison
      if (event.event.shiftKey && onAddToComparison) {
        onAddToComparison(sampleId);
      } else {
        onPointClick(sampleId);
      }
    }
  }, [onPointClick, onAddToComparison]);

  const handleFeatureNameClick = useCallback((featureName: string) => {
    if (onFeatureClick) {
      onFeatureClick(featureName);
    }
  }, [onFeatureClick]);

  if (!data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Typography color="text.secondary">No data available</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Instructions */}
      <Box sx={{ mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Tooltip title="Click on any point to see detailed local explanation for that sample">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <InfoOutlinedIcon fontSize="small" color="action" />
            <Typography variant="caption" color="text.secondary">
              Click point for details
            </Typography>
          </Box>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">•</Typography>
        <Typography variant="caption" color="text.secondary">
          Shift+Click to compare
        </Typography>
        {onFeatureClick && (
          <>
            <Typography variant="caption" color="text.secondary">•</Typography>
            <Typography variant="caption" color="text.secondary">
              Click feature name for interactions
            </Typography>
          </>
        )}
      </Box>

      {/* Plot */}
      <Plot
        data={plotData as any}
        layout={layout as any}
        config={{
          responsive: true,
          displayModeBar: true,
          displaylogo: false,
          modeBarButtonsToRemove: ['lasso2d', 'select2d']
        }}
        onClick={handleClick}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Selected samples chips */}
      {selectedSamples.length > 0 && (
        <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(25, 118, 210, 0.08)', borderRadius: 1 }}>
          <Typography variant="caption" fontWeight={600} color="primary">
            Selected for comparison ({selectedSamples.length}/4):
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            {selectedSamples.map(id => (
              <Chip
                key={id}
                label={`Sample ${id}`}
                onDelete={onAddToComparison ? () => onAddToComparison(id) : undefined}
                size="small"
                color="primary"
                variant="outlined"
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Feature list with click handlers */}
      {onFeatureClick && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary" gutterBottom>
            Click feature name to explore interactions:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            {plotData.slice(0, 10).map(d => (
              <Chip
                key={d.name}
                label={d.name}
                size="small"
                onClick={() => handleFeatureNameClick(d.name)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default InteractiveSummaryPlot;
