import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Slider,
  FormControlLabel,
  Checkbox,
  Button,
  Grid,
  Chip,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface FilterState {
  shapRange: [number, number];
  predictionRange: [number, number];
  featureFilters: Record<string, [number, number]>;
  showOutliers: boolean;
  showHighConfidence: boolean;
  showLowConfidence: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  shapData: any;
  onFilterChange: (filters: FilterState) => void;
  activeFiltersCount: number;
}

const FilterPanel: React.FC<Props> = ({
  open,
  onClose,
  shapData,
  onFilterChange,
  activeFiltersCount
}) => {
  // Initialize filter state from data
  const [filters, setFilters] = useState<FilterState>({
    shapRange: [-1, 1],
    predictionRange: [0, 1],
    featureFilters: {},
    showOutliers: false,
    showHighConfidence: false,
    showLowConfidence: false
  });

  // Update ranges when data changes
  useEffect(() => {
    if (shapData?.summary_stats) {
      setFilters(prev => ({
        ...prev,
        shapRange: [
          shapData.summary_stats.shap_range?.min || -1,
          shapData.summary_stats.shap_range?.max || 1
        ],
        predictionRange: [
          shapData.summary_stats.prediction_min || 0,
          shapData.summary_stats.prediction_max || 1
        ]
      }));
    }
  }, [shapData]);

  const handleShapRangeChange = (event: Event, newValue: number | number[]) => {
    const range = newValue as [number, number];
    setFilters(prev => ({ ...prev, shapRange: range }));
  };

  const handlePredictionRangeChange = (event: Event, newValue: number | number[]) => {
    const range = newValue as [number, number];
    setFilters(prev => ({ ...prev, predictionRange: range }));
  };

  const handleFeatureFilterChange = (featureName: string, newValue: number | number[]) => {
    const range = newValue as [number, number];
    setFilters(prev => ({
      ...prev,
      featureFilters: {
        ...prev.featureFilters,
        [featureName]: range
      }
    }));
  };

  const handleCheckboxChange = (field: 'showOutliers' | 'showHighConfidence' | 'showLowConfidence') => {
    setFilters(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleApply = () => {
    onFilterChange(filters);
  };

  const handleReset = () => {
    const resetFilters: FilterState = {
      shapRange: [
        shapData?.summary_stats?.shap_range?.min || -1,
        shapData?.summary_stats?.shap_range?.max || 1
      ],
      predictionRange: [
        shapData?.summary_stats?.prediction_min || 0,
        shapData?.summary_stats?.prediction_max || 1
      ],
      featureFilters: {},
      showOutliers: false,
      showHighConfidence: false,
      showLowConfidence: false
    };
    setFilters(resetFilters);
    onFilterChange(resetFilters);
  };

  // Get top features for filtering
  const topFeatures = shapData?.feature_importance
    ? Object.entries(shapData.feature_importance)
        .sort((a: any, b: any) => b[1].mean_abs_shap - a[1].mean_abs_shap)
        .slice(0, 5)
        .map(([name]) => name)
    : [];

  // Get feature value ranges
  const getFeatureRange = (featureName: string): [number, number] => {
    if (!shapData?.points) return [0, 1];

    const values = shapData.points
      .map((p: any) => p.features[featureName]?.value)
      .filter((v: any) => v !== undefined);

    return [Math.min(...values), Math.max(...values)];
  };

  if (!open) return null;

  return (
    <Paper
      sx={{
        p: 3,
        mb: 3,
        bgcolor: 'rgba(25, 118, 210, 0.04)',
        border: '1px solid',
        borderColor: 'primary.light'
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6">Filters</Typography>
          {activeFiltersCount > 0 && (
            <Chip
              label={`${activeFiltersCount} active`}
              size="small"
              color="primary"
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={<RestartAltIcon />}
            onClick={handleReset}
            size="small"
            disabled={activeFiltersCount === 0}
          >
            Reset
          </Button>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      <Divider sx={{ mb: 3 }} />

      <Grid container spacing={3}>
        {/* SHAP Value Range */}
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" gutterBottom>
            SHAP Value Range
          </Typography>
          <Box sx={{ px: 2, pt: 1 }}>
            <Slider
              value={filters.shapRange}
              onChange={handleShapRangeChange}
              valueLabelDisplay="auto"
              min={shapData?.summary_stats?.shap_range?.min || -1}
              max={shapData?.summary_stats?.shap_range?.max || 1}
              step={0.01}
              marks={[
                { value: shapData?.summary_stats?.shap_range?.min || -1, label: 'Min' },
                { value: 0, label: '0' },
                { value: shapData?.summary_stats?.shap_range?.max || 1, label: 'Max' }
              ]}
            />
            <Typography variant="caption" color="text.secondary">
              {filters.shapRange[0].toFixed(2)} to {filters.shapRange[1].toFixed(2)}
            </Typography>
          </Box>
        </Grid>

        {/* Prediction Range */}
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" gutterBottom>
            Prediction Range
          </Typography>
          <Box sx={{ px: 2, pt: 1 }}>
            <Slider
              value={filters.predictionRange}
              onChange={handlePredictionRangeChange}
              valueLabelDisplay="auto"
              min={shapData?.summary_stats?.prediction_min || 0}
              max={shapData?.summary_stats?.prediction_max || 1}
              step={0.01}
              marks={[
                { value: shapData?.summary_stats?.prediction_min || 0, label: 'Min' },
                { value: shapData?.summary_stats?.prediction_max || 1, label: 'Max' }
              ]}
            />
            <Typography variant="caption" color="text.secondary">
              {filters.predictionRange[0].toFixed(2)} to {filters.predictionRange[1].toFixed(2)}
            </Typography>
          </Box>
        </Grid>

        {/* Feature Filters */}
        <Grid item xs={12}>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">
                Feature Value Filters (Top 5 Features)
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {topFeatures.map((featureName: string) => {
                  const range = getFeatureRange(featureName);
                  const currentRange = filters.featureFilters[featureName] || range;

                  return (
                    <Grid item xs={12} md={6} key={featureName}>
                      <Typography variant="caption" fontWeight={600}>
                        {featureName}
                      </Typography>
                      <Box sx={{ px: 2, pt: 1 }}>
                        <Slider
                          value={currentRange}
                          onChange={(e, v) => handleFeatureFilterChange(featureName, v)}
                          valueLabelDisplay="auto"
                          min={range[0]}
                          max={range[1]}
                          step={(range[1] - range[0]) / 100}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {currentRange[0].toFixed(2)} to {currentRange[1].toFixed(2)}
                        </Typography>
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </AccordionDetails>
          </Accordion>
        </Grid>

        {/* Quick Filters */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom>
            Quick Filters
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={filters.showOutliers}
                  onChange={() => handleCheckboxChange('showOutliers')}
                />
              }
              label="Show only outliers"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={filters.showHighConfidence}
                  onChange={() => handleCheckboxChange('showHighConfidence')}
                />
              }
              label="High confidence (>0.8)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={filters.showLowConfidence}
                  onChange={() => handleCheckboxChange('showLowConfidence')}
                />
              }
              label="Low confidence (<0.5)"
            />
          </Box>
        </Grid>
      </Grid>

      {/* Apply Button */}
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          onClick={handleApply}
          size="large"
        >
          Apply Filters
        </Button>
      </Box>
    </Paper>
  );
};

export default FilterPanel;
