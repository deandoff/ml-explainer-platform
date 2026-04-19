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
import UploadIcon from '@mui/icons-material/Upload';
import { modelsAPI } from '../api';

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
      alert('Please provide model name and file');
      return;
    }

    setLoading(true);
    try {
      // Get presigned URL
      const urlResponse = await modelsAPI.getUploadUrl(modelType);
      const { upload_url, s3_key } = urlResponse.data;

      // Upload file using axios with FormData
      const formData = new FormData();
      formData.append('file', uploadFile);

      await axios.post(upload_url, formData);

      // Create model record
      await modelsAPI.createModel({
        name: modelName,
        description: modelDescription,
        model_type: modelType,
        s3_key: s3_key,
      });

      alert('Model uploaded successfully!');
      setOpenDialog(false);
      resetForm();
      loadModels();
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload model');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this model?')) {
      return;
    }

    try {
      await modelsAPI.deleteModel(id);
      loadModels();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete model');
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
          <Typography variant="h4">Models</Typography>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => setOpenDialog(true)}
          >
            Upload Model
          </Button>
        </Box>

        {loading && <CircularProgress />}

        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>{model.name}</TableCell>
                  <TableCell>{model.model_type}</TableCell>
                  <TableCell>{model.status}</TableCell>
                  <TableCell>
                    {model.file_size ? `${(model.file_size / 1024 / 1024).toFixed(2)} MB` : 'N/A'}
                  </TableCell>
                  <TableCell>{new Date(model.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <IconButton onClick={() => handleDelete(model.id)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Upload Model</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              <TextField
                label="Model Name"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                fullWidth
                required
              />
              <TextField
                label="Description"
                value={modelDescription}
                onChange={(e) => setModelDescription(e.target.value)}
                fullWidth
                multiline
                rows={3}
              />
              <FormControl fullWidth>
                <InputLabel>Model Type</InputLabel>
                <Select value={modelType} onChange={(e) => setModelType(e.target.value)}>
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
                Choose File
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

export default ModelsPage;
