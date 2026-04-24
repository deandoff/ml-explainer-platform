import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import Plot from 'react-plotly.js';
import { shapInteractiveAPI } from '../../api';
import WhatIfAnalysis from './WhatIfAnalysis';

interface LocalExplanation {
  sample_id: number;
  base_value: number;
  prediction: number;
  feature_contributions: Array<{
    feature: string;
    value: number;
    shap_value: number;
    abs_shap: number;
  }>;
  waterfall_data: Array<{
    feature: string;
    value: number;
    shap_value: number;
    start: number;
    end: number;
  }>;
  force_plot: {
    positive: Array<any>;
    negative: Array<any>;
  };
  explanation_quality: {
    sum_shap: number;
    expected_sum: number;
    consistency_error: number;
  };
}

interface Props {
  analysisId: string;
  sampleId: number;
  onClose?: () => void;
}

const LocalExplanationPanel: React.FC<Props> = ({ analysisId, sampleId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [explanation, setExplanation] = useState<LocalExplanation | null>(null);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    loadExplanation();
  }, [analysisId, sampleId]);

  const loadExplanation = async () => {
    setLoading(true);
    try {
      const response = await shapInteractiveAPI.getLocalExplanation(analysisId, sampleId);
      setExplanation(response.data);
    } catch (error) {
      console.error('Failed to load local explanation:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderWaterfallPlot = () => {
    if (!explanation) return null;

    const waterfallData = explanation.waterfall_data;

    // Prepare data for waterfall chart
    const x = waterfallData.map(d => d.shap_value);
    const y = waterfallData.map(d => d.feature);
    const base = waterfallData.map(d => d.start);
    const colors = waterfallData.map(d => d.shap_value > 0 ? '#ff6b6b' : '#4dabf7');

    const trace = {
      type: 'bar',
      orientation: 'h',
      x: x,
      y: y,
      base: base,
      marker: {
        color: colors
      },
      text: x.map(v => v.toFixed(4)),
      textposition: 'outside',
      hovertemplate:
        '<b>%{y}</b><br>' +
        'SHAP value: %{x:.4f}<br>' +
        '<extra></extra>'
    };

    const layout = {
      title: 'Waterfall Plot - Feature Contributions',
      xaxis: {
        title: 'Model Output',
        zeroline: true,
        zerolinecolor: 'black',
        zerolinewidth: 2
      },
      yaxis: {
        title: '',
        automargin: true
      },
      height: 500,
      margin: { l: 150, r: 50, t: 50, b: 50 },
      shapes: [
        // Base value line
        {
          type: 'line',
          x0: explanation.base_value,
          x1: explanation.base_value,
          y0: -0.5,
          y1: waterfallData.length - 0.5,
          line: {
            color: 'green',
            width: 2,
            dash: 'dash'
          }
        },
        // Prediction line
        {
          type: 'line',
          x0: explanation.prediction,
          x1: explanation.prediction,
          y0: -0.5,
          y1: waterfallData.length - 0.5,
          line: {
            color: 'purple',
            width: 2,
            dash: 'dash'
          }
        }
      ],
      annotations: [
        {
          x: explanation.base_value,
          y: -0.8,
          text: `Base: ${explanation.base_value.toFixed(4)}`,
          showarrow: false,
          font: { color: 'green', size: 12 }
        },
        {
          x: explanation.prediction,
          y: -0.8,
          text: `Prediction: ${explanation.prediction.toFixed(4)}`,
          showarrow: false,
          font: { color: 'purple', size: 12 }
        }
      ]
    };

    return (
      <Plot
        data={[trace] as any}
        layout={layout as any}
        config={{ responsive: true, displaylogo: false }}
        style={{ width: '100%' }}
      />
    );
  };

  const renderForcePlot = () => {
    if (!explanation) return null;

    const positive = explanation.force_plot.positive;
    const negative = explanation.force_plot.negative;

    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Force Plot - Push/Pull Analysis
        </Typography>

        <Box sx={{ display: 'flex', gap: 3, mt: 3 }}>
          {/* Positive contributions */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" color="error" gutterBottom>
              Pushing Higher ({positive.length} features)
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Feature</TableCell>
                    <TableCell align="right">Value</TableCell>
                    <TableCell align="right">Impact</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {positive.map((contrib, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{contrib.feature}</TableCell>
                      <TableCell align="right">{contrib.value.toFixed(4)}</TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`+${contrib.shap_value.toFixed(4)}`}
                          size="small"
                          color="error"
                          icon={<ArrowUpwardIcon />}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* Negative contributions */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" color="primary" gutterBottom>
              Pushing Lower ({negative.length} features)
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Feature</TableCell>
                    <TableCell align="right">Value</TableCell>
                    <TableCell align="right">Impact</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {negative.map((contrib, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{contrib.feature}</TableCell>
                      <TableCell align="right">{contrib.value.toFixed(4)}</TableCell>
                      <TableCell align="right">
                        <Chip
                          label={contrib.shap_value.toFixed(4)}
                          size="small"
                          color="primary"
                          icon={<ArrowDownwardIcon />}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      </Box>
    );
  };

  const renderFeatureTable = () => {
    if (!explanation) return null;

    return (
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Rank</TableCell>
              <TableCell>Feature</TableCell>
              <TableCell align="right">Feature Value</TableCell>
              <TableCell align="right">SHAP Value</TableCell>
              <TableCell align="right">Abs Impact</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {explanation.feature_contributions.map((contrib, idx) => (
              <TableRow key={idx}>
                <TableCell>{idx + 1}</TableCell>
                <TableCell>{contrib.feature}</TableCell>
                <TableCell align="right">{contrib.value.toFixed(4)}</TableCell>
                <TableCell align="right">
                  <Typography
                    color={contrib.shap_value > 0 ? 'error' : 'primary'}
                    fontWeight={600}
                  >
                    {contrib.shap_value.toFixed(4)}
                  </Typography>
                </TableCell>
                <TableCell align="right">{contrib.abs_shap.toFixed(4)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  if (loading) {
    return (
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <CircularProgress />
        </Box>
      </Paper>
    );
  }

  if (!explanation) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography color="error">Failed to load explanation</Typography>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        p: 3,
        border: '2px solid',
        borderColor: 'secondary.main',
        boxShadow: '0 4px 20px rgba(156, 39, 176, 0.15)'
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" color="secondary">
            Local Explanation - Sample {explanation.sample_id}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
            <Chip
              label={`Base Value: ${explanation.base_value.toFixed(4)}`}
              size="small"
              color="success"
            />
            <Chip
              label={`Prediction: ${explanation.prediction.toFixed(4)}`}
              size="small"
              color="secondary"
            />
            <Chip
              label={`Consistency Error: ${explanation.explanation_quality.consistency_error.toFixed(6)}`}
              size="small"
              color={explanation.explanation_quality.consistency_error < 0.001 ? 'success' : 'warning'}
            />
          </Box>
        </Box>
        {onClose && (
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      {/* Tabs */}
      <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 2 }}>
        <Tab label="Waterfall Plot" />
        <Tab label="Force Plot" />
        <Tab label="Feature Table" />
        <Tab label="What-If Analysis" />
      </Tabs>

      {/* Content */}
      <Box>
        {tabValue === 0 && renderWaterfallPlot()}
        {tabValue === 1 && renderForcePlot()}
        {tabValue === 2 && renderFeatureTable()}
        {tabValue === 3 && (
          <WhatIfAnalysis
            analysisId={analysisId}
            sampleId={explanation.sample_id}
            originalFeatures={explanation.feature_contributions.reduce((acc, contrib) => {
              acc[contrib.feature] = {
                value: contrib.value,
                shap_value: contrib.shap_value
              };
              return acc;
            }, {} as Record<string, { value: number; shap_value: number }>)}
            originalPrediction={explanation.prediction}
            baseValue={explanation.base_value}
          />
        )}
      </Box>
    </Paper>
  );
};

export default LocalExplanationPanel;
