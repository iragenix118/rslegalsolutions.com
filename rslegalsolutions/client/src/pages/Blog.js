import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardMedia,
  CardActions,
  Button,
  Chip,
  TextField,
  InputAdornment,
  Pagination,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  useTheme,
} from '@mui/material';
import {
  Search as SearchIcon,
  AccessTime as AccessTimeIcon,
  Person as PersonIcon,
} from '@mui/icons-material';
import { blogsAPI, handleApiError } from '../services/api';
import { customStyles } from '../theme';

const ITEMS_PER_PAGE = 9;

const Blog = () => {
  const theme = useTheme();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [category, setCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);

  const categories = ['all', 'Case Law', 'Legal News', 'Updates', 'Research'];

  useEffect(() => {
    fetchPosts();
  }, [page, category, searchQuery, selectedTag]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: ITEMS_PER_PAGE,
        ...(category !== 'all' && { category }),
        ...(searchQuery && { search: searchQuery }),
        ...(selectedTag && { tag: selectedTag }),
      };

      const response = await blogsAPI.getAll(params);
      setPosts(response.data.blogs);
      setTotalPages(response.data.pagination.totalPages);
      setError(null);
    } catch (err) {
      const errorDetails = handleApiError(err);
      setError(errorDetails.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (event, newValue) => {
    setCategory(newValue);
    setPage(1);
  };

  const handlePageChange = (event, value) => {
    setPage(value);
    window.scrollTo(0, 0);
  };

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
    setPage(1);
  };

  const handleTagClick = (tag) => {
    setSelectedTag(tag === selectedTag ? null : tag);
    setPage(1);
  };

  if (loading && page === 1) {
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
          <Typography variant="h2" sx={{ fontWeight: 700, mb: 2 }}>
            Legal Insights
          </Typography>
          <Typography variant="h5" sx={{ maxWidth: 800 }}>
            Stay informed with our latest legal updates, case studies, and industry insights.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg">
        {error && (
          <Alert severity="error" sx={{ mb: 4 }}>
            {error}
          </Alert>
        )}

        {/* Search and Filter Section */}
        <Box sx={{ mb: 4 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Search articles..."
                value={searchQuery}
                onChange={handleSearchChange}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <Tabs
                value={category}
                onChange={handleCategoryChange}
                variant="scrollable"
                scrollButtons="auto"
              >
                {categories.map((cat) => (
                  <Tab
                    key={cat}
                    label={cat === 'all' ? 'All Posts' : cat}
                    value={cat}
                    sx={{ textTransform: 'none' }}
                  />
                ))}
              </Tabs>
            </Grid>
          </Grid>
        </Box>

        {/* Blog Posts Grid */}
        <Grid container spacing={4}>
          {posts.map((post) => (
            <Grid item xs={12} sm={6} md={4} key={post._id}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', ...customStyles.cardHover }}>
                <CardMedia
                  component="img"
                  height="200"
                  image={post.featuredImage || '/images/default-blog.jpg'}
                  alt={post.title}
                />
                <CardContent sx={{ flexGrow: 1 }}>
                  <Box sx={{ mb: 2 }}>
                    <Chip
                      label={post.category}
                      color="primary"
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    {post.tags?.slice(0, 2).map((tag) => (
                      <Chip
                        key={tag}
                        label={tag}
                        size="small"
                        onClick={() => handleTagClick(tag)}
                        sx={{ mr: 1 }}
                      />
                    ))}
                  </Box>
                  <Typography
                    variant="h5"
                    component="h2"
                    gutterBottom
                    sx={{
                      fontWeight: 600,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {post.title}
                  </Typography>
                  <Typography
                    color="text.secondary"
                    sx={{
                      mb: 2,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {post.content}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <PersonIcon sx={{ mr: 1, fontSize: 20 }} />
                    <Typography variant="body2" color="text.secondary">
                      {post.author.name}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <AccessTimeIcon sx={{ mr: 1, fontSize: 20 }} />
                    <Typography variant="body2" color="text.secondary">
                      {new Date(post.publishedAt).toLocaleDateString()}
                    </Typography>
                  </Box>
                </CardContent>
                <CardActions>
                  <Button
                    component={RouterLink}
                    to={`/blog/${post.slug}`}
                    size="small"
                    color="primary"
                  >
                    Read More
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Pagination */}
        {totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
            <Pagination
              count={totalPages}
              page={page}
              onChange={handlePageChange}
              color="primary"
              size="large"
            />
          </Box>
        )}

        {/* Newsletter Subscription */}
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
            Stay Updated
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, maxWidth: 600, mx: 'auto' }}>
            Subscribe to our newsletter to receive the latest legal insights and updates.
          </Typography>
          <Grid container spacing={2} justifyContent="center">
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                placeholder="Enter your email"
                type="email"
              />
            </Grid>
            <Grid item xs={12} sm="auto">
              <Button
                variant="contained"
                color="primary"
                size="large"
                sx={{ minWidth: 200 }}
              >
                Subscribe
              </Button>
            </Grid>
          </Grid>
        </Box>
      </Container>
    </Box>
  );
};

export default Blog;
