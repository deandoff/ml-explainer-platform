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
  Grid,
  Paper,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Slider,
  TextField,
  Divider,
  LinearProgress,
  Tooltip,
} from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import Plot from 'react-plotly.js';
import { analysesAPI } from '../api';
import { formatMetricName } from '../utils/localization';
import { russianPlotlyConfig } from '../utils/plotlyConfig';

const LimeResultsPage: React.FC = () => {
  const { analysisId } = useParams<{ analysisId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<any>(null);
  const [instanceData, setInstanceData] = useState<any>(null);
  const [whatIfValues, setWhatIfValues] = useState<any>({});
  const [showTopN, setShowTopN] = useState(10);

  useEffect(() => {
    loadResults();
  }, [analysisId]);

  const loadResults = async () => {
    if (!analysisId) return;

    try {
      const response = await analysesAPI.getAnalysisResults(analysisId);
      setResults(response.data);

      if (response.data.instance_explanations?.[0]) {
        const firstInstance = response.data.instance_explanations[0];
        setInstanceData(firstInstance);

        const initialValues: any = {};
        Object.keys(firstInstance.explanation.feature_importance).forEach(feature => {
          initialValues[feature] = 0;
        });
        setWhatIfValues(initialValues);
      }

      setLoading(false);
    } catch (error) {
      console.error('Failed to load results:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="xl">
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!results || !instanceData) {
    return (
      <Container maxWidth="xl">
        <Box sx={{ my: 4 }}>
          <Alert severity="error">Не удалось загрузить результаты анализа</Alert>
        </Box>
      </Container>
    );
  }

  const featureImportance = instanceData.explanation.feature_importance;
  const predictionProba = instanceData.explanation.prediction_proba;

  // Sort features by absolute importance
  const sortedFeatures = Object.entries(featureImportance)
    .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number));

  const displayedFeatures = showTopN === -1 ? sortedFeatures : sortedFeatures.slice(0, showTopN);

  const positiveFeatures = sortedFeatures.filter(([, value]) => (value as number) > 0);
  const negativeFeatures = sortedFeatures.filter(([, value]) => (value as number) < 0);

  const predictedClass = predictionProba.indexOf(Math.max(...predictionProba));
  const confidence = Math.max(...predictionProba);

  // Calculate prediction breakdown
  const baselineProbability = 1 / predictionProba.length; // Uniform baseline
  const positiveContribution = positiveFeatures.reduce((sum, [, val]) => sum + (val as number), 0);
  const negativeContribution = negativeFeatures.reduce((sum, [, val]) => sum + (val as number), 0);
  const totalContribution = positiveContribution + negativeContribution;
  const totalContributionMagnitude = Math.abs(totalContribution) || 1;

  // Generate improved plain English explanation
  const generateExplanation = () => {
    const topPositive = positiveFeatures.slice(0, 2);
    const topNegative = negativeFeatures.slice(0, 2);

    let explanation = `Модель предсказала класс ${predictedClass} с уверенностью ${(confidence * 100).toFixed(1)}%. `;

    if (topPositive.length > 0) {
      const mainFactors = topPositive.map(([name]) => formatFeatureName(name)).join(' и ');
      explanation += `Основное положительное влияние оказали признаки ${mainFactors}. `;
    }

    if (topNegative.length > 0) {
      const negativeFactors = topNegative.map(([name]) => formatFeatureName(name)).join(' и ');
      explanation += `Признаки ${negativeFactors} снизили итоговую оценку, но `;

      if (Math.abs(negativeContribution) < positiveContribution * 0.5) {
        explanation += `их влияния оказалось недостаточно, чтобы изменить результат. `;
      } else {
        explanation += `их влияние заметно уменьшило вероятность выбранного класса. `;
      }
    }

    const nonZeroCount = Object.values(featureImportance).filter(v => Math.abs(v as number) > 0.001).length;
    explanation += `Всего на предсказание заметно повлияли ${nonZeroCount} из ${Object.keys(featureImportance).length} признаков.`;

    return explanation;
  };

  // Calculate trust score (0-100)
  const calculateTrustScore = () => {
    const totalContribution = Object.values(featureImportance).reduce((sum: number, val) => sum + Math.abs(val as number), 0);
    const topContribution = sortedFeatures.slice(0, 3).reduce((sum: number, [, val]) => sum + Math.abs(val as number), 0);
    const concentration = topContribution / totalContribution;

    // Calculate dominant feature share
    const dominantShare = sortedFeatures[0] ? Math.abs(sortedFeatures[0][1] as number) / totalContribution : 0;

    // Trust score based on concentration and confidence
    let trustScore = 0;

    // Factor 1: Feature concentration (40 points)
    if (concentration > 0.7) trustScore += 40;
    else if (concentration > 0.5) trustScore += 30;
    else if (concentration > 0.3) trustScore += 20;
    else trustScore += 10;

    // Factor 2: Prediction confidence (30 points)
    if (confidence > 0.8) trustScore += 30;
    else if (confidence > 0.6) trustScore += 20;
    else if (confidence > 0.5) trustScore += 10;

    // Factor 3: Number of active features (30 points)
    const activeCount = Object.values(featureImportance).filter(v => Math.abs(v as number) > 0.001).length;
    if (activeCount <= 5) trustScore += 30;
    else if (activeCount <= 10) trustScore += 20;
    else if (activeCount <= 15) trustScore += 10;

    let level = 'Низкая';
    let color: 'error' | 'warning' | 'success' = 'error';
    let message = '';

    if (trustScore >= 70) {
      level = 'Высокая';
      color = 'success';
      message = 'Объяснение надежно: несколько ключевых признаков явно определяют предсказание.';
    } else if (trustScore >= 50) {
      level = 'Средняя';
      color = 'warning';
      message = 'Объяснение умеренно надежно: влияет несколько признаков, но общая закономерность прослеживается.';
    } else {
      level = 'Низкая';
      color = 'error';
      message = 'Объяснение может быть нестабильным: вклад распределен между многими признаками без явного лидера.';
    }

    return {
      score: trustScore,
      level,
      color,
      message,
      concentration: (concentration * 100).toFixed(1),
      dominantShare: (dominantShare * 100).toFixed(1),
      activeFeatures: activeCount
    };
  };

  const trustInfo = calculateTrustScore();

  const renderTopFactor = (
    feature: string,
    value: unknown,
    idx: number,
    color: 'success' | 'error',
    backgroundColor: string,
    showPositiveSign: boolean
  ) => {
    const contribution = value as number;
    return (
      <Paper key={feature} sx={{ p: 2, mb: 2, bgcolor: backgroundColor }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="body1" fontWeight="bold">
            #{idx + 1} {formatFeatureName(feature)}
          </Typography>
          <Chip
            label={`${showPositiveSign ? '+' : ''}${contribution.toFixed(3)}`}
            size="small"
            color={color}
            sx={{ fontWeight: 'bold' }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary">
          Вклад: {(contribution / totalContributionMagnitude * 100).toFixed(1)}% от общего изменения
        </Typography>
      </Paper>
    );
  };

  const getConsistencyWarnings = () => {
    const warnings = [];

    // Warning 1: High confidence but weak explanation
    if (confidence > 0.8 && trustInfo.score < 50) {
      warnings.push({
        severity: 'warning' as const,
        message: 'Уверенность модели высокая (>80%), но ни один признак не дает убедительного объяснения. Интерпретируйте результат с осторожностью.'
      });
    }

    // Warning 2: Too many features contribute equally
    if (trustInfo.activeFeatures > 15 && parseFloat(trustInfo.dominantShare) < 20) {
      warnings.push({
        severity: 'warning' as const,
        message: 'Многие признаки влияют почти одинаково. Предсказание может быть чувствительно к небольшим изменениям сразу нескольких признаков.'
      });
    }

    // Warning 3: Low confidence
    if (confidence < 0.6) {
      warnings.push({
        severity: 'info' as const,
        message: 'Уверенность модели ниже 60%. Учитывайте это при интерпретации объяснения.'
      });
    }

    return warnings;
  };

  const warnings = getConsistencyWarnings();

  // Format feature name (remove technical prefixes if needed)
  const formatFeatureName = (name: string) => {
    return name.replace('feature_', 'Признак ');
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ my: 4 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/analysis')}
            sx={{ mr: 2 }}
          >
            Вернуться к анализу
          </Button>
          <Typography variant="h4">
            Локальное объяснение LIME
          </Typography>
        </Box>

        {/* Consistency Warnings */}
        {warnings.length > 0 && (
          <Box sx={{ mb: 3 }}>
            {warnings.map((warning, idx) => (
              <Alert key={idx} severity={warning.severity} icon={<WarningIcon />} sx={{ mb: 1 }}>
                {warning.message}
              </Alert>
            ))}
          </Box>
        )}

        {/* Section 1: Prediction Summary - ENHANCED */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={5}>
            <Card sx={{ height: '100%', bgcolor: '#1976d2', color: 'white' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Итоговое предсказание
                </Typography>
                <Typography variant="h2" sx={{ my: 2, fontWeight: 'bold' }}>
                  Класс {predictedClass}
                </Typography>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Уверенность: {(confidence * 100).toFixed(1)}%
                </Typography>

                <Divider sx={{ my: 2, bgcolor: 'rgba(255,255,255,0.3)' }} />

                <Typography variant="subtitle2" gutterBottom sx={{ opacity: 0.9 }}>
                  Распределение вероятностей
                </Typography>
                {predictionProba.map((prob: number, idx: number) => (
                  <Box key={idx} sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">Класс {idx}</Typography>
                      <Typography variant="body2" fontWeight="bold">{(prob * 100).toFixed(1)}%</Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={prob * 100}
                      sx={{
                        height: 8,
                        borderRadius: 1,
                        bgcolor: 'rgba(255,255,255,0.3)',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: idx === predictedClass ? '#4caf50' : 'rgba(255,255,255,0.7)'
                        }
                      }}
                    />
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card sx={{ height: '100%', bgcolor: '#f5f5f5' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Структура предсказания
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Как модель пришла к итоговому предсказанию
                </Typography>

                <Box sx={{ mt: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="body1">Базовая вероятность</Typography>
                    <Chip label={`${(baselineProbability * 100).toFixed(1)}%`} size="small" />
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <TrendingUpIcon sx={{ color: 'success.main', mr: 1 }} />
                    <Typography variant="body1" sx={{ flexGrow: 1 }}>Положительные вклады</Typography>
                    <Typography variant="body1" color="success.main" fontWeight="bold">
                      +{(positiveContribution * 100).toFixed(1)}%
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <TrendingDownIcon sx={{ color: 'error.main', mr: 1 }} />
                    <Typography variant="body1" sx={{ flexGrow: 1 }}>Отрицательные вклады</Typography>
                    <Typography variant="body1" color="error.main" fontWeight="bold">
                      {(negativeContribution * 100).toFixed(1)}%
                    </Typography>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight="bold">Итоговая вероятность</Typography>
                    <Typography variant="h5" color="primary" fontWeight="bold">
                      {(confidence * 100).toFixed(1)}%
                    </Typography>
                  </Box>

                  <Box sx={{ mt: 2, p: 2, bgcolor: 'white', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Изменение относительно базового уровня: {totalContribution >= 0 ? '+' : ''}{(totalContribution * 100).toFixed(1)}%
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Section 2: Top Factors - IMPROVED */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%', borderLeft: '4px solid #4caf50' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                  <ThumbUpIcon sx={{ mr: 1, color: 'success.main' }} />
                  Главные положительные факторы
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Признаки, повысившие оценку предсказания
                </Typography>
                {positiveFeatures.slice(0, 3).map(([feature, value], idx) =>
                  renderTopFactor(feature, value, idx, 'success', 'rgba(76, 175, 80, 0.1)', true)
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%', borderLeft: '4px solid #f44336' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                  <ThumbDownIcon sx={{ mr: 1, color: 'error.main' }} />
                  Главные отрицательные факторы
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Признаки, снизившие оценку предсказания
                </Typography>
                {negativeFeatures.slice(0, 3).map(([feature, value], idx) =>
                  renderTopFactor(feature, value, idx, 'error', 'rgba(244, 67, 54, 0.1)', false)
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Section 3: Plain English Explanation - ENHANCED */}
        <Card sx={{ mb: 3, bgcolor: '#e3f2fd', borderLeft: '4px solid #1976d2' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
              <InfoIcon sx={{ mr: 1 }} />
              Почему получено такое предсказание?
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.8, fontSize: '1.05rem' }}>
              {generateExplanation()}
            </Typography>
          </CardContent>
        </Card>

        {/* Section 4: Feature Contributions Chart - IMPROVED */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Box>
                <Typography variant="h6" fontWeight="bold">
                  Вклады признаков
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <span style={{ color: '#4caf50', fontWeight: 'bold' }}>Зеленый</span> повышает предсказание • <span style={{ color: '#f44336', fontWeight: 'bold' }}>Красный</span> понижает предсказание
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ mr: 2 }}>Показать:</Typography>
                <Button size="small" onClick={() => setShowTopN(5)} variant={showTopN === 5 ? 'contained' : 'outlined'}>5</Button>
                <Button size="small" onClick={() => setShowTopN(10)} variant={showTopN === 10 ? 'contained' : 'outlined'} sx={{ mx: 1 }}>10</Button>
                <Button size="small" onClick={() => setShowTopN(-1)} variant={showTopN === -1 ? 'contained' : 'outlined'}>Все</Button>
              </Box>
            </Box>

            {results.visualizations?.lime_bar_chart && (
              <Plot
                data={results.visualizations.lime_bar_chart.data}
                layout={{
                  ...results.visualizations.lime_bar_chart.layout,
                  title: { text: 'Вклады признаков по LIME' },
                  xaxis: {
                    ...results.visualizations.lime_bar_chart.layout?.xaxis,
                    title: { text: 'Вклад' },
                  },
                  yaxis: {
                    ...results.visualizations.lime_bar_chart.layout?.yaxis,
                    title: { text: 'Признаки' },
                  },
                  height: Math.max(400, displayedFeatures.length * 30),
                  shapes: [{
                    type: 'line',
                    x0: 0,
                    x1: 0,
                    y0: -0.5,
                    y1: displayedFeatures.length - 0.5,
                    line: {
                      color: '#666',
                      width: 2,
                      dash: 'dash'
                    }
                  }]
                }}
                config={{ ...russianPlotlyConfig, responsive: true }}
                style={{ width: '100%' }}
              />
            )}
          </CardContent>
        </Card>

        {/* Section 5: Instance Data Table - ENHANCED */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Подробный анализ признаков
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Полная информация о признаках и их вкладах
            </Typography>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell><strong>Место</strong></TableCell>
                    <TableCell><strong>Признак</strong></TableCell>
                    <TableCell align="right"><strong>Вклад</strong></TableCell>
                    <TableCell align="right"><strong>% от общего</strong></TableCell>
                    <TableCell align="center"><strong>Влияние</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayedFeatures.map(([feature, contribution], idx) => {
                    const isPositive = (contribution as number) > 0;
                    const percentOfTotal = ((contribution as number) / Math.abs(totalContribution) * 100).toFixed(1);
                    return (
                      <TableRow
                        key={feature}
                        sx={{
                          bgcolor: isPositive ? 'rgba(76, 175, 80, 0.08)' : 'rgba(244, 67, 54, 0.08)',
                          '&:hover': { bgcolor: isPositive ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)' }
                        }}
                      >
                        <TableCell>
                          <Chip label={`#${idx + 1}`} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {formatFeatureName(feature)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            color={isPositive ? 'success.main' : 'error.main'}
                            fontWeight="bold"
                          >
                            {isPositive ? '+' : ''}{(contribution as number).toFixed(4)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="text.secondary">
                            {percentOfTotal}%
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={isPositive ? 'Положительное' : 'Отрицательное'}
                            size="small"
                            color={isPositive ? 'success' : 'error'}
                            icon={isPositive ? <TrendingUpIcon /> : <TrendingDownIcon />}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        {/* Section 6: Trust/Reliability - ENHANCED */}
        <Card sx={{ mb: 3, borderTop: '3px solid #ff9800' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Оценка надежности объяснения
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Насколько можно доверять этому объяснению?
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 3, textAlign: 'center', bgcolor: '#f5f5f5' }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Оценка надежности</Typography>
                  <Typography variant="h2" color={trustInfo.color} fontWeight="bold">
                    {trustInfo.score}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">из 100</Typography>
                  <Box sx={{ mt: 2 }}>
                    <Chip
                      label={trustInfo.level}
                      color={trustInfo.color}
                      sx={{ fontWeight: 'bold' }}
                    />
                  </Box>
                </Paper>
              </Grid>

              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Активные признаки</Typography>
                  <Typography variant="h3" color="primary" fontWeight="bold">
                    {trustInfo.activeFeatures}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    из {Object.keys(featureImportance).length}
                  </Typography>
                </Paper>
              </Grid>

              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Доля трех лидеров</Typography>
                  <Typography variant="h3" color="primary" fontWeight="bold">
                    {trustInfo.concentration}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    от общего вклада
                  </Typography>
                </Paper>
              </Grid>

              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Ведущий признак</Typography>
                  <Typography variant="h3" color="primary" fontWeight="bold">
                    {trustInfo.dominantShare}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    доля одного признака
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            <Alert severity={trustInfo.color} sx={{ mt: 3 }} icon={<InfoIcon />}>
              <Typography variant="body2" fontWeight="medium">
                {trustInfo.message}
              </Typography>
            </Alert>
          </CardContent>
        </Card>

        {/* Section 7: What-If Analysis - INTERACTIVE */}
        <Card sx={{ mb: 3, borderTop: '3px solid #9c27b0' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Анализ «что, если»
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Изменяйте самые влиятельные признаки и наблюдайте, как они воздействуют на предсказание модели.
              Это помогает оценить чувствительность модели и границы принятия решений.
            </Typography>

            <Grid container spacing={3}>
              {/* Left side: Feature Controls */}
              <Grid item xs={12} md={7}>
                <Paper sx={{ p: 3, bgcolor: '#fafafa' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      Настройка главных признаков
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        const resetValues: any = {};
                        sortedFeatures.slice(0, 5).forEach(([feature]) => {
                          resetValues[feature] = 50; // Reset to middle (current value)
                        });
                        setWhatIfValues(resetValues);
                      }}
                    >
                      Сбросить все
                    </Button>
                  </Box>

                  {sortedFeatures.slice(0, 5).map(([feature, contribution]) => {
                    const currentValue = whatIfValues[feature] || 50;
                    const isPositive = (contribution as number) > 0;
                    const sensitivity = Math.abs(contribution as number) > 0.1 ? 'Высокое' :
                                       Math.abs(contribution as number) > 0.05 ? 'Среднее' : 'Низкое';
                    const sensitivityColor = sensitivity === 'Высокое' ? 'error' :
                                            sensitivity === 'Среднее' ? 'warning' : 'success';
                    const sensitivityDescription = sensitivity === 'Высокое'
                      ? 'небольшие изменения заметно влияют на предсказание'
                      : sensitivity === 'Среднее'
                        ? 'умеренное влияние на предсказание'
                        : 'слабое влияние на предсказание';

                    return (
                      <Box key={feature} sx={{ mb: 4, pb: 3, borderBottom: '1px solid #e0e0e0' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body1" fontWeight="medium">
                              {formatFeatureName(feature)}
                            </Typography>
                            <Chip
                              label={isPositive ? 'Положительное' : 'Отрицательное'}
                              size="small"
                              color={isPositive ? 'success' : 'error'}
                              sx={{ height: 20 }}
                            />
                          </Box>
                          <Tooltip title={`${sensitivity} влияние: ${sensitivityDescription}`}>
                            <Chip
                              label={`${sensitivity} влияние`}
                              size="small"
                              color={sensitivityColor}
                              variant="outlined"
                              sx={{ height: 20 }}
                            />
                          </Tooltip>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Slider
                            value={currentValue}
                            onChange={(_, newValue) => {
                              setWhatIfValues({
                                ...whatIfValues,
                                [feature]: newValue as number
                              });
                            }}
                            min={0}
                            max={100}
                            marks={[
                              { value: 0, label: 'Мин.' },
                              { value: 50, label: 'Текущее' },
                              { value: 100, label: 'Макс.' }
                            ]}
                            sx={{
                              flexGrow: 1,
                              '& .MuiSlider-markLabel': { fontSize: '0.7rem' },
                              '& .MuiSlider-thumb': {
                                width: 20,
                                height: 20,
                              }
                            }}
                          />
                          <TextField
                            value={currentValue}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setWhatIfValues({
                                ...whatIfValues,
                                [feature]: Math.max(0, Math.min(100, val))
                              });
                            }}
                            type="number"
                            size="small"
                            sx={{ width: 70 }}
                            inputProps={{ min: 0, max: 100 }}
                          />
                        </Box>

                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          Исходный вклад: {isPositive ? '+' : ''}{(contribution as number).toFixed(3)}
                        </Typography>
                      </Box>
                    );
                  })}
                </Paper>
              </Grid>

              {/* Right side: Live Prediction */}
              <Grid item xs={12} md={5}>
                <Paper sx={{ p: 3, bgcolor: '#f3e5f5', position: 'sticky', top: 20 }}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Предсказание в реальном времени
                  </Typography>

                  {(() => {
                    // Calculate simulated prediction change based on slider movements
                    let predictionDelta = 0;
                    sortedFeatures.slice(0, 5).forEach(([feature, contribution]) => {
                      const currentSliderValue = whatIfValues[feature] || 50;
                      const deviation = (currentSliderValue - 50) / 50; // -1 to +1
                      predictionDelta += (contribution as number) * deviation * 0.5; // Scale factor
                    });

                    const newProbability = Math.max(0, Math.min(1, confidence + predictionDelta));
                    const probabilityChange = newProbability - confidence;
                    const newPredictedClass = newProbability > 0.5 ? 1 : 0;
                    const classChanged = newPredictedClass !== predictedClass;

                    return (
                      <>
                        <Box sx={{ mb: 3, p: 2, bgcolor: 'white', borderRadius: 1 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Новое предсказание
                          </Typography>
                          <Typography variant="h3" color="primary" fontWeight="bold">
                            {(newProbability * 100).toFixed(1)}%
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Класс {newPredictedClass}
                          </Typography>
                        </Box>

                        <Box sx={{ mb: 3, p: 2, bgcolor: 'white', borderRadius: 1 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Изменение относительно исходного
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {probabilityChange > 0 ? (
                              <TrendingUpIcon sx={{ color: 'success.main', fontSize: 32 }} />
                            ) : probabilityChange < 0 ? (
                              <TrendingDownIcon sx={{ color: 'error.main', fontSize: 32 }} />
                            ) : null}
                            <Typography
                              variant="h4"
                              color={probabilityChange > 0 ? 'success.main' : probabilityChange < 0 ? 'error.main' : 'text.primary'}
                              fontWeight="bold"
                            >
                              {probabilityChange > 0 ? '+' : ''}{(probabilityChange * 100).toFixed(1)}%
                            </Typography>
                          </Box>
                        </Box>

                        <Box sx={{ mb: 3, p: 2, bgcolor: 'white', borderRadius: 1 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Класс изменился?
                          </Typography>
                          <Chip
                            label={classChanged ? 'Да' : 'Нет'}
                            color={classChanged ? 'warning' : 'success'}
                            sx={{ fontWeight: 'bold', fontSize: '1rem' }}
                          />
                          {classChanged && (
                            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                              Предсказанный класс изменился с {predictedClass} на {newPredictedClass}
                            </Typography>
                          )}
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        <Box sx={{ p: 2, bgcolor: 'white', borderRadius: 1 }}>
                          <Typography variant="body2" fontWeight="bold" gutterBottom>
                            Сравнение
                          </Typography>
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" color="text.secondary">Исходное</Typography>
                            <LinearProgress
                              variant="determinate"
                              value={confidence * 100}
                              sx={{
                                height: 12,
                                borderRadius: 1,
                                bgcolor: '#e0e0e0',
                                '& .MuiLinearProgress-bar': { bgcolor: '#1976d2' }
                              }}
                            />
                            <Typography variant="caption">{(confidence * 100).toFixed(1)}%</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Измененное</Typography>
                            <LinearProgress
                              variant="determinate"
                              value={newProbability * 100}
                              sx={{
                                height: 12,
                                borderRadius: 1,
                                bgcolor: '#e0e0e0',
                                '& .MuiLinearProgress-bar': {
                                  bgcolor: probabilityChange > 0 ? '#4caf50' : probabilityChange < 0 ? '#f44336' : '#1976d2'
                                }
                              }}
                            />
                            <Typography variant="caption">{(newProbability * 100).toFixed(1)}%</Typography>
                          </Box>
                        </Box>

                        <Alert severity="info" sx={{ mt: 2 }}>
                          <Typography variant="caption">
                            Это упрощенная симуляция. Реальное поведение модели может отличаться.
                            Перемещайте ползунки, чтобы изучить влияние признаков на предсказание.
                          </Typography>
                        </Alert>
                      </>
                    );
                  })()}
                </Paper>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Metrics if available */}
        {results.visualizations?.metrics && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom fontWeight="bold">
                Метрики качества модели
              </Typography>
              <Grid container spacing={2}>
                {Object.entries(results.visualizations.metrics).map(([key, value]) => (
                  <Grid item xs={6} sm={4} md={2.4} key={key}>
                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#f5f5f5' }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {formatMetricName(key)}
                      </Typography>
                      <Typography variant="h5" color="primary" fontWeight="bold">
                        {(value as number).toFixed(4)}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        )}
      </Box>
    </Container>
  );
};

export default LimeResultsPage;
