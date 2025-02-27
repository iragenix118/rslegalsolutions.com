import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Avatar,
  Divider,
  CircularProgress,
  Alert,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Breadcrumbs,
  Link,
  useTheme,
} from '@mui/material';
import {
  AccessTime as AccessTimeIcon,
  Person as PersonIcon,
  Visibility as VisibilityIcon,
  ThumbUp as ThumbUpIcon,
  NavigateNext as NavigateNextIcon,
} from '@mui/icons-material';
import { blogsAPI, handleApiError } from '../services/api';
import { customStyles } from '../theme';

const BlogPost = () => {
  const { slug } = useParams();
  const theme = useTheme();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [likeLoading, setLikeLoading] = useState(false);

  useEffect(() => {
    fetchPost();
  }, [slug]);

  const fetchPost = async () => {
    try {
      setLoading(true);
      const response = await blogsAPI.getBySlug(slug);
      setPost(response.data);
      setError(null);
    } catch (err) {
      const errorDetails = handleApiError(err);
      setError(errorDetails.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    try {
      setLikeLoading(true);
      const response = await blogsAPI.like(post._id);
      setPost(prev => ({
        ...prev,
        meta: {
          ...prev.meta,
          likes: response.data.likes
        }
      }));
    } catch (err) {
      const errorDetails = handleApiError(err);
      setError(errorDetails.message);
    } finally {
      setLikeLoading(false);
    }
  };

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
        <Button component={RouterLink} to="/blog" variant="contained">
          Back to Blog
        </Button>
      </Container>
    );
  }

  if (!post) return null;

  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          position: 'relative',
          height: { xs: '300px', md: '400px' },
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url(${post.featuredImage || '/images/default-blog.jpg'})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          alignItems: 'center',
          color: 'common.white',
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
              to="/blog"
              color="inherit"
              sx={{ '&:hover': { color: 'common.white' } }}
            >
              Blog
            </Link>
            <Typography color="common.white">{post.category}</Typography>
          </Breadcrumbs>

          <Typography variant="h2" sx={{ fontWeight: 700, mb: 2 }}>
            {post.title}
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Avatar src={post.author.avatar} sx={{ mr: 1 }}>
                {post.author.name[0]}
              </Avatar>
              <Typography>{post.author.name}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <AccessTimeIcon sx={{ mr: 1 }} />
              <Typography>{new Date(post.publishedAt).toLocaleDateString()}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <VisibilityIcon sx={{ mr: 1 }} />
              <Typography>{post.meta.views} views</Typography>
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Grid container spacing={4}>
          {/* Main Content */}
          <Grid item xs={12} md={8}>
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Box sx={{ mb: 4 }}>
                  {post.tags?.map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      component={RouterLink}
                      to={`/blog?tag=${tag}`}
                      sx={{ mr: 1, mb: 1 }}
                      clickable
                    />
                  ))}
                </Box>

                <Typography variant="body1" sx={{ mb: 4, lineHeight: 1.8 }}>
                  {post.content}
                </Typography>

                {post.references?.length > 0 && (
                  <Box sx={{ mt: 4 }}>
                    <Typography variant="h6" gutterBottom>
                      References
                    </Typography>
                    <List>
                      {post.references.map((ref, index) => (
                        <ListItem key={index}>
                          <ListItemText
                            primary={ref.title}
                            secondary={
                              <Link href={ref.url} target="_blank" rel="noopener">
                                {ref.url}
                              </Link>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}

                <Divider sx={{ my: 4 }} />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button
                    startIcon={<ThumbUpIcon />}
                    onClick={handleLike}
                    disabled={likeLoading}
                  >
                    {post.meta.likes} Likes
                  </Button>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Share this article:
                    </Typography>
                    {/* Add social sharing buttons here */}
                  </Box>
                </Box>
              </CardContent>
            </Card>

            {/* Author Bio */}
            <Card sx={{ mb: 4 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar
                    src={post.author.avatar}
                    sx={{ width: 64, height: 64, mr: 2 }}
                  >
                    {post.author.name[0]}
                  </Avatar>
                  <Box>
                    <Typography variant="h6">{post.author.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {post.author.bio}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Sidebar */}
          <Grid item xs={12} md={4}>
            {/* Related Posts */}
            {post.relatedPosts?.length > 0 && (
              <Card sx={{ mb: 4 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Related Posts
                  </Typography>
                  <List>
                    {post.relatedPosts.map((relatedPost) => (
                      <ListItem
                        key={relatedPost._id}
                        component={RouterLink}
                        to={`/blog/${relatedPost.slug}`}
                        sx={{
                          '&:hover': {
                            bgcolor: 'action.hover',
                          },
                        }}
                      >
                        <ListItemAvatar>
                          <Avatar src={relatedPost.featuredImage}>
                            <ArticleIcon />
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={relatedPost.title}
                          secondary={new Date(relatedPost.publishedAt).toLocaleDateString()}
                        />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            )}

            {/* Newsletter Subscription */}
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Subscribe to Our Newsletter
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Stay updated with our latest legal insights and updates.
                </Typography>
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  component={RouterLink}
                  to="/newsletter"
                >
                  Subscribe Now
                </Button>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default BlogPost;
