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
  CircularProgress,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadIcon from '@mui/icons-material/Upload';
import { datasetsAPI } from '../api';

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
      alert('Please provide dataset name and file');
      return;
    }

    setLoading(true);
    try {
      // Get presigned URL
      const urlResponse = await datasetsAPI.getUploadUrl();
      const { upload_url, s3_key } = urlResponse.data;

      // Upload file using axios with FormData
      const formData = new FormData();
      formData.append('file', uploadFile);

      await axios.post(upload_url, formData);

      // Create dataset record
      await datasetsAPI.createDataset({
        name: datasetName,
        description: datasetDescription,
        s3_key: s3_key,
      });

      alert('Dataset uploaded successfully!');
      setOpenDialog(false);
      resetForm();
      loadDatasets();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload dataset');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this dataset?')) {
      return;
    }

    try {
      await datasetsAPI.deleteDataset(id);
      loadDatasets();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete dataset');
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
          <Typography variant="h4">Datasets</Typography>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => setOpenDialog(true)}
          >
            Upload Dataset
          </Button>
        </Box>

        {loading && <CircularProgress />}

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Rows</TableCell>
                <TableCell>Features</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {datasets.map((dataset) => (
                <TableRow key={dataset.id}>
                  <TableCell>{dataset.name}</TableCell>
                  <TableCell>{dataset.num_rows || 'N/A'}</TableCell>
                  <TableCell>{dataset.num_features || 'N/A'}</TableCell>
                  <TableCell>
                    {dataset.file_size ? `${(dataset.file_size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}
                  </TableCell>
                  <TableCell>{new Date(dataset.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleDelete(dataset.id)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Upload Dataset</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <TextField
                label="Dataset Name"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                fullWidth
                required
              />
              <TextField
                label="Description"
                value={datasetDescription}
                onChange={(e) => setDatasetDescription(e.target.value)}
                fullWidth
                multiline
                rows={3}
              />
              <Button variant="outlined" component="label">
                Choose CSV File
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
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button onClick={handleUpload} variant="contained" disabled={loading}>
              Upload
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Container>
  );
};

export default DatasetsPage;
