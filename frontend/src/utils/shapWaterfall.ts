export interface ShapContribution {
  feature: string;
  shap_value: number;
}

export interface WaterfallContribution extends ShapContribution {
  start: number;
  end: number;
}

const ADDITIVITY_TOLERANCE = 1e-9;

export const buildCompleteWaterfall = (
  features: ShapContribution[],
  baseValue: number,
  prediction: number,
  maxFeatures = 10
): WaterfallContribution[] => {
  const sortedFeatures = [...features]
    .sort((left, right) => Math.abs(right.shap_value) - Math.abs(left.shap_value));
  const expectedContribution = prediction - baseValue;
  const suppliedContribution = sortedFeatures.reduce(
    (total, feature) => total + feature.shap_value,
    0
  );
  const hasHiddenContributions =
    Math.abs(suppliedContribution - expectedContribution) > ADDITIVITY_TOLERANCE;
  const needsRemainder =
    sortedFeatures.length > maxFeatures || hasHiddenContributions;
  const visibleFeatureCount = needsRemainder
    ? Math.max(maxFeatures - 1, 0)
    : maxFeatures;
  const displayedFeatures = sortedFeatures.slice(0, visibleFeatureCount);

  if (needsRemainder) {
    const visibleContribution = displayedFeatures.reduce(
      (total, feature) => total + feature.shap_value,
      0
    );
    displayedFeatures.push({
      feature: 'Остальные признаки',
      shap_value: expectedContribution - visibleContribution
    });
  }

  let cumulative = baseValue;
  return displayedFeatures.map((feature) => {
    const start = cumulative;
    cumulative += feature.shap_value;

    return {
      ...feature,
      start,
      end: cumulative
    };
  });
};
