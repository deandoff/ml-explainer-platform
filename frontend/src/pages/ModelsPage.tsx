import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Container,
  Typography,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import api, { modelsAPI } from '../api';
import { formatStatus } from '../utils/localization';

interface Model {
  id: string;
  name: string;
  description: string;
  model_type: string;
  status: string;
  file_size: number;
  created_at: string;
}

const ModelsPage: React.FC = () => {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [modelName, setModelName] = useState('');
  const [modelDescription, setModelDescription] = useState('');
  const [modelType, setModelType] = useState('sklearn');

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    setLoading(true);
    try {
      const response = await modelsAPI.listModels();
      setModels(response.data);
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !modelName) {
      alert('Укажите название модели и выберите файл');
      return;
    }

    setLoading(true);
    try {
      const urlResponse = await modelsAPI.getUploadUrl(modelType);
      const { upload_url, s3_key } = urlResponse.data;

      // Upload file using axios with FormData
      const formData = new FormData();
      formData.append('file', uploadFile);

      if (upload_url.startsWith('/')) {
        await api.post(upload_url, formData);
      } else {
        await axios.post(upload_url, formData);
      }

      await modelsAPI.createModel({
        name: modelName,
        description: modelDescription,
        model_type: modelType,
        s3_key: s3_key,
      });

      alert('Модель успешно загружена');
      setOpenDialog(false);
      resetForm();
      loadModels();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Не удалось загрузить модель');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Удалить эту модель?')) {
      return;
    }

    try {
      await modelsAPI.deleteModel(id);
      loadModels();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Не удалось удалить модель');
    }
  };

  const handleDownload = async (id: string) => {
    try {
      const response = await modelsAPI.downloadModel(id);
      const { download_url, filename } = response.data;

      // Local storage is served through the authenticated application API.
      if (download_url.startsWith('/')) {
        const fileResponse = await api.get(download_url, {
          responseType: 'blob',
        });

        const blob = new Blob([fileResponse.data]);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'model.pkl';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        // For S3, open presigned URL directly
        window.open(download_url, '_blank');
      }
    } catch (error) {
      console.error('Download failed:', error);
      alert('Не удалось скачать модель');
    }
  };

  const resetForm = () => {
    setModelName('');
    setModelDescription('');
    setModelType('sklearn');
    setUploadFile(null);
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h4">Модели</Typography>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => setOpenDialog(true)}
          >
            Загрузить модель
          </Button>
        </Box>

        {loading && <CircularProgress />}

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Размер</TableCell>
                <TableCell>Дата создания</TableCell>
                <TableCell>Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>{model.name}</TableCell>
                  <TableCell>{model.model_type}</TableCell>
                  <TableCell>{formatStatus(model.status)}</TableCell>
                  <TableCell>
                    {model.file_size ? `${(model.file_size / 1024 / 1024).toFixed(2)} МБ` : 'Нет данных'}
                  </TableCell>
                  <TableCell>{new Date(model.created_at).toLocaleDateString('ru-RU')}</TableCell>
                  <TableCell>
                    <IconButton
                      onClick={() => handleDownload(model.id)}
                      color="primary"
                      aria-label={`Скачать модель ${model.name}`}
                    >
                      <DownloadIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => handleDelete(model.id)}
                      color="error"
                      aria-label={`Удалить модель ${model.name}`}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Загрузка модели</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <TextField
                label="Название модели"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                fullWidth
                required
              />
              <TextField
                label="Описание"
                value={modelDescription}
                onChange={(e) => setModelDescription(e.target.value)}
                fullWidth
                multiline
                rows={3}
              />
              <FormControl fullWidth>
                <InputLabel>Тип модели</InputLabel>
                <Select
                  value={modelType}
                  label="Тип модели"
                  onChange={(e) => setModelType(e.target.value)}
                >
                  <MenuItem value="sklearn">Scikit-learn</MenuItem>
                  <MenuItem value="xgboost">XGBoost</MenuItem>
                  <MenuItem value="lightgbm">LightGBM</MenuItem>
                  <MenuItem value="catboost">CatBoost</MenuItem>
                  <MenuItem value="pytorch">PyTorch</MenuItem>
                  <MenuItem value="tensorflow">TensorFlow</MenuItem>
                  <MenuItem value="onnx">ONNX</MenuItem>
                </Select>
              </FormControl>
              <Button variant="outlined" component="label">
                Выбрать файл
                <input
                  type="file"
                  hidden
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </Button>
              {uploadFile && <Typography variant="body2">{uploadFile.name}</Typography>}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Отмена</Button>
            <Button onClick={handleUpload} variant="contained" disabled={loading}>
              Загрузить
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
};

export default ModelsPage;
