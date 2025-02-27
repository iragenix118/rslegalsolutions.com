import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Grid,
  Typography,
  Link,
  IconButton,
  Divider,
  useTheme,
} from '@mui/material';
import {
  Facebook,
  Twitter,
  LinkedIn,
  Instagram,
  Phone,
  Email,
  LocationOn,
} from '@mui/icons-material';

const Footer = () => {
  const theme = useTheme();

  const quickLinks = [
    { text: 'Home', path: '/' },
    { text: 'About Us', path: '/about' },
    { text: 'Services', path: '/services' },
    { text: 'Blog', path: '/blog' },
    { text: 'Contact', path: '/contact' },
  ];

  const services = [
    { text: 'Corporate and Commercial Law', path: '/services/corporate-and-commercial-law' },
    { text: 'Dispute Resolution', path: '/services/dispute-resolution' },
    { text: 'Real Estate and Property Law', path: '/services/real-estate-and-property-law' },
    { text: 'Wills and Estate Planning', path: '/services/wills-and-estate-planning' },
  ];

  const contactInfo = [
    { icon: <Phone />, text: '+91 XXX XXX XXXX' },
    { icon: <Email />, text: 'contact@rslegalsolutions.com' },
    { icon: <LocationOn />, text: 'New Delhi, India' },
  ];

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'primary.main',
        color: 'common.white',
        pt: 6,
        pb: 3,
        mt: 'auto',
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={4}>
          {/* Company Info */}
          <Grid item xs={12} md={4}>
            <Typography variant="h6" gutterBottom>
              RS Legal Solutions
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Providing comprehensive legal solutions with expertise and integrity.
              Your trusted partner in navigating complex legal matters.
            </Typography>
            <Box sx={{ mt: 2 }}>
              <IconButton color="inherit" aria-label="Facebook">
                <Facebook />
              </IconButton>
              <IconButton color="inherit" aria-label="Twitter">
                <Twitter />
              </IconButton>
              <IconButton color="inherit" aria-label="LinkedIn">
                <LinkedIn />
              </IconButton>
              <IconButton color="inherit" aria-label="Instagram">
                <Instagram />
              </IconButton>
            </Box>
          </Grid>

          {/* Quick Links */}
          <Grid item xs={12} sm={6} md={2}>
            <Typography variant="h6" gutterBottom>
              Quick Links
            </Typography>
            <Box component="nav">
              {quickLinks.map((link) => (
                <Link
                  key={link.text}
                  component={RouterLink}
                  to={link.path}
                  color="inherit"
                  sx={{
                    display: 'block',
                    mb: 1,
                    textDecoration: 'none',
                    '&:hover': {
                      color: theme.palette.secondary.light,
                    },
                  }}
                >
                  {link.text}
                </Link>
              ))}
            </Box>
          </Grid>

          {/* Services */}
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="h6" gutterBottom>
              Our Services
            </Typography>
            <Box component="nav">
              {services.map((service) => (
                <Link
                  key={service.text}
                  component={RouterLink}
                  to={service.path}
                  color="inherit"
                  sx={{
                    display: 'block',
                    mb: 1,
                    textDecoration: 'none',
                    '&:hover': {
                      color: theme.palette.secondary.light,
                    },
                  }}
                >
                  {service.text}
                </Link>
              ))}
            </Box>
          </Grid>

          {/* Contact Info */}
          <Grid item xs={12} md={3}>
            <Typography variant="h6" gutterBottom>
              Contact Us
            </Typography>
            <Box>
              {contactInfo.map((info, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2,
                  }}
                >
                  <Box sx={{ mr: 1 }}>{info.icon}</Box>
                  <Typography variant="body2">{info.text}</Typography>
                </Box>
              ))}
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 3, borderColor: 'rgba(255, 255, 255, 0.1)' }} />

        {/* Copyright */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Typography variant="body2" sx={{ mb: { xs: 2, md: 0 } }}>
            © {new Date().getFullYear()} RS Legal Solutions. All rights reserved.
          </Typography>
          <Box>
            <Link
              color="inherit"
              sx={{
                mx: 1.5,
                textDecoration: 'none',
                '&:hover': {
                  color: theme.palette.secondary.light,
                },
              }}
            >
              Privacy Policy
            </Link>
            <Link
              color="inherit"
              sx={{
                mx: 1.5,
                textDecoration: 'none',
                '&:hover': {
                  color: theme.palette.secondary.light,
                },
              }}
            >
              Terms of Service
            </Link>
          </Box>
        </Box>
      </Container>
    </Box>
  );
};

export default Footer;
