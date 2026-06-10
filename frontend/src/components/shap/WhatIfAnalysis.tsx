import React, { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Slider,
  Button,
  Grid,
  Chip,
  CircularProgress,
  Divider,
  Alert
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import Plot from 'react-plotly.js';
import type { Data, Layout } from 'plotly.js';
import { whatIfAPI } from '../../api';
import { russianPlotlyConfig } from '../../utils/plotlyConfig';
import { buildCompleteWaterfall } from '../../utils/shapWaterfall';

interface FeatureChange {
  feature: string;
  original_value: number;
  new_value: number;
  value_delta: number;
  original_shap: number;
  new_shap: number;
  shap_delta: number;
}

interface WhatIfResult {
  sample_id: number;
  original_prediction: number;
  new_prediction: number;
  prediction_delta: number;
  base_value: number;
  feature_changes: FeatureChange[];
  all_features: Record<string, {
    original_value: number;
    new_value: number;
    original_shap: number;
    new_shap: number;
    shap_delta: number;
  }>;
}

interface Props {
  analysisId: string;
  sampleId: number;
  originalFeatures: Record<string, { value: number; shap_value: number }>;
  originalPrediction: number;
  baseValue: number;
}

type BarTraceWithBase = Data & {
  base: number[];
};

const WhatIfAnalysis: React.FC<Props> = ({
  analysisId,
  sampleId,
  originalFeatures,
  originalPrediction,
  baseValue
}) => {
  const [modifiedFeatures, setModifiedFeatures] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getFeatureRange = (featureName: string): [number, number] => {
    const value = originalFeatures[featureName].value;
    const range = Math.abs(value) * 2 || 10;
    return [value - range, value + range];
  };

  const topFeatures = Object.entries(originalFeatures)
    .sort((a, b) => Math.abs(b[1].shap_value) - Math.abs(a[1].shap_value))
    .slice(0, 10)
    .map(([name]) => name);

  const handleFeatureChange = (featureName: string, newValue: number) => {
    setModifiedFeatures(prev => ({
      ...prev,
      [featureName]: newValue
    }));
  };

  const handleAnalyze = async () => {
    if (Object.keys(modifiedFeatures).length === 0) {
      setError('Измените хотя бы один признак');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await whatIfAPI.analyze(analysisId, sampleId, modifiedFeatures);
      setResult(response.data);
    } catch (err: any) {
      console.error('What-If analysis failed:', err);
      setError('Не удалось выполнить анализ');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setModifiedFeatures({});
    setResult(null);
    setError(null);
  };

  const getCurrentValue = (featureName: string): number => {
    return modifiedFeatures[featureName] ?? originalFeatures[featureName].value;
  };

  const isModified = (featureName: string): boolean => {
    return featureName in modifiedFeatures;
  };

  const renderWaterfallPlot = (
    title: string,
    features: Array<{ feature: string; shap_value: number }>,
    baseValue: number,
    prediction: number
  ) => {
    const waterfallData = buildCompleteWaterfall(
      features,
      baseValue,
      prediction
    );

    const x = waterfallData.map(d => d.shap_value);
    const y = waterfallData.map(d => d.feature);
    const base = waterfallData.map(d => d.start);
    const colors = waterfallData.map(d =>
      d.shap_value > 0 ? 'rgba(244, 67, 54, 0.7)' : 'rgba(33, 150, 243, 0.7)'
    );
    const trace: BarTraceWithBase = {
      type: 'bar',
      orientation: 'h',
      x: x,
      y: y,
      base: base,
      marker: { color: colors },
      hovertemplate:
        '<b>%{y}</b><br>' +
        'Значение SHAP: %{x:.4f}<br>' +
        '<extra></extra>',
      showlegend: false
    };
    const layout: Partial<Layout> = {
      height: 400,
      margin: { l: 150, r: 20, t: 20, b: 40 },
      xaxis: {
        title: { text: 'Значение SHAP' },
        zeroline: true,
        zerolinecolor: 'rgba(0,0,0,0.3)',
        zerolinewidth: 2
      },
      yaxis: {
        automargin: true
      },
      plot_bgcolor: 'rgba(250,250,250,0.5)',
      paper_bgcolor: 'white'
    };

    return (
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">
          Базовое значение: {baseValue.toFixed(4)} → Предсказание: {prediction.toFixed(4)}
        </Typography>
        <Plot
          data={[trace]}
          layout={layout}
          config={{
            ...russianPlotlyConfig,
            responsive: true,
            displayModeBar: false
          }}
          style={{ width: '100%' }}
        />
      </Box>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Анализ «что, если»
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RestartAltIcon />}
            onClick={handleReset}
            disabled={Object.keys(modifiedFeatures).length === 0}
            size="small"
          >
            Сбросить
          </Button>
          <Button
            variant="contained"
            onClick={handleAnalyze}
            disabled={loading || Object.keys(modifiedFeatures).length === 0}
            size="small"
          >
            {loading ? <CircularProgress size={20} /> : 'Анализировать'}
          </Button>
        </Box>
      </Box>

      <Typography variant="caption" color="text.secondary" paragraph>
        Изменяйте значения признаков, чтобы увидеть, как меняется предсказание
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Prediction Comparison */}
      {result && (
        <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(156, 39, 176, 0.04)' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">
                Исходное предсказание
              </Typography>
              <Typography variant="h6">
                {originalPrediction.toFixed(4)}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">
                Новое предсказание
              </Typography>
              <Typography variant="h6" color="secondary">
                {result.new_prediction.toFixed(4)}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">
                Изменение
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography
                  variant="h6"
                  color={result.prediction_delta > 0 ? 'error' : 'primary'}
                  fontWeight={600}
                >
                  {result.prediction_delta > 0 ? '+' : ''}{result.prediction_delta.toFixed(4)}
                </Typography>
                {result.prediction_delta > 0 ? (
                  <ArrowUpwardIcon color="error" />
                ) : (
                  <ArrowDownwardIcon color="primary" />
                )}
              </Box>
            </Grid>
          </Grid>
        </Paper>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Feature Sliders */}
      <Typography variant="subtitle2" gutterBottom>
        Самые важные признаки: {topFeatures.length}
      </Typography>

      <Grid container spacing={3}>
        {topFeatures.map(featureName => {
          const [min, max] = getFeatureRange(featureName);
          const currentValue = getCurrentValue(featureName);
          const originalValue = originalFeatures[featureName].value;
          const modified = isModified(featureName);

          return (
            <Grid item xs={12} md={6} key={featureName}>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  bgcolor: modified ? 'rgba(156, 39, 176, 0.04)' : 'transparent',
                  border: modified ? '2px solid' : '1px solid',
                  borderColor: modified ? 'secondary.main' : 'divider'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {featureName}
                  </Typography>
                  {modified && (
                    <Chip
                      label="Изменен"
                      size="small"
                      color="secondary"
                      sx={{ height: 20 }}
                    />
                  )}
                </Box>

                <Box sx={{ px: 1 }}>
                  <Slider
                    value={currentValue}
                    onChange={(e, v) => handleFeatureChange(featureName, v as number)}
                    min={min}
                    max={max}
                    step={(max - min) / 100}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => v.toFixed(3)}
                    marks={[
                      { value: originalValue, label: 'Исходное' }
                    ]}
                    sx={{
                      '& .MuiSlider-markLabel': {
                        fontSize: '0.7rem'
                      }
                    }}
                  />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Исходное: {originalValue.toFixed(3)}
                  </Typography>
                  <Typography variant="caption" color={modified ? 'secondary' : 'text.secondary'} fontWeight={modified ? 600 : 400}>
                    Текущее: {currentValue.toFixed(3)}
                  </Typography>
                </Box>

                {/* Show SHAP change if analyzed */}
                {result && result.all_features[featureName] && (
                  <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">
                      Изменение влияния SHAP:
                    </Typography>
                    <Typography
                      variant="caption"
                      color={result.all_features[featureName].shap_delta > 0 ? 'error' : 'primary'}
                      fontWeight={600}
                      sx={{ ml: 1 }}
                    >
                      {result.all_features[featureName].shap_delta > 0 ? '+' : ''}
                      {result.all_features[featureName].shap_delta.toFixed(4)}
                    </Typography>
                  </Box>
                )}
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* Feature Changes Summary */}
      {result && result.feature_changes.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" gutterBottom>
            Сводка влияния
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Изменено признаков: {result.feature_changes.length}.
            Наибольшее влияние оказал признак{' '}
            <strong>
              {result.feature_changes.sort((a, b) => Math.abs(b.shap_delta) - Math.abs(a.shap_delta))[0].feature}
            </strong>
            {' '}; изменение SHAP составило{' '}
            <strong>
              {result.feature_changes.sort((a, b) => Math.abs(b.shap_delta) - Math.abs(a.shap_delta))[0].shap_delta.toFixed(4)}
            </strong>.
          </Typography>
        </Box>
      )}

      {/* Waterfall Plots Comparison */}
      {result && (
        <Box sx={{ mt: 3 }}>
          <Divider sx={{ mb: 3 }} />
          <Typography variant="h6" gutterBottom>
            Сравнение каскадных графиков SHAP
          </Typography>
          <Typography variant="caption" color="text.secondary" paragraph>
            Сравнение вкладов признаков до и после изменений
          </Typography>

          <Grid container spacing={3}>
            {/* Original Waterfall */}
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                {renderWaterfallPlot(
                  'Исходное предсказание',
                  Object.entries(originalFeatures).map(([feature, data]) => ({
                    feature,
                    shap_value: data.shap_value
                  })),
                  baseValue,
                  originalPrediction
                )}
              </Paper>
            </Grid>

            {/* Modified Waterfall */}
            <Grid item xs={12} md={6}>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  border: '2px solid',
                  borderColor: 'secondary.main',
                  bgcolor: 'rgba(156, 39, 176, 0.02)'
                }}
              >
                {renderWaterfallPlot(
                  'Измененное предсказание',
                  Object.entries(result.all_features).map(([feature, data]) => ({
                    feature,
                    shap_value: data.new_shap
                  })),
                  baseValue,
                  result.new_prediction
                )}
              </Paper>
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  );
};

export default WhatIfAnalysis;
