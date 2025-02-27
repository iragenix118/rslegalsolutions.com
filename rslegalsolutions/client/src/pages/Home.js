import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardMedia,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  Gavel,
  Security,
  People,
  Assignment,
  AccountBalance,
  Timeline,
} from '@mui/icons-material';
import { customStyles } from '../theme';

const Home = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const features = [
    {
      icon: <Gavel fontSize="large" color="primary" />,
      title: 'Expert Legal Services',
      description: 'Comprehensive legal solutions tailored to your specific needs with years of expertise.'
    },
    {
      icon: <Security fontSize="large" color="primary" />,
      title: 'Trusted & Reliable',
      description: 'Your trusted partner in navigating complex legal matters with integrity and dedication.'
    },
    {
      icon: <People fontSize="large" color="primary" />,
      title: 'Client-Focused Approach',
      description: 'Personalized attention and dedicated support throughout your legal journey.'
    },
    {
      icon: <Assignment fontSize="large" color="primary" />,
      title: 'Professional Excellence',
      description: 'Committed to maintaining the highest standards of professional excellence.'
    },
    {
      icon: <AccountBalance fontSize="large" color="primary" />,
      title: 'Extensive Experience',
      description: 'Deep understanding of various legal domains and proven track record of success.'
    },
    {
      icon: <Timeline fontSize="large" color="primary" />,
      title: 'Efficient Solutions',
      description: 'Strategic approach to deliver timely and cost-effective legal solutions.'
    }
  ];

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          ...customStyles.heroSection,
          backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url("/images/hero-bg.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center" sx={{ minHeight: '60vh' }}>
            <Grid item xs={12} md={8}>
              <Typography
                variant="h1"
                sx={{
                  fontSize: { xs: '2.5rem', md: '3.5rem' },
                  fontWeight: 700,
                  mb: 2,
                }}
              >
                Your Trusted Legal Partner
              </Typography>
              <Typography
                variant="h5"
                sx={{ mb: 4, fontWeight: 400 }}
              >
                Providing comprehensive legal solutions with expertise and integrity
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  color="secondary"
                  size="large"
                  component={RouterLink}
                  to="/appointments"
                >
                  Book Consultation
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  size="large"
                  component={RouterLink}
                  to="/services"
                >
                  Our Services
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Box sx={{ py: 8, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            align="center"
            sx={{ mb: 6 }}
          >
            Why Choose Us
          </Typography>
          <Grid container spacing={4}>
            {features.map((feature, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    ...customStyles.cardHover,
                  }}
                >
                  <CardContent sx={{ flexGrow: 1, textAlign: 'center' }}>
                    <Box sx={{ mb: 2 }}>{feature.icon}</Box>
                    <Typography
                      variant="h5"
                      component="h3"
                      gutterBottom
                      sx={{ fontWeight: 600 }}
                    >
                      {feature.title}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                      {feature.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box
        sx={{
          py: 8,
          bgcolor: 'primary.main',
          color: 'common.white',
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={8}>
              <Typography variant="h3" gutterBottom>
                Ready to Get Started?
              </Typography>
              <Typography variant="h6" sx={{ mb: 4, fontWeight: 400 }}>
                Schedule a consultation with our expert legal team today.
              </Typography>
            </Grid>
            <Grid item xs={12} md={4} sx={{ textAlign: { md: 'right' } }}>
              <Button
                variant="contained"
                color="secondary"
                size="large"
                component={RouterLink}
                to="/contact"
                sx={{ px: 4 }}
              >
                Contact Us
              </Button>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
};

export default Home;
