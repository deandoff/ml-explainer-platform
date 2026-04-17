import React from 'react';
import { Container, Typography, Paper, Box, Grid, Card, CardContent } from '@mui/material';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import DatasetIcon from '@mui/icons-material/Dataset';
import AnalyticsIcon from '@mui/icons-material/Analytics';

const HomePage: React.FC = () => {
  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom align="center">
          ML Explainer Platform
        </Typography>
        <Typography variant="h6" align="center" color="text.secondary" paragraph>
          Объясняйте решения моделей машинного обучения с помощью SHAP и LIME
        </Typography>

        <Grid container spacing={3} sx={{ mt: 4 }}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <ModelTrainingIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                  <Typography variant="h5">Модели</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Загружайте модели sklearn, XGBoost, PyTorch, TensorFlow и ONNX для анализа
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <DatasetIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                  <Typography variant="h5">Датасеты</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Загружайте наборы данных в формате CSV для объяснения предсказаний
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <AnalyticsIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                  <Typography variant="h5">Анализ</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Используйте SHAP и LIME для интерпретации решений моделей
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Paper sx={{ p: 3, mt: 4 }}>
          <Typography variant="h5" gutterBottom>
            Возможности платформы
          </Typography>
          <Typography variant="body1" paragraph>
            • Поддержка множества ML-фреймворков (sklearn, XGBoost, PyTorch, TensorFlow, ONNX)
          </Typography>
          <Typography variant="body1" paragraph>
            • Объяснение предсказаний с помощью SHAP (глобальная и локальная важность признаков)
          </Typography>
          <Typography variant="body1" paragraph>
            • Объяснение предсказаний с помощью LIME (локальная аппроксимация)
          </Typography>
          <Typography variant="body1" paragraph>
            • Интерактивная визуализация результатов анализа
          </Typography>
          <Typography variant="body1">
            • Асинхронная обработка тяжелых вычислений
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default HomePage;
