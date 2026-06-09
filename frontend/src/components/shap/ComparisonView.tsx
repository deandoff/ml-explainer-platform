import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Divider
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import Plot from 'react-plotly.js';
import type { Data, Layout } from 'plotly.js';
import { shapInteractiveAPI } from '../../api';
import { russianPlotlyConfig } from '../../utils/plotlyConfig';

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
}

interface Props {
  analysisId: string;
  sampleIds: number[];
  onClose: () => void;
}

type BarTraceWithBase = Data & {
  base: number[];
};

const ComparisonView: React.FC<Props> = ({ analysisId, sampleIds, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [comparisons, setComparisons] = useState<LocalExplanation[]>([]);

  useEffect(() => {
    loadComparisons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId, sampleIds]);

  const loadComparisons = async () => {
    setLoading(true);
    try {
      const response = await shapInteractiveAPI.compareSamples(analysisId, sampleIds);
      setComparisons(response.data.samples);
    } catch (error) {
      console.error('Failed to load comparisons:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderWaterfallPlot = (explanation: LocalExplanation) => {
    if (!explanation.waterfall_data || explanation.waterfall_data.length === 0) {
      return <Typography color="text.secondary">Нет данных</Typography>;
    }

    const data = explanation.waterfall_data.slice(0, 10);

    // Waterfall chart data
    const x = data.map(d => d.shap_value);
    const y = data.map(d => d.feature);
    const base = data.map(d => d.start);
    const colors = data.map(d => d.shap_value > 0 ? 'rgba(244, 67, 54, 0.7)' : 'rgba(33, 150, 243, 0.7)');
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
    );
  };

  const computeDifferences = () => {
    if (comparisons.length < 2) return [];

    const baseline = comparisons[0];
    const differences: Array<{
      feature: string;
      baseline_value: number;
      baseline_shap: number;
      compare_values: number[];
      compare_shaps: number[];
      shap_diffs: number[];
      max_shap_diff: number;
    }> = [];

    const features = baseline.feature_contributions.map(f => f.feature);

    features.forEach(feature => {
      const baselineContrib = baseline.feature_contributions.find(f => f.feature === feature);
      if (!baselineContrib) return;

      const compareValues: number[] = [];
      const compareShaps: number[] = [];
      const shapDiffs: number[] = [];

      comparisons.slice(1).forEach(comp => {
        const contrib = comp.feature_contributions.find(f => f.feature === feature);
        if (contrib) {
          compareValues.push(contrib.value);
          compareShaps.push(contrib.shap_value);
          shapDiffs.push(Math.abs(contrib.shap_value - baselineContrib.shap_value));
        }
      });

      differences.push({
        feature,
        baseline_value: baselineContrib.value,
        baseline_shap: baselineContrib.shap_value,
        compare_values: compareValues,
        compare_shaps: compareShaps,
        shap_diffs: shapDiffs,
        max_shap_diff: Math.max(...shapDiffs)
      });
    });

    // Sort by max difference
    return differences.sort((a, b) => b.max_shap_diff - a.max_shap_diff).slice(0, 15);
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

  if (comparisons.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography color="error">Не удалось загрузить сравнение</Typography>
      </Paper>
    );
  }

  const differences = computeDifferences();
  const predictionDiffs = comparisons.slice(1).map(c => c.prediction - comparisons[0].prediction);

  return (
    <Paper
      sx={{
        p: 3,
        border: '2px solid',
        borderColor: 'primary.main',
        boxShadow: '0 4px 20px rgba(25, 118, 210, 0.15)'
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" color="primary">
            Сравнение объектов: {comparisons.length}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            {comparisons.map((comp, idx) => (
              <Chip
                key={comp.sample_id}
                label={`Объект ${comp.sample_id}: ${comp.prediction.toFixed(4)}`}
                size="small"
                color={idx === 0 ? 'primary' : 'default'}
                variant={idx === 0 ? 'filled' : 'outlined'}
              />
            ))}
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Закрыть сравнение">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Prediction Differences */}
      <Box sx={{ mb: 3, p: 2, bgcolor: 'rgba(25, 118, 210, 0.04)', borderRadius: 1 }}>
        <Typography variant="subtitle2" gutterBottom>
          Различия предсказаний относительно объекта {comparisons[0].sample_id}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
          {predictionDiffs.map((diff, idx) => (
            <Chip
              key={idx}
              label={`Объект ${comparisons[idx + 1].sample_id}: ${diff > 0 ? '+' : ''}${diff.toFixed(4)}`}
              size="small"
              color={Math.abs(diff) > 0.1 ? 'error' : 'success'}
              icon={diff > 0 ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />}
            />
          ))}
        </Box>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Side-by-side Waterfall Plots */}
      <Typography variant="h6" gutterBottom>
        Сравнение каскадных графиков
      </Typography>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {comparisons.map((comp, idx) => (
          <Grid item xs={12} md={comparisons.length === 2 ? 6 : 12 / comparisons.length} key={comp.sample_id}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Объект {comp.sample_id} {idx === 0 && '(базовый)'}
              </Typography>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Предсказание: {comp.prediction.toFixed(4)}
              </Typography>
              {renderWaterfallPlot(comp)}
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Divider sx={{ mb: 3 }} />

      {/* Difference Table */}
      <Typography variant="h6" gutterBottom>
        Различия влияния признаков
      </Typography>
      <Typography variant="caption" color="text.secondary" paragraph>
        Признаки ранжированы по максимальному отличию SHAP от базового объекта {comparisons[0].sample_id}
      </Typography>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Место</TableCell>
              <TableCell>Признак</TableCell>
              <TableCell align="right">Базовое значение</TableCell>
              <TableCell align="right">Базовый SHAP</TableCell>
              {comparisons.slice(1).map((comp, idx) => (
                <React.Fragment key={comp.sample_id}>
                  <TableCell align="right">Значение объекта {comp.sample_id}</TableCell>
                  <TableCell align="right">SHAP объекта {comp.sample_id}</TableCell>
                  <TableCell align="right">Разница SHAP</TableCell>
                </React.Fragment>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {differences.map((diff, idx) => (
              <TableRow
                key={diff.feature}
                sx={{
                  bgcolor: idx < 5 ? 'rgba(25, 118, 210, 0.04)' : 'inherit'
                }}
              >
                <TableCell>{idx + 1}</TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={idx < 5 ? 600 : 400}>
                    {diff.feature}
                  </Typography>
                </TableCell>
                <TableCell align="right">{diff.baseline_value.toFixed(4)}</TableCell>
                <TableCell align="right">
                  <Typography
                    color={diff.baseline_shap > 0 ? 'error' : 'primary'}
                    fontWeight={600}
                  >
                    {diff.baseline_shap.toFixed(4)}
                  </Typography>
                </TableCell>
                {diff.compare_values.map((val, compIdx) => (
                  <React.Fragment key={compIdx}>
                    <TableCell align="right">{val.toFixed(4)}</TableCell>
                    <TableCell align="right">
                      <Typography
                        color={diff.compare_shaps[compIdx] > 0 ? 'error' : 'primary'}
                        fontWeight={600}
                      >
                        {diff.compare_shaps[compIdx].toFixed(4)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        label={diff.shap_diffs[compIdx].toFixed(4)}
                        size="small"
                        color={diff.shap_diffs[compIdx] > 0.05 ? 'error' : 'default'}
                      />
                    </TableCell>
                  </React.Fragment>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Insights */}
      <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(25, 118, 210, 0.04)', borderRadius: 1 }}>
        <Typography variant="subtitle2" gutterBottom>
          Основные выводы
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {differences.length > 0 && (
            <>
              Наибольшее различие связано с признаком <strong>{differences[0].feature}</strong>:
              разница SHAP составляет <strong>{differences[0].max_shap_diff.toFixed(4)}</strong>.
              {Math.abs(predictionDiffs[0]) > 0.1 ? (
                <> Это объясняет значительное различие предсказаний: <strong>{predictionDiffs[0].toFixed(4)}</strong>.</>
              ) : (
                <> Несмотря на различия признаков, предсказания остаются относительно близкими.</>
              )}
            </>
          )}
        </Typography>
      </Box>
    </Paper>
  );
};

export default ComparisonView;
