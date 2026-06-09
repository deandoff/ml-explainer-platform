const statusLabels: Record<string, string> = {
  pending: 'Ожидает запуска',
  running: 'Выполняется',
  processing: 'Обрабатывается',
  completed: 'Завершен',
  ready: 'Готова',
  failed: 'Ошибка',
  uploaded: 'Загружена',
};

const metricLabels: Record<string, string> = {
  accuracy: 'Точность',
  precision: 'Точность положительных ответов',
  recall: 'Полнота',
  f1: 'F1-мера',
  f1_score: 'F1-мера',
  roc_auc: 'ROC AUC',
  mse: 'Среднеквадратичная ошибка',
  rmse: 'Корень среднеквадратичной ошибки',
  mae: 'Средняя абсолютная ошибка',
  r2: 'Коэффициент R²',
};

export const formatStatus = (status: string): string =>
  statusLabels[status.toLowerCase()] ?? status;

export const formatMetricName = (metric: string): string =>
  metricLabels[metric.toLowerCase()] ?? metric.replaceAll('_', ' ');
