import React, { useCallback, useState, useEffect } from 'react';
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
  TextField,
} from '@mui/material';
import type { ChipProps } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Plot from 'react-plotly.js';
import { modelsAPI, datasetsAPI, analysesAPI } from '../api';
import { formatMetricName, formatStatus } from '../utils/localization';
import { russianPlotlyConfig } from '../utils/plotlyConfig';

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
  const [classLabelsInput, setClassLabelsInput] = useState('');
  const [startingAnalysis, setStartingAnalysis] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage] = useState(20);

  const loadModels = useCallback(async () => {
    try {
      const response = await modelsAPI.listModels();
      setModels(response.data);
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  }, []);

  const loadDatasets = useCallback(async () => {
    try {
      const response = await datasetsAPI.listDatasets();
      setDatasets(response.data);
    } catch (error) {
      console.error('Failed to load datasets:', error);
    }
  }, []);

  const loadAnalyses = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadModels();
    loadDatasets();
    loadAnalyses();
  }, [loadAnalyses, loadDatasets, loadModels]);

  useEffect(() => {
    const hasActiveAnalyses = analyses.some(
      analysis => analysis.status === 'pending' || analysis.status === 'running'
    );
    if (hasActiveAnalyses) {
      const interval = setInterval(loadAnalyses, 3000);
      return () => clearInterval(interval);
    }
  }, [analyses, loadAnalyses]);

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const paginatedAnalyses = analyses.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const startAnalysis = async () => {
    if (!selectedModel || !selectedDataset) {
      alert('Выберите модель и датасет');
      return;
    }

    setStartingAnalysis(true);
    setResults(null);

    try {
      const classLabels = classLabelsInput
        .split(',')
        .map(label => label.trim())
        .filter(Boolean);
      await analysesAPI.createAnalysis({
        model_id: selectedModel,
        dataset_id: selectedDataset,
        explainer_type: explainerType,
        class_labels: classLabels.length > 0 ? classLabels : undefined,
      });

      await loadAnalyses();
    } catch (error) {
      console.error('Failed to start analysis:', error);
      alert('Не удалось запустить анализ');
    } finally {
      setStartingAnalysis(false);
    }
  };

  const getStatusColor = (status: string): ChipProps['color'] => {
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
    return new Date(dateString).toLocaleString('ru-RU');
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
                  Сводный график SHAP
                </Typography>
                <Box sx={{ textAlign: 'center' }}>
                  <img
                    src={viz.image}
                    alt="Сводный график SHAP"
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
                Сводный график SHAP
              </Typography>
              <Plot
                data={viz.data}
                layout={{
                  ...viz.layout,
                  title: { text: 'Сводный график SHAP' },
                }}
                config={{ ...russianPlotlyConfig, responsive: true }}
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
                  Важность признаков
                </Typography>
                <Box sx={{ textAlign: 'center' }}>
                  <img
                    src={viz.image}
                    alt="Важность признаков"
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
                Важность признаков по LIME
              </Typography>
              <Plot
                data={results.visualizations.lime_bar_chart.data}
                layout={{
                  ...results.visualizations.lime_bar_chart.layout,
                  title: { text: 'Важность признаков по LIME' },
                  xaxis: {
                    ...results.visualizations.lime_bar_chart.layout?.xaxis,
                    title: { text: 'Вклад' },
                  },
                  yaxis: {
                    ...results.visualizations.lime_bar_chart.layout?.yaxis,
                    title: { text: 'Признаки' },
                  },
                }}
                config={{ ...russianPlotlyConfig, responsive: true }}
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
            Важность признаков
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
              title: { text: `Важность признаков по ${explainerType.toUpperCase()}` },
              xaxis: { title: { text: 'Важность' } },
              yaxis: { title: { text: 'Признаки' } },
              height: 400,
              margin: { l: 150 },
            }}
            config={{ ...russianPlotlyConfig, responsive: true }}
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
            Матрица ошибок
          </Typography>
          <Plot
            data={results.visualizations.confusion_matrix.data}
            layout={{
              ...results.visualizations.confusion_matrix.layout,
              title: { text: 'Матрица ошибок' },
              xaxis: {
                ...results.visualizations.confusion_matrix.layout?.xaxis,
                title: { text: 'Предсказанный класс' },
              },
              yaxis: {
                ...results.visualizations.confusion_matrix.layout?.yaxis,
                title: { text: 'Фактический класс' },
              },
            }}
            config={{ ...russianPlotlyConfig, responsive: true }}
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
            Метрики качества модели
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mt: 2 }}>
            {Object.entries(metrics).map(([key, value]) => (
              <Paper key={key} sx={{ p: 2, textAlign: 'center', bgcolor: '#f5f5f5' }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {formatMetricName(key)}
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
              График зависимости SHAP
            </Typography>
            <Box sx={{ textAlign: 'center' }}>
              <img
                src={viz.image}
                alt="График зависимости SHAP"
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
            График зависимости SHAP
          </Typography>
          <Plot
            data={viz.data}
            layout={{
              ...viz.layout,
              title: { text: 'График зависимости SHAP' },
            }}
            config={{ ...russianPlotlyConfig, responsive: true }}
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
              Каскадный график SHAP
            </Typography>
            <Box sx={{ textAlign: 'center' }}>
              <img
                src={viz.image}
                alt="Каскадный график SHAP"
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
            Каскадный график SHAP
          </Typography>
          <Plot
            data={viz.data}
            layout={{
              ...viz.layout,
              title: { text: 'Каскадный график SHAP' },
            }}
            config={{ ...russianPlotlyConfig, responsive: true }}
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
          Анализ модели
        </Typography>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Модель</InputLabel>
              <Select
                value={selectedModel}
                label="Модель"
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
              <InputLabel>Датасет</InputLabel>
              <Select
                value={selectedDataset}
                label="Датасет"
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
              <InputLabel>Метод объяснения</InputLabel>
              <Select
                value={explainerType}
                label="Метод объяснения"
                onChange={(e) => setExplainerType(e.target.value as 'shap' | 'lime')}
              >
                <MenuItem value="shap">SHAP</MenuItem>
                <MenuItem value="lime">LIME</MenuItem>
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Названия классов"
              value={classLabelsInput}
              onChange={(event) => setClassLabelsInput(event.target.value)}
              placeholder="Кредит отклонён, Кредит одобрен"
              helperText="Необязательно. Укажите названия через запятую в порядке выходов модели."
            />

            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={startAnalysis}
              disabled={startingAnalysis || !selectedModel || !selectedDataset}
            >
              {startingAnalysis ? 'Запуск...' : 'Запустить анализ'}
            </Button>
          </Box>
        </Paper>

        {analyses.some(
          analysis => analysis.status === 'pending' || analysis.status === 'running'
        ) && (
          <Alert
            severity="info"
            icon={<CircularProgress size={20} />}
            sx={{ mb: 3 }}
          >
            Выполняется анализов: {analyses.filter(
              analysis => analysis.status === 'pending' || analysis.status === 'running'
            ).length}. Можно запустить ещё один анализ или открыть готовые результаты.
          </Alert>
        )}

        {results && (
          <Box>
            <Alert severity="success" sx={{ mb: 3 }}>
              Анализ успешно завершен
            </Alert>

            {renderMetrics()}
            {renderFeatureImportance()}
            {renderDependencePlot()}
            {renderWaterfallPlot()}
            {renderConfusionMatrix()}

            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Сводка анализа
                </Typography>
                <Typography variant="body2">
                  Проанализировано объектов: {results.num_samples || 'Нет данных'}
                </Typography>
                <Typography variant="body2">
                  Признаков: {results.num_features || 'Нет данных'}
                </Typography>
                <Typography variant="body2">
                  Метод объяснения: {explainerType.toUpperCase()}
                </Typography>
              </CardContent>
            </Card>
          </Box>
        )}
      </Box>

      {/* Previous Analyses List */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          История анализов
        </Typography>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Модель</TableCell>
                <TableCell>Датасет</TableCell>
                <TableCell>Метод</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Дата создания</TableCell>
                <TableCell>Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {analyses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Анализов пока нет
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
                        label={formatStatus(analysis.status)}
                        size="small"
                        color={getStatusColor(analysis.status)}
                      />
                    </TableCell>
                    <TableCell>{formatDate(analysis.created_at)}</TableCell>
                    <TableCell>
                      {analysis.status === 'completed' && (
                        <IconButton
                          color="primary"
                          onClick={() => navigate(`/analysis/${analysis.id}/results`)}
                          size="small"
                          aria-label="Открыть результаты анализа"
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
