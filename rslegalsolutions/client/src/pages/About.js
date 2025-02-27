import React from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Avatar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  useTheme,
} from '@mui/material';
import {
  Gavel,
  Security,
  People,
  Assignment,
  CheckCircle,
} from '@mui/icons-material';
import { customStyles } from '../theme';

const About = () => {
  const theme = useTheme();

  const coreValues = [
    {
      icon: <Gavel color="primary" />,
      title: 'Excellence',
      description: 'Commitment to delivering the highest quality legal services.'
    },
    {
      icon: <Security color="primary" />,
      title: 'Integrity',
      description: 'Upholding the highest ethical standards in all our dealings.'
    },
    {
      icon: <People color="primary" />,
      title: 'Client-Centric',
      description: 'Putting our clients needs and interests first.'
    },
    {
      icon: <Assignment color="primary" />,
      title: 'Expertise',
      description: 'Deep knowledge and experience in various legal domains.'
    }
  ];

  const teamMembers = [
    {
      name: 'John Doe',
      role: 'Senior Partner',
      image: '/images/team/john-doe.jpg',
      specialization: 'Corporate Law',
      experience: '20+ years'
    },
    {
      name: 'Jane Smith',
      role: 'Managing Partner',
      image: '/images/team/jane-smith.jpg',
      specialization: 'Real Estate Law',
      experience: '15+ years'
    },
    {
      name: 'Mike Johnson',
      role: 'Legal Associate',
      image: '/images/team/mike-johnson.jpg',
      specialization: 'Civil Litigation',
      experience: '10+ years'
    },
    {
      name: 'Sarah Williams',
      role: 'Legal Associate',
      image: '/images/team/sarah-williams.jpg',
      specialization: 'Family Law',
      experience: '8+ years'
    }
  ];

  const achievements = [
    'Successfully handled over 1000+ cases',
    'Recognized as top-tier law firm by Legal 500',
    'Award-winning legal services',
    '98% client satisfaction rate',
    'Extensive network of legal professionals',
    'Proven track record of successful outcomes'
  ];

  const milestones = [
    {
      year: '2005',
      title: 'Firm Established',
      description: 'RS Legal Solutions was founded with a vision to provide exceptional legal services.'
    },
    {
      year: '2010',
      title: 'Expansion',
      description: 'Expanded our practice areas and team to serve more clients.'
    },
    {
      year: '2015',
      title: 'Recognition',
      description: 'Received multiple awards for excellence in legal services.'
    },
    {
      year: '2020',
      title: 'Digital Transformation',
      description: 'Embraced technology to enhance client service delivery.'
    }
  ];

  return (
    <Box>
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
            About RS Legal Solutions
          </Typography>
          <Typography variant="h5" sx={{ maxWidth: 800 }}>
            A legacy of excellence in legal services, built on trust and expertise.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg">
        {/* Mission & Vision */}
        <Grid container spacing={4} sx={{ mb: 8 }}>
          <Grid item xs={12} md={6}>
            <Typography variant="h4" gutterBottom>
              Our Mission
            </Typography>
            <Typography variant="body1" paragraph>
              To provide exceptional legal services with integrity and professionalism,
              ensuring our clients receive the best possible representation and outcomes
              for their legal matters.
            </Typography>
            <List>
              {achievements.map((achievement, index) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <CheckCircle color="primary" />
                  </ListItemIcon>
                  <ListItemText primary={achievement} />
                </ListItem>
              ))}
            </List>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="h4" gutterBottom>
              Our Vision
            </Typography>
            <Typography variant="body1" paragraph>
              To be the most trusted and respected legal firm, known for our
              commitment to excellence, innovation, and client satisfaction. We aim to
              set new standards in legal services while maintaining the highest
              ethical principles.
            </Typography>
            <Box
              component="img"
              src="/images/about/vision.jpg"
              alt="Our Vision"
              sx={{
                width: '100%',
                height: 'auto',
                borderRadius: 2,
              }}
            />
          </Grid>
        </Grid>

        {/* Core Values */}
        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" align="center" gutterBottom>
            Our Core Values
          </Typography>
          <Grid container spacing={4} sx={{ mt: 2 }}>
            {coreValues.map((value, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card sx={{ height: '100%', ...customStyles.cardHover }}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Box sx={{ mb: 2 }}>{value.icon}</Box>
                    <Typography variant="h6" gutterBottom>
                      {value.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {value.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Milestones */}
        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" align="center" gutterBottom>
            Our Journey
          </Typography>
          <Grid container spacing={4}>
            {milestones.map((milestone, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card sx={{ height: '100%', ...customStyles.cardHover }}>
                  <CardContent>
                    <Typography variant="h3" color="primary" gutterBottom>
                      {milestone.year}
                    </Typography>
                    <Typography variant="h6" gutterBottom>
                      {milestone.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {milestone.description}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Team Section */}
        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" align="center" gutterBottom>
            Our Team
          </Typography>
          <Typography
            variant="body1"
            align="center"
            color="text.secondary"
            sx={{ mb: 4, maxWidth: 700, mx: 'auto' }}
          >
            Meet our experienced team of legal professionals dedicated to serving
            your needs with expertise and commitment.
          </Typography>
          <Grid container spacing={4}>
            {teamMembers.map((member, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card sx={{ height: '100%', ...customStyles.cardHover }}>
                  <CardContent sx={{ textAlign: 'center' }}>
                    <Avatar
                      src={member.image}
                      sx={{
                        width: 120,
                        height: 120,
                        mx: 'auto',
                        mb: 2,
                      }}
                    >
                      {member.name[0]}
                    </Avatar>
                    <Typography variant="h6" gutterBottom>
                      {member.name}
                    </Typography>
                    <Typography
                      variant="subtitle1"
                      color="primary"
                      gutterBottom
                    >
                      {member.role}
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      {member.specialization}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Experience: {member.experience}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Container>
    </Box>
  );
};

export default About;
