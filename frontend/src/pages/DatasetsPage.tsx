import React, { useState, useEffect } from 'react';
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
  CircularProgress,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import { datasetsAPI, downloadPrivateFile, uploadFile as uploadToTarget } from '../api';

interface Dataset {
  id: string;
  name: string;
  description: string;
  file_size: number;
  num_rows: number;
  num_features: number;
  created_at: string;
}

const DatasetsPage: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [datasetDescription, setDatasetDescription] = useState('');

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    setLoading(true);
    try {
      const response = await datasetsAPI.listDatasets();
      setDatasets(response.data);
    } catch (error) {
      console.error('Failed to load datasets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !datasetName) {
      alert('Укажите название датасета и выберите файл');
      return;
    }

    setLoading(true);
    try {
      const urlResponse = await datasetsAPI.getUploadUrl();
      const { s3_key } = urlResponse.data;
      await uploadToTarget(urlResponse.data, uploadFile);

      await datasetsAPI.createDataset({
        name: datasetName,
        description: datasetDescription,
        s3_key: s3_key,
        original_filename: uploadFile.name,
      });

      alert('Датасет успешно загружен');
      setOpenDialog(false);
      resetForm();
      loadDatasets();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Не удалось загрузить датасет');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(
      'Удалить этот датасет? Вместе с ним будут удалены все связанные анализы.'
    )) {
      return;
    }

    try {
      await datasetsAPI.deleteDataset(id);
      loadDatasets();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Не удалось удалить датасет');
    }
  };

  const handleDownload = async (id: string) => {
    try {
      const response = await datasetsAPI.downloadDataset(id);
      const { download_url, filename } = response.data;

      if (download_url.startsWith('/')) {
        const fileResponse = await downloadPrivateFile(download_url);

        const blob = new Blob([fileResponse.data]);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'dataset.csv';
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
      alert('Не удалось скачать датасет');
    }
  };

  const resetForm = () => {
    setDatasetName('');
    setDatasetDescription('');
    setUploadFile(null);
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h4">Датасеты</Typography>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => setOpenDialog(true)}
          >
            Загрузить датасет
          </Button>
        </Box>

        {loading && <CircularProgress />}

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Строки</TableCell>
                <TableCell>Признаки</TableCell>
                <TableCell>Размер</TableCell>
                <TableCell>Дата создания</TableCell>
                <TableCell>Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {datasets.map((dataset) => (
                <TableRow key={dataset.id}>
                  <TableCell>{dataset.name}</TableCell>
                  <TableCell>{dataset.num_rows || 'Нет данных'}</TableCell>
                  <TableCell>{dataset.num_features || 'Нет данных'}</TableCell>
                  <TableCell>
                    {dataset.file_size ? `${(dataset.file_size / 1024 / 1024).toFixed(2)} МБ` : 'Нет данных'}
                  </TableCell>
                  <TableCell>{new Date(dataset.created_at).toLocaleDateString('ru-RU')}</TableCell>
                  <TableCell>
                    <IconButton
                      onClick={() => handleDownload(dataset.id)}
                      color="primary"
                      aria-label={`Скачать датасет ${dataset.name}`}
                    >
                      <DownloadIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => handleDelete(dataset.id)}
                      color="error"
                      aria-label={`Удалить датасет ${dataset.name}`}
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
          <DialogTitle>Загрузка датасета</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <TextField
                label="Название датасета"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                fullWidth
                required
              />
              <TextField
                label="Описание"
                value={datasetDescription}
                onChange={(e) => setDatasetDescription(e.target.value)}
                fullWidth
                multiline
                rows={3}
              />
              <Button variant="outlined" component="label">
                Выбрать CSV-файл
                <input
                  type="file"
                  accept=".csv"
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

export default DatasetsPage;
