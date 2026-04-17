import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ScienceIcon from '@mui/icons-material/Science';

const Navbar: React.FC = () => {
  return (
    <AppBar position="static">
      <Toolbar>
        <ScienceIcon sx={{ mr: 2 }} />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          ML Explainer Platform
        </Typography>
        <Box>
          <Button color="inherit" component={RouterLink} to="/">
            Home
          </Button>
          <Button color="inherit" component={RouterLink} to="/models">
            Models
          </Button>
          <Button color="inherit" component={RouterLink} to="/datasets">
            Datasets
          </Button>
          <Button color="inherit" component={RouterLink} to="/analysis">
            Analysis
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
