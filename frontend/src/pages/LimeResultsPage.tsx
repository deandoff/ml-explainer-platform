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
  Stack,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import Plot from 'react-plotly.js';
import { analysesAPI } from '../api';

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
          <Alert severity="error">Failed to load analysis results</Alert>
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

  // Generate improved plain English explanation
  const generateExplanation = () => {
    const topPositive = positiveFeatures.slice(0, 2);
    const topNegative = negativeFeatures.slice(0, 2);

    let explanation = `The model predicted Class ${predictedClass} with ${(confidence * 100).toFixed(1)}% confidence. `;

    if (topPositive.length > 0) {
      const mainFactors = topPositive.map(([name]) => name).join(' and ');
      explanation += `This prediction is primarily driven by ${mainFactors}, which strongly increased the likelihood. `;
    }

    if (topNegative.length > 0) {
      const negativeFactors = topNegative.map(([name]) => name).join(' and ');
      explanation += `Although ${negativeFactors} had a negative impact, `;

      if (Math.abs(negativeContribution) < positiveContribution * 0.5) {
        explanation += `their influence was not strong enough to change the outcome. `;
      } else {
        explanation += `they significantly reduced the prediction score. `;
      }
    }

    const nonZeroCount = Object.values(featureImportance).filter(v => Math.abs(v as number) > 0.001).length;
    explanation += `In total, ${nonZeroCount} out of ${Object.keys(featureImportance).length} features actively contributed to this prediction.`;

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

    let level = 'Low';
    let color: 'error' | 'warning' | 'success' = 'error';
    let message = '';

    if (trustScore >= 70) {
      level = 'High';
      color = 'success';
      message = 'The explanation is reliable. A few key features clearly dominate the prediction.';
    } else if (trustScore >= 50) {
      level = 'Medium';
      color = 'warning';
      message = 'The explanation is moderately reliable. Multiple features contribute, but the pattern is clear.';
    } else {
      level = 'Low';
      color = 'error';
      message = 'The explanation may be unstable. Contribution is spread across many features with no clear dominant factor.';
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

  // Check for consistency warnings
  const getConsistencyWarnings = () => {
    const warnings = [];

    // Warning 1: High confidence but weak explanation
    if (confidence > 0.8 && trustInfo.score < 50) {
      warnings.push({
        severity: 'warning' as const,
        message: 'Model confidence is high (>80%), but no single feature strongly explains the prediction. Interpret with caution.'
      });
    }

    // Warning 2: Too many features contribute equally
    if (trustInfo.activeFeatures > 15 && parseFloat(trustInfo.dominantShare) < 20) {
      warnings.push({
        severity: 'warning' as const,
        message: 'Many features contribute equally. The prediction may be sensitive to small changes in multiple features.'
      });
    }

    // Warning 3: Low confidence
    if (confidence < 0.6) {
      warnings.push({
        severity: 'info' as const,
        message: 'Model confidence is below 60%. Consider this when interpreting the explanation.'
      });
    }

    return warnings;
  };

  const warnings = getConsistencyWarnings();

  // Format feature name (remove technical prefixes if needed)
  const formatFeatureName = (name: string) => {
    return name.replace('feature_', 'Feature ');
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
            Back to Analysis
          </Button>
          <Typography variant="h4">
            LIME Local Explanation
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
                  Final Prediction
                </Typography>
                <Typography variant="h2" sx={{ my: 2, fontWeight: 'bold' }}>
                  Class {predictedClass}
                </Typography>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Confidence: {(confidence * 100).toFixed(1)}%
                </Typography>

                <Divider sx={{ my: 2, bgcolor: 'rgba(255,255,255,0.3)' }} />

                <Typography variant="subtitle2" gutterBottom sx={{ opacity: 0.9 }}>
                  Probability Distribution
                </Typography>
                {predictionProba.map((prob: number, idx: number) => (
                  <Box key={idx} sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2">Class {idx}</Typography>
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
                  Prediction Breakdown
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  How the model arrived at the final prediction
                </Typography>

                <Box sx={{ mt: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="body1">Baseline Probability</Typography>
                    <Chip label={`${(baselineProbability * 100).toFixed(1)}%`} size="small" />
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <TrendingUpIcon sx={{ color: 'success.main', mr: 1 }} />
                    <Typography variant="body1" sx={{ flexGrow: 1 }}>Positive Contributions</Typography>
                    <Typography variant="body1" color="success.main" fontWeight="bold">
                      +{(positiveContribution * 100).toFixed(1)}%
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <TrendingDownIcon sx={{ color: 'error.main', mr: 1 }} />
                    <Typography variant="body1" sx={{ flexGrow: 1 }}>Negative Contributions</Typography>
                    <Typography variant="body1" color="error.main" fontWeight="bold">
                      {(negativeContribution * 100).toFixed(1)}%
                    </Typography>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" fontWeight="bold">Final Probability</Typography>
                    <Typography variant="h5" color="primary" fontWeight="bold">
                      {(confidence * 100).toFixed(1)}%
                    </Typography>
                  </Box>

                  <Box sx={{ mt: 2, p: 2, bgcolor: 'white', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Net Change: {totalContribution >= 0 ? '+' : ''}{(totalContribution * 100).toFixed(1)}% from baseline
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
                  Top Positive Factors
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Features that increased the prediction score
                </Typography>
                {positiveFeatures.slice(0, 3).map(([feature, value], idx) => (
                  <Paper key={feature} sx={{ p: 2, mb: 2, bgcolor: 'rgba(76, 175, 80, 0.1)' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="body1" fontWeight="bold">
                        #{idx + 1} {formatFeatureName(feature)}
                      </Typography>
                      <Chip
                        label={`+${(value as number).toFixed(3)}`}
                        size="small"
                        color="success"
                        sx={{ fontWeight: 'bold' }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Contribution: {((value as number) / Math.abs(totalContribution) * 100).toFixed(1)}% of total change
                    </Typography>
                  </Paper>
                ))}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ height: '100%', borderLeft: '4px solid #f44336' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                  <ThumbDownIcon sx={{ mr: 1, color: 'error.main' }} />
                  Top Negative Factors
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Features that decreased the prediction score
                </Typography>
                {negativeFeatures.slice(0, 3).map(([feature, value], idx) => (
                  <Paper key={feature} sx={{ p: 2, mb: 2, bgcolor: 'rgba(244, 67, 54, 0.1)' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="body1" fontWeight="bold">
                        #{idx + 1} {formatFeatureName(feature)}
                      </Typography>
                      <Chip
                        label={`${(value as number).toFixed(3)}`}
                        size="small"
                        color="error"
                        sx={{ fontWeight: 'bold' }}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      Contribution: {((value as number) / Math.abs(totalContribution) * 100).toFixed(1)}% of total change
                    </Typography>
                  </Paper>
                ))}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Section 3: Plain English Explanation - ENHANCED */}
        <Card sx={{ mb: 3, bgcolor: '#e3f2fd', borderLeft: '4px solid #1976d2' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
              <InfoIcon sx={{ mr: 1 }} />
              Why This Prediction?
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
                  Feature Contributions
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <span style={{ color: '#4caf50', fontWeight: 'bold' }}>Green</span> pushes prediction higher • <span style={{ color: '#f44336', fontWeight: 'bold' }}>Red</span> pushes prediction lower
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ mr: 2 }}>Display:</Typography>
                <Button size="small" onClick={() => setShowTopN(5)} variant={showTopN === 5 ? 'contained' : 'outlined'}>Top 5</Button>
                <Button size="small" onClick={() => setShowTopN(10)} variant={showTopN === 10 ? 'contained' : 'outlined'} sx={{ mx: 1 }}>Top 10</Button>
                <Button size="small" onClick={() => setShowTopN(-1)} variant={showTopN === -1 ? 'contained' : 'outlined'}>All</Button>
              </Box>
            </Box>

            {results.visualizations?.lime_bar_chart && (
              <Plot
                data={results.visualizations.lime_bar_chart.data}
                layout={{
                  ...results.visualizations.lime_bar_chart.layout,
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
                config={{ responsive: true }}
                style={{ width: '100%' }}
              />
            )}
          </CardContent>
        </Card>

        {/* Section 5: Instance Data Table - ENHANCED */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom fontWeight="bold">
              Detailed Feature Analysis
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Complete breakdown of all features and their contributions
            </Typography>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell><strong>Rank</strong></TableCell>
                    <TableCell><strong>Feature</strong></TableCell>
                    <TableCell align="right"><strong>Contribution</strong></TableCell>
                    <TableCell align="right"><strong>% of Total</strong></TableCell>
                    <TableCell align="center"><strong>Impact</strong></TableCell>
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
                            label={isPositive ? 'Positive' : 'Negative'}
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
              Explanation Reliability Assessment
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              How much can you trust this explanation?
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 3, textAlign: 'center', bgcolor: '#f5f5f5' }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Trust Score</Typography>
                  <Typography variant="h2" color={trustInfo.color} fontWeight="bold">
                    {trustInfo.score}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">out of 100</Typography>
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
                  <Typography variant="body2" color="text.secondary" gutterBottom>Active Features</Typography>
                  <Typography variant="h3" color="primary" fontWeight="bold">
                    {trustInfo.activeFeatures}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    of {Object.keys(featureImportance).length} total
                  </Typography>
                </Paper>
              </Grid>

              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Top 3 Concentration</Typography>
                  <Typography variant="h3" color="primary" fontWeight="bold">
                    {trustInfo.concentration}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    of total contribution
                  </Typography>
                </Paper>
              </Grid>

              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>Dominant Feature</Typography>
                  <Typography variant="h3" color="primary" fontWeight="bold">
                    {trustInfo.dominantShare}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    single feature share
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
              What-If Analysis
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Adjust the most influential features to see how they affect the model prediction in real time.
              This helps you understand model sensitivity and decision boundaries.
            </Typography>

            <Grid container spacing={3}>
              {/* Left side: Feature Controls */}
              <Grid item xs={12} md={7}>
                <Paper sx={{ p: 3, bgcolor: '#fafafa' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      Adjust Top Features
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
                      Reset All
                    </Button>
                  </Box>

                  {sortedFeatures.slice(0, 5).map(([feature, contribution]) => {
                    const currentValue = whatIfValues[feature] || 50;
                    const isPositive = (contribution as number) > 0;
                    const sensitivity = Math.abs(contribution as number) > 0.1 ? 'High' :
                                       Math.abs(contribution as number) > 0.05 ? 'Medium' : 'Low';
                    const sensitivityColor = sensitivity === 'High' ? 'error' :
                                            sensitivity === 'Medium' ? 'warning' : 'success';

                    return (
                      <Box key={feature} sx={{ mb: 4, pb: 3, borderBottom: '1px solid #e0e0e0' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body1" fontWeight="medium">
                              {formatFeatureName(feature)}
                            </Typography>
                            <Chip
                              label={isPositive ? 'Positive' : 'Negative'}
                              size="small"
                              color={isPositive ? 'success' : 'error'}
                              sx={{ height: 20 }}
                            />
                          </Box>
                          <Tooltip title={`${sensitivity} impact feature - ${sensitivity === 'High' ? 'small changes significantly affect prediction' : sensitivity === 'Medium' ? 'moderate impact on prediction' : 'low impact on prediction'}`}>
                            <Chip
                              label={`${sensitivity} Impact`}
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
                              { value: 0, label: 'Min' },
                              { value: 50, label: 'Current' },
                              { value: 100, label: 'Max' }
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
                          Original contribution: {isPositive ? '+' : ''}{(contribution as number).toFixed(3)}
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
                    Live Prediction
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
                            New Prediction
                          </Typography>
                          <Typography variant="h3" color="primary" fontWeight="bold">
                            {(newProbability * 100).toFixed(1)}%
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Class {newPredictedClass}
                          </Typography>
                        </Box>

                        <Box sx={{ mb: 3, p: 2, bgcolor: 'white', borderRadius: 1 }}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            Change from Original
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
                            Class Changed?
                          </Typography>
                          <Chip
                            label={classChanged ? 'Yes' : 'No'}
                            color={classChanged ? 'warning' : 'success'}
                            sx={{ fontWeight: 'bold', fontSize: '1rem' }}
                          />
                          {classChanged && (
                            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                              Prediction switched from Class {predictedClass} to Class {newPredictedClass}
                            </Typography>
                          )}
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        <Box sx={{ p: 2, bgcolor: 'white', borderRadius: 1 }}>
                          <Typography variant="body2" fontWeight="bold" gutterBottom>
                            Comparison
                          </Typography>
                          <Box sx={{ mb: 2 }}>
                            <Typography variant="caption" color="text.secondary">Original</Typography>
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
                            <Typography variant="caption" color="text.secondary">Modified</Typography>
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
                            This is a simplified simulation. Actual model behavior may differ.
                            Adjust sliders to explore how features influence the prediction.
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
                Model Performance Metrics
              </Typography>
              <Grid container spacing={2}>
                {Object.entries(results.visualizations.metrics).map(([key, value]) => (
                  <Grid item xs={6} sm={4} md={2.4} key={key}>
                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#f5f5f5' }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {key.toUpperCase().replace('_', ' ')}
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
