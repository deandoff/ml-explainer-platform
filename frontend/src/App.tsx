import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';
import { AuthProvider } from './contexts/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ModelsPage from './pages/ModelsPage';
import DatasetsPage from './pages/DatasetsPage';
import AnalysisPage from './pages/AnalysisPage';
import AnalysisResultsPage from './pages/AnalysisResultsPage';
import LimeResultsPage from './pages/LimeResultsPage';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Navbar />
            <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />

                {/* Protected routes */}
                <Route
                  path="/"
                  element={
                    <PrivateRoute>
                      <HomePage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/models"
                  element={
                    <PrivateRoute>
                      <ModelsPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/datasets"
                  element={
                    <PrivateRoute>
                      <DatasetsPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/analysis"
                  element={
                    <PrivateRoute>
                      <AnalysisPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/analysis/:analysisId/results"
                  element={
                    <PrivateRoute>
                      <AnalysisResultsPage />
                    </PrivateRoute>
                  }
                />
                <Route
                  path="/analysis/:analysisId/lime-results"
                  element={
                    <PrivateRoute>
                      <LimeResultsPage />
                    </PrivateRoute>
                  }
                />
              </Routes>
            </Box>
          </Box>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
