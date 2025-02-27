import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  CircularProgress,
  Alert,
  useTheme,
  Tabs,
  Tab,
} from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import { servicesAPI, handleApiError } from '../services/api';
import { customStyles } from '../theme';

const Services = () => {
  const theme = useTheme();
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [servicesRes, categoriesRes] = await Promise.all([
          servicesAPI.getAll(),
          servicesAPI.getCategories()
        ]);
        
        setServices(servicesRes.data);
        setCategories(['all', ...categoriesRes.data]);
        setError(null);
      } catch (err) {
        const errorDetails = handleApiError(err);
        setError(errorDetails.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleCategoryChange = (event, newValue) => {
    setSelectedCategory(newValue);
  };

  const filteredServices = selectedCategory === 'all'
    ? services
    : services.filter(service => service.category === selectedCategory);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ py: 6 }}>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'common.white',
          py: 8,
          mb: 6,
        }}
      >
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            sx={{
              fontWeight: 700,
              mb: 2,
            }}
          >
            Our Legal Services
          </Typography>
          <Typography variant="h5" sx={{ mb: 4, maxWidth: 800 }}>
            Comprehensive legal solutions tailored to your needs. Our experienced team
            provides expert guidance across various practice areas.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg">
        {error && (
          <Alert severity="error" sx={{ mb: 4 }}>
            {error}
          </Alert>
        )}

        {/* Category Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
          <Tabs
            value={selectedCategory}
            onChange={handleCategoryChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
          >
            {categories.map((category) => (
              <Tab
                key={category}
                label={category === 'all' ? 'All Services' : category}
                value={category}
                sx={{ textTransform: 'none' }}
              />
            ))}
          </Tabs>
        </Box>

        {/* Services Grid */}
        <Grid container spacing={4}>
          {filteredServices.map((service) => (
            <Grid item xs={12} sm={6} md={4} key={service._id}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  ...customStyles.cardHover,
                }}
              >
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography
                    variant="h5"
                    component="h3"
                    gutterBottom
                    sx={{ fontWeight: 600 }}
                  >
                    {service.title}
                  </Typography>
                  <Chip
                    label={service.category}
                    color="primary"
                    size="small"
                    sx={{ mb: 2 }}
                  />
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{
                      mb: 2,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {service.description}
                  </Typography>
                  <Box sx={{ mt: 2 }}>
                    {service.features?.slice(0, 3).map((feature, index) => (
                      <Typography
                        key={index}
                        variant="body2"
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          mb: 1,
                          color: 'text.secondary',
                        }}
                      >
                        • {feature}
                      </Typography>
                    ))}
                  </Box>
                </CardContent>
                <CardActions sx={{ p: 2, pt: 0 }}>
                  <Button
                    component={RouterLink}
                    to={`/services/${service.slug}`}
                    endIcon={<ArrowForward />}
                    sx={{ ml: 'auto' }}
                  >
                    Learn More
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* CTA Section */}
        <Box
          sx={{
            mt: 8,
            p: 4,
            bgcolor: 'background.paper',
            borderRadius: 2,
            textAlign: 'center',
          }}
        >
          <Typography variant="h4" gutterBottom>
            Need Legal Assistance?
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, maxWidth: 600, mx: 'auto' }}>
            Our team of experienced lawyers is ready to help you. Schedule a
            consultation to discuss your legal needs.
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            size="large"
            component={RouterLink}
            to="/appointments"
          >
            Book a Consultation
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default Services;
