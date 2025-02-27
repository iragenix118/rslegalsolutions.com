# RS Legal Solutions Website

A modern full-stack web application for a legal services firm, built with React.js and Node.js.

## Features

- 🏢 **Company Profile**: Comprehensive information about the law firm and its services
- 📅 **Appointment Booking**: Online consultation scheduling system
- 📚 **Legal Resources**: Blog posts, case laws, and legal updates
- 👥 **Client Portal**: Secure client access to case information
- 📱 **Responsive Design**: Mobile-first approach for all devices
- 🔒 **Secure Authentication**: JWT-based user authentication
- 📧 **Contact Management**: Inquiry handling and response system

## Tech Stack

### Frontend
- React.js
- Material-UI
- React Router
- Axios
- JWT Authentication
- Context API
- Progressive Web App (PWA)

### Backend
- Node.js
- Express.js
- MongoDB
- JWT
- Mongoose
- Bcrypt
- Nodemailer

## Project Structure

```
rslegalsolutions/
├── client/                 # Frontend React application
│   ├── public/            # Static files
│   └── src/
│       ├── components/    # Reusable components
│       ├── contexts/      # Context providers
│       ├── hooks/         # Custom hooks
│       ├── pages/         # Page components
│       ├── services/      # API services
│       └── theme/         # MUI theme configuration
│
└── server/                # Backend Node.js application
    ├── src/
    │   ├── models/       # MongoDB models
    │   ├── routes/       # API routes
    │   ├── middleware/   # Custom middleware
    │   └── utils/        # Utility functions
    └── tests/            # Backend tests
```

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/rslegalsolutions.git
cd rslegalsolutions
```

2. Install dependencies:
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

3. Set up environment variables:
- Copy `.env.development` to `.env` in both client and server directories
- Update the variables with your configuration

4. Start the development servers:
```bash
# Start backend server (from server directory)
npm run dev

# Start frontend development server (from client directory)
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## Available Scripts

### Client
- `npm start`: Start development server
- `npm build`: Build production version
- `npm test`: Run tests
- `npm run eject`: Eject from Create React App

### Server
- `npm run dev`: Start development server
- `npm start`: Start production server
- `npm test`: Run tests
- `npm run lint`: Run ESLint

## Deployment

### Frontend
1. Build the React application:
```bash
cd client
npm run build
```

2. Deploy the contents of the `build` directory to your web server

### Backend
1. Set up production environment variables
2. Install PM2 or similar process manager
3. Start the server using PM2:
```bash
pm2 start npm --name "rslegalsolutions" -- start
```

## Security Features

- JWT Authentication
- Password Hashing
- Rate Limiting
- CORS Protection
- XSS Prevention
- CSRF Protection
- Secure Headers
- Input Validation
- Error Handling

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

RS Legal Solutions - contact@rslegalsolutions.com

Project Link: https://github.com/yourusername/rslegalsolutions

## Acknowledgments

- [Material-UI](https://mui.com/)
- [React.js](https://reactjs.org/)
- [Node.js](https://nodejs.org/)
- [MongoDB](https://www.mongodb.com/)
- [Express.js](https://expressjs.com/)
