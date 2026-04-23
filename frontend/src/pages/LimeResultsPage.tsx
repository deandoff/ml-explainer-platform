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
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import InfoIcon from '@mui/icons-material/Info';
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

      // Extract instance data from first explanation
      if (response.data.instance_explanations?.[0]) {
        const firstInstance = response.data.instance_explanations[0];
        setInstanceData(firstInstance);

        // Initialize what-if values with current instance
        const initialValues: any = {};
        Object.keys(firstInstance.explanation.feature_importance).forEach(feature => {
          initialValues[feature] = 0; // Will be populated from actual data
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
    .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))
    .slice(0, showTopN);

  const positiveFeatures = sortedFeatures.filter(([, value]) => (value as number) > 0);
  const negativeFeatures = sortedFeatures.filter(([, value]) => (value as number) < 0);

  // Generate plain English explanation
  const generateExplanation = () => {
    const topPositive = positiveFeatures[0];
    const topNegative = negativeFeatures[0];
    const predictedClass = predictionProba.indexOf(Math.max(...predictionProba));
    const confidence = (Math.max(...predictionProba) * 100).toFixed(1);

    let explanation = `The model predicted class ${predictedClass} with ${confidence}% confidence. `;

    if (topPositive) {
      explanation += `The main positive factor is ${topPositive[0]} (contribution: +${(topPositive[1] as number).toFixed(3)}). `;
    }

    if (topNegative) {
      explanation += `However, ${topNegative[0]} has a negative impact (contribution: ${(topNegative[1] as number).toFixed(3)}). `;
    }

    const nonZeroCount = Object.values(featureImportance).filter(v => Math.abs(v as number) > 0.001).length;
    explanation += `In total, ${nonZeroCount} features contributed to this prediction.`;

    return explanation;
  };

  // Calculate trust score (simplified)
  const calculateTrustScore = () => {
    const totalContribution = Object.values(featureImportance).reduce((sum, val) => sum + Math.abs(val as number), 0);
    const topContribution = sortedFeatures.slice(0, 3).reduce((sum, [, val]) => sum + Math.abs(val as number), 0);
    const concentration = topContribution / totalContribution;

    if (concentration > 0.7) return { score: 'High', color: 'success', message: 'Top features clearly dominate the prediction' };
    if (concentration > 0.4) return { score: 'Medium', color: 'warning', message: 'Multiple features contribute, explanation is moderately reliable' };
    return { score: 'Low', color: 'error', message: 'Contribution is spread across many features, interpretation may be unstable' };
  };

  const trustInfo = calculateTrustScore();

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

        {/* Section 1: Prediction Summary */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%', bgcolor: '#f5f5f5' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Prediction
                </Typography>
                <Typography variant="h3" color="primary" sx={{ my: 2 }}>
                  Class {predictionProba.indexOf(Math.max(...predictionProba))}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Confidence: {(Math.max(...predictionProba) * 100).toFixed(1)}%
                </Typography>
                <Box sx={{ mt: 2 }}>
                  {predictionProba.map((prob: number, idx: number) => (
                    <Box key={idx} sx={{ mb: 1 }}>
                      <Typography variant="caption">Class {idx}: {(prob * 100).toFixed(1)}%</Typography>
                      <Box sx={{ width: '100%', bgcolor: '#e0e0e0', borderRadius: 1, height: 8 }}>
                        <Box sx={{ width: `${prob * 100}%`, bgcolor: 'primary.main', height: 8, borderRadius: 1 }} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <ThumbUpIcon sx={{ mr: 1, color: 'success.main' }} />
                  Top Positive Factors
                </Typography>
                {positiveFeatures.slice(0, 3).map(([feature, value]) => (
                  <Box key={feature} sx={{ mb: 1 }}>
                    <Typography variant="body2" fontWeight="bold">{feature}</Typography>
                    <Typography variant="caption" color="success.main">
                      +{(value as number).toFixed(3)}
                    </Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                  <ThumbDownIcon sx={{ mr: 1, color: 'error.main' }} />
                  Top Negative Factors
                </Typography>
                {negativeFeatures.slice(0, 3).map(([feature, value]) => (
                  <Box key={feature} sx={{ mb: 1 }}>
                    <Typography variant="body2" fontWeight="bold">{feature}</Typography>
                    <Typography variant="caption" color="error.main">
                      {(value as number).toFixed(3)}
                    </Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Section 2: Plain English Explanation */}
        <Card sx={{ mb: 3, bgcolor: '#e3f2fd' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <InfoIcon sx={{ mr: 1 }} />
              Explanation in Plain English
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.8 }}>
              {generateExplanation()}
            </Typography>
          </CardContent>
        </Card>

        {/* Section 3: Feature Importance Chart */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Feature Contributions
              </Typography>
              <Box>
                <Typography variant="caption" sx={{ mr: 2 }}>Show top:</Typography>
                <Button size="small" onClick={() => setShowTopN(5)} variant={showTopN === 5 ? 'contained' : 'outlined'}>5</Button>
                <Button size="small" onClick={() => setShowTopN(10)} variant={showTopN === 10 ? 'contained' : 'outlined'} sx={{ mx: 1 }}>10</Button>
                <Button size="small" onClick={() => setShowTopN(20)} variant={showTopN === 20 ? 'contained' : 'outlined'}>20</Button>
              </Box>
            </Box>

            <Typography variant="body2" color="text.secondary" paragraph>
              Green bars show features that increase the prediction, red bars show features that decrease it.
            </Typography>

            {results.visualizations?.lime_bar_chart && (
              <Plot
                data={results.visualizations.lime_bar_chart.data}
                layout={{
                  ...results.visualizations.lime_bar_chart.layout,
                  height: 400,
                }}
                config={{ responsive: true }}
                style={{ width: '100%' }}
              />
            )}
          </CardContent>
        </Card>

        {/* Section 4: Instance Data Table */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Instance Feature Values
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              The actual values of features for this specific prediction, along with their contribution.
            </Typography>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Feature</strong></TableCell>
                    <TableCell align="right"><strong>Value</strong></TableCell>
                    <TableCell align="right"><strong>Contribution</strong></TableCell>
                    <TableCell align="center"><strong>Impact</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedFeatures.map(([feature, contribution]) => {
                    const isPositive = (contribution as number) > 0;
                    return (
                      <TableRow
                        key={feature}
                        sx={{
                          bgcolor: isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)'
                        }}
                      >
                        <TableCell>{feature}</TableCell>
                        <TableCell align="right">-</TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            color={isPositive ? 'success.main' : 'error.main'}
                            fontWeight="bold"
                          >
                            {isPositive ? '+' : ''}{(contribution as number).toFixed(3)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            label={isPositive ? 'Positive' : 'Negative'}
                            size="small"
                            color={isPositive ? 'success' : 'error'}
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

        {/* Section 5: Trust/Reliability */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Explanation Reliability
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Trust Score</Typography>
                  <Chip
                    label={trustInfo.score}
                    color={trustInfo.color as any}
                    sx={{ mt: 1, fontSize: '1.1rem', fontWeight: 'bold' }}
                  />
                </Paper>
              </Grid>
              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Active Features</Typography>
                  <Typography variant="h5" sx={{ mt: 1 }}>
                    {Object.values(featureImportance).filter(v => Math.abs(v as number) > 0.001).length}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={4}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">Total Features</Typography>
                  <Typography variant="h5" sx={{ mt: 1 }}>
                    {Object.keys(featureImportance).length}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
            <Alert severity={trustInfo.color as any} sx={{ mt: 2 }}>
              {trustInfo.message}
            </Alert>
          </CardContent>
        </Card>

        {/* Section 6: What-If Analysis (Placeholder) */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              What-If Analysis (Coming Soon)
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Adjust feature values to see how they would affect the prediction. This feature will allow you to explore different scenarios.
            </Typography>
            <Alert severity="info">
              Interactive what-if analysis will be available in the next update. You'll be able to modify top features and see real-time prediction changes.
            </Alert>
          </CardContent>
        </Card>

        {/* Metrics if available */}
        {results.visualizations?.metrics && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Model Performance Metrics
              </Typography>
              <Grid container spacing={2}>
                {Object.entries(results.visualizations.metrics).map(([key, value]) => (
                  <Grid item xs={6} sm={4} md={2.4} key={key}>
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
            </CardContent>
          </Card>
        )}
      </Box>
    </Container>
  );
};

export default LimeResultsPage;
