import React, { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  IconButton,
  Box,
  Menu,
  MenuItem,
  useMediaQuery,
  useTheme,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Home,
  Gavel,
  Event,
  Article,
  ContactMail,
  Info,
  Person,
  Dashboard,
  Login,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';

const Navbar = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user, logout } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);

  const handleUserMenuOpen = (event) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const handleMobileMenuToggle = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleLogout = () => {
    logout();
    handleUserMenuClose();
    navigate('/');
  };

  const menuItems = [
    { text: 'Home', icon: <Home />, path: '/' },
    { text: 'Services', icon: <Gavel />, path: '/services' },
    { text: 'Appointments', icon: <Event />, path: '/appointments' },
    { text: 'Blog', icon: <Article />, path: '/blog' },
    { text: 'Contact', icon: <ContactMail />, path: '/contact' },
    { text: 'About', icon: <Info />, path: '/about' },
  ];

  const renderMobileMenu = () => (
    <Drawer
      anchor="right"
      open={mobileMenuOpen}
      onClose={handleMobileMenuToggle}
      PaperProps={{
        sx: { width: 240 }
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" color="primary" sx={{ mb: 2 }}>
          RS Legal Solutions
        </Typography>
      </Box>
      <Divider />
      <List>
        {menuItems.map((item) => (
          <ListItem
            button
            key={item.text}
            component={RouterLink}
            to={item.path}
            onClick={handleMobileMenuToggle}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} />
          </ListItem>
        ))}
        <Divider />
        {user ? (
          <>
            <ListItem button component={RouterLink} to="/dashboard" onClick={handleMobileMenuToggle}>
              <ListItemIcon><Dashboard /></ListItemIcon>
              <ListItemText primary="Dashboard" />
            </ListItem>
            <ListItem button onClick={handleLogout}>
              <ListItemIcon><Login /></ListItemIcon>
              <ListItemText primary="Logout" />
            </ListItem>
          </>
        ) : (
          <ListItem button component={RouterLink} to="/login" onClick={handleMobileMenuToggle}>
            <ListItemIcon><Login /></ListItemIcon>
            <ListItemText primary="Login" />
          </ListItem>
        )}
      </List>
    </Drawer>
  );

  const renderDesktopMenu = () => (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      {menuItems.map((item) => (
        <Button
          key={item.text}
          color="inherit"
          component={RouterLink}
          to={item.path}
          sx={{ mx: 1 }}
        >
          {item.text}
        </Button>
      ))}
      {user ? (
        <>
          <IconButton
            color="inherit"
            onClick={handleUserMenuOpen}
            sx={{ ml: 1 }}
          >
            <Person />
          </IconButton>
          <Menu
            anchorEl={userMenuAnchor}
            open={Boolean(userMenuAnchor)}
            onClose={handleUserMenuClose}
          >
            <MenuItem component={RouterLink} to="/dashboard" onClick={handleUserMenuClose}>
              Dashboard
            </MenuItem>
            <MenuItem onClick={handleLogout}>Logout</MenuItem>
          </Menu>
        </>
      ) : (
        <Button
          color="inherit"
          component={RouterLink}
          to="/login"
          sx={{
            ml: 2,
            border: '1px solid',
            borderColor: 'common.white',
          }}
        >
          Login
        </Button>
      )}
    </Box>
  );

  return (
    <AppBar position="sticky" color="primary">
      <Toolbar>
        <Typography
          variant="h6"
          component={RouterLink}
          to="/"
          sx={{
            flexGrow: 1,
            color: 'inherit',
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          RS Legal Solutions
        </Typography>

        {isMobile ? (
          <>
            <IconButton
              color="inherit"
              edge="end"
              onClick={handleMobileMenuToggle}
            >
              <MenuIcon />
            </IconButton>
            {renderMobileMenu()}
          </>
        ) : (
          renderDesktopMenu()
        )}
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
