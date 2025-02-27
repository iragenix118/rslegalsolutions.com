import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Grid,
  Button,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress,
  Alert,
  Breadcrumbs,
  Link,
  Paper,
} from '@mui/material';
import {
  Check as CheckIcon,
  NavigateNext as NavigateNextIcon,
  Schedule as ScheduleIcon,
  Description as DescriptionIcon,
  Assignment as AssignmentIcon,
} from '@mui/icons-material';
import { servicesAPI, handleApiError } from '../services/api';
import { customStyles } from '../theme';

const ServiceDetail = () => {
  const { slug } = useParams();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchService = async () => {
      try {
        const response = await servicesAPI.getBySlug(slug);
        setService(response.data);
        setError(null);
      } catch (err) {
        const errorDetails = handleApiError(err);
        setError(errorDetails.message);
      } finally {
        setLoading(false);
      }
    };

    fetchService();
  }, [slug]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Alert severity="error" sx={{ mb: 4 }}>
          {error}
        </Alert>
        <Button component={RouterLink} to="/services" variant="contained">
          Back to Services
        </Button>
      </Container>
    );
  }

  if (!service) {
    return null;
  }

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'common.white',
          py: 8,
        }}
      >
        <Container maxWidth="lg">
          <Breadcrumbs
            separator={<NavigateNextIcon fontSize="small" />}
            sx={{ mb: 4, color: 'rgba(255, 255, 255, 0.7)' }}
          >
            <Link
              component={RouterLink}
              to="/"
              color="inherit"
              sx={{ '&:hover': { color: 'common.white' } }}
            >
              Home
            </Link>
            <Link
              component={RouterLink}
              to="/services"
              color="inherit"
              sx={{ '&:hover': { color: 'common.white' } }}
            >
              Services
            </Link>
            <Typography color="common.white">{service.title}</Typography>
          </Breadcrumbs>

          <Typography variant="h2" sx={{ fontWeight: 700, mb: 2 }}>
            {service.title}
          </Typography>
          <Typography variant="h5" sx={{ maxWidth: 800 }}>
            {service.description}
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Grid container spacing={4}>
          {/* Main Content */}
          <Grid item xs={12} md={8}>
            {/* Key Features */}
            <Paper sx={{ p: 4, mb: 4 }}>
              <Typography variant="h4" gutterBottom>
                Key Features
              </Typography>
              <List>
                {service.features?.map((feature, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <CheckIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText primary={feature} />
                  </ListItem>
                ))}
              </List>
            </Paper>

            {/* Process Section */}
            <Paper sx={{ p: 4 }}>
              <Typography variant="h4" gutterBottom>
                Our Process
              </Typography>
              <Grid container spacing={3}>
                {['Consultation', 'Analysis', 'Strategy', 'Implementation'].map((step, index) => (
                  <Grid item xs={12} sm={6} key={index}>
                    <Card sx={{ height: '100%' }}>
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                          {`Step ${index + 1}: ${step}`}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {`Detailed explanation of ${step.toLowerCase()} process and what clients can expect.`}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Paper>
          </Grid>

          {/* Sidebar */}
          <Grid item xs={12} md={4}>
            {/* Quick Actions Card */}
            <Card sx={{ mb: 4, ...customStyles.cardHover }}>
              <CardContent>
                <Typography variant="h5" gutterBottom>
                  Get Started
                </Typography>
                <List>
                  <ListItem>
                    <ListItemIcon>
                      <ScheduleIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText primary="Schedule Consultation" />
                  </ListItem>
                  <Divider />
                  <ListItem>
                    <ListItemIcon>
                      <DescriptionIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText primary="Request Information" />
                  </ListItem>
                  <Divider />
                  <ListItem>
                    <ListItemIcon>
                      <AssignmentIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText primary="View Case Studies" />
                  </ListItem>
                </List>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  component={RouterLink}
                  to="/appointments"
                  sx={{ mt: 2 }}
                >
                  Book Consultation
                </Button>
              </CardContent>
            </Card>

            {/* Contact Card */}
            <Card sx={customStyles.cardHover}>
              <CardContent>
                <Typography variant="h5" gutterBottom>
                  Need Help?
                </Typography>
                <Typography variant="body2" paragraph>
                  Our legal experts are here to assist you. Contact us for any
                  questions or concerns.
                </Typography>
                <Button
                  variant="outlined"
                  color="primary"
                  fullWidth
                  component={RouterLink}
                  to="/contact"
                >
                  Contact Us
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default ServiceDetail;
