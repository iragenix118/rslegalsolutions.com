import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Paper,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardContent,
  useTheme,
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { servicesAPI, appointmentsAPI, handleApiError } from '../services/api';
import { customStyles } from '../theme';

const steps = ['Select Service', 'Choose Date & Time', 'Personal Details', 'Confirmation'];

const Appointments = () => {
  const theme = useTheme();
  const [activeStep, setActiveStep] = useState(0);
  const [services, setServices] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    serviceType: '',
    appointmentDate: null,
    preferredTime: '',
    clientName: '',
    email: '',
    phone: '',
    message: '',
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

  const fetchAvailableSlots = async (date) => {
    if (!date) return;
    try {
      const response = await appointmentsAPI.getAvailableSlots(date.toISOString());
      setAvailableSlots(response.data);
    } catch (err) {
      const errorDetails = handleApiError(err);
      setError(errorDetails.message);
    }
  };

  const handleNext = () => {
    if (activeStep === steps.length - 1) {
      handleSubmit();
    } else {
      setActiveStep((prevStep) => prevStep + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleChange = (field) => (event) => {
    const value = event.target ? event.target.value : event;
    setFormData((prev) => ({ ...prev, [field]: value }));

    if (field === 'appointmentDate') {
      fetchAvailableSlots(event);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await appointmentsAPI.create(formData);
      setSuccess(true);
      // You might want to store the confirmation code from response.data.confirmationCode
    } catch (err) {
      const errorDetails = handleApiError(err);
      setError(errorDetails.message);
      setActiveStep(0);
    } finally {
      setLoading(false);
    }
  };

  const validateStep = () => {
    switch (activeStep) {
      case 0:
        return !!formData.serviceType;
      case 1:
        return !!formData.appointmentDate && !!formData.preferredTime;
      case 2:
        return (
          !!formData.clientName &&
          !!formData.email &&
          !!formData.phone
        );
      default:
        return true;
    }
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <FormControl fullWidth>
            <InputLabel>Select Service</InputLabel>
            <Select
              value={formData.serviceType}
              onChange={handleChange('serviceType')}
              label="Select Service"
            >
              {services.map((service) => (
                <MenuItem key={service._id} value={service._id}>
                  {service.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case 1:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker
                  label="Appointment Date"
                  value={formData.appointmentDate}
                  onChange={handleChange('appointmentDate')}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                  minDate={new Date()}
                />
              </LocalizationProvider>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Preferred Time</InputLabel>
                <Select
                  value={formData.preferredTime}
                  onChange={handleChange('preferredTime')}
                  label="Preferred Time"
                >
                  {availableSlots.map((slot) => (
                    <MenuItem key={slot} value={slot}>
                      {slot}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        );

      case 2:
        return (
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Full Name"
                value={formData.clientName}
                onChange={handleChange('clientName')}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={formData.email}
                onChange={handleChange('email')}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Phone"
                value={formData.phone}
                onChange={handleChange('phone')}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Additional Message"
                multiline
                rows={4}
                value={formData.message}
                onChange={handleChange('message')}
              />
            </Grid>
          </Grid>
        );

      case 3:
        return (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Appointment Summary
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography>
                    <strong>Service:</strong>{' '}
                    {services.find(s => s._id === formData.serviceType)?.title}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography>
                    <strong>Date:</strong>{' '}
                    {formData.appointmentDate?.toLocaleDateString()}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography>
                    <strong>Time:</strong> {formData.preferredTime}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography>
                    <strong>Name:</strong> {formData.clientName}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography>
                    <strong>Contact:</strong> {formData.email} | {formData.phone}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  if (success) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h4" gutterBottom color="primary">
            Appointment Booked Successfully!
          </Typography>
          <Typography paragraph>
            Thank you for booking an appointment with us. We have sent a confirmation
            email with all the details.
          </Typography>
          <Button
            variant="contained"
            onClick={() => {
              setSuccess(false);
              setActiveStep(0);
              setFormData({
                serviceType: '',
                appointmentDate: null,
                preferredTime: '',
                clientName: '',
                email: '',
                phone: '',
                message: '',
              });
            }}
          >
            Book Another Appointment
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Box sx={{ py: 6 }}>
      <Container maxWidth="lg">
        <Typography variant="h3" align="center" gutterBottom>
          Book an Appointment
        </Typography>
        <Typography
          variant="h6"
          align="center"
          color="text.secondary"
          paragraph
          sx={{ mb: 6 }}
        >
          Schedule a consultation with our legal experts
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 4 }}>
            {error}
          </Alert>
        )}

        <Paper sx={{ p: 4 }}>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          <Box sx={{ mt: 4, mb: 4 }}>
            {renderStepContent()}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            {activeStep !== 0 && (
              <Button onClick={handleBack}>
                Back
              </Button>
            )}
            <Button
              variant="contained"
              onClick={handleNext}
              disabled={!validateStep() || loading}
            >
              {loading ? (
                <CircularProgress size={24} />
              ) : activeStep === steps.length - 1 ? (
                'Confirm Booking'
              ) : (
                'Next'
              )}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default Appointments;
