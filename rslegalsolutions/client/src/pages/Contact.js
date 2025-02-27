import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  TextField,
  Button,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  useTheme,
} from '@mui/material';
import {
  Phone,
  Email,
  LocationOn,
  AccessTime,
} from '@mui/icons-material';
import { servicesAPI, contactAPI, handleApiError } from '../services/api';
import { customStyles } from '../theme';

const Contact = () => {
  const theme = useTheme();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    serviceInterest: '',
  });

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const response = await servicesAPI.getAll();
      setServices(response.data);
    } catch (err) {
      const errorDetails = handleApiError(err);
      setError(errorDetails.message);
    }
  };

  const handleChange = (field) => (event) => {
    setFormData((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await contactAPI.submit(formData);
      setSuccess(true);
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: '',
        serviceInterest: '',
      });
    } catch (err) {
      const errorDetails = handleApiError(err);
      setError(errorDetails.message);
    } finally {
      setLoading(false);
    }
  };

  const contactInfo = [
    {
      icon: <Phone fontSize="large" color="primary" />,
      title: 'Phone',
      content: ['+91 XXX XXX XXXX', '+91 XXX XXX XXXX'],
    },
    {
      icon: <Email fontSize="large" color="primary" />,
      title: 'Email',
      content: ['contact@rslegalsolutions.com', 'info@rslegalsolutions.com'],
    },
    {
      icon: <LocationOn fontSize="large" color="primary" />,
      title: 'Address',
      content: ['123 Legal Street', 'New Delhi, India 110001'],
    },
    {
      icon: <AccessTime fontSize="large" color="primary" />,
      title: 'Business Hours',
      content: ['Monday - Friday: 9:00 AM - 6:00 PM', 'Saturday: 9:00 AM - 2:00 PM'],
    },
  ];

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
          <Typography variant="h2" sx={{ fontWeight: 700, mb: 2 }}>
            Contact Us
          </Typography>
          <Typography variant="h5" sx={{ maxWidth: 800 }}>
            Get in touch with our legal experts. We're here to help you with any
            questions or concerns.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg">
        <Grid container spacing={4}>
          {/* Contact Information */}
          <Grid item xs={12} md={4}>
            <Box sx={{ position: 'sticky', top: theme.spacing(2) }}>
              {contactInfo.map((info, index) => (
                <Card
                  key={index}
                  sx={{
                    mb: 2,
                    ...customStyles.cardHover,
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      {info.icon}
                      <Typography variant="h6" sx={{ ml: 2 }}>
                        {info.title}
                      </Typography>
                    </Box>
                    {info.content.map((line, i) => (
                      <Typography
                        key={i}
                        variant="body1"
                        color="text.secondary"
                        sx={{ mb: 1 }}
                      >
                        {line}
                      </Typography>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </Box>
          </Grid>

          {/* Contact Form */}
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 4 }}>
              <Typography variant="h4" gutterBottom>
                Send us a Message
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                Fill out the form below and we'll get back to you as soon as possible.
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                  {error}
                </Alert>
              )}

              {success && (
                <Alert severity="success" sx={{ mb: 3 }}>
                  Thank you for contacting us! We will get back to you shortly.
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Full Name"
                      required
                      value={formData.name}
                      onChange={handleChange('name')}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange('email')}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Phone"
                      required
                      value={formData.phone}
                      onChange={handleChange('phone')}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth>
                      <InputLabel>Service Interest</InputLabel>
                      <Select
                        value={formData.serviceInterest}
                        onChange={handleChange('serviceInterest')}
                        label="Service Interest"
                      >
                        {services.map((service) => (
                          <MenuItem key={service._id} value={service._id}>
                            {service.title}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Subject"
                      required
                      value={formData.subject}
                      onChange={handleChange('subject')}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Message"
                      multiline
                      rows={6}
                      required
                      value={formData.message}
                      onChange={handleChange('message')}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={loading}
                      sx={{ minWidth: 150 }}
                    >
                      {loading ? <CircularProgress size={24} /> : 'Send Message'}
                    </Button>
                  </Grid>
                </Grid>
              </form>
            </Paper>
          </Grid>
        </Grid>

        {/* Map Section */}
        <Box sx={{ mt: 8 }}>
          <Paper sx={{ p: 2 }}>
            <iframe
              title="Office Location"
              src="https://www.google.com/maps/embed?pb=YOUR_EMBED_URL"
              width="100%"
              height="450"
              style={{ border: 0 }}
              allowFullScreen=""
              loading="lazy"
            />
          </Paper>
        </Box>
      </Container>
    </Box>
  );
};

export default Contact;
