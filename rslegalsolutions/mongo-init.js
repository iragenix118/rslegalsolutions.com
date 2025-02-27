// Switch to the application database
db = db.getSiblingDB('rslegalsolutions');

// Create collections with schema validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'password', 'role'],
      properties: {
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        },
        password: {
          bsonType: 'string',
          minLength: 8
        },
        role: {
          enum: ['admin', 'editor', 'staff']
        }
      }
    }
  }
});

db.createCollection('services', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['title', 'slug', 'category'],
      properties: {
        title: {
          bsonType: 'string',
          minLength: 1
        },
        slug: {
          bsonType: 'string',
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        },
        category: {
          enum: [
            'Corporate and Commercial Law',
            'Dispute Resolution',
            'Petitions and Applications',
            'Real Estate and Property Law',
            'Registrations and Compliances',
            'Wills Trusts and Estate Planning'
          ]
        }
      }
    }
  }
});

db.createCollection('appointments', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['clientName', 'email', 'phone', 'appointmentDate', 'serviceType'],
      properties: {
        appointmentDate: {
          bsonType: 'date'
        },
        status: {
          enum: ['pending', 'confirmed', 'cancelled', 'completed']
        }
      }
    }
  }
});

db.createCollection('blogs', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['title', 'slug', 'content', 'category', 'status'],
      properties: {
        status: {
          enum: ['draft', 'published', 'archived']
        },
        category: {
          enum: ['Case Law', 'Legal News', 'Updates', 'Research']
        }
      }
    }
  }
});

db.createCollection('contacts', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email', 'subject', 'message'],
      properties: {
        status: {
          enum: ['new', 'in-progress', 'responded', 'closed']
        },
        priority: {
          enum: ['low', 'medium', 'high']
        }
      }
    }
  }
});

// Create indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ "passwordResetToken": 1 }, { sparse: true });

db.services.createIndex({ slug: 1 }, { unique: true });
db.services.createIndex({ category: 1 });
db.services.createIndex({ "isActive": 1 });

db.appointments.createIndex({ appointmentDate: 1, status: 1 });
db.appointments.createIndex({ email: 1 });
db.appointments.createIndex({ confirmationCode: 1 }, { unique: true });

db.blogs.createIndex({ slug: 1 }, { unique: true });
db.blogs.createIndex({ category: 1, status: 1 });
db.blogs.createIndex({ tags: 1 });
db.blogs.createIndex({ "meta.views": -1 });
db.blogs.createIndex({ publishedAt: -1 });

db.contacts.createIndex({ status: 1, createdAt: -1 });
db.contacts.createIndex({ email: 1 });
db.contacts.createIndex({ priority: 1 });

// Create admin user if it doesn't exist
db.users.updateOne(
  { email: 'admin@rslegalsolutions.com' },
  {
    $setOnInsert: {
      name: 'Admin',
      email: 'admin@rslegalsolutions.com',
      password: '$2a$10$your-hashed-password', // Replace with actual hashed password
      role: 'admin',
      isActive: true,
      permissions: [
        'manage_services',
        'manage_appointments',
        'manage_blogs',
        'manage_users',
        'view_contacts',
        'respond_contacts'
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  },
  { upsert: true }
);

// Create default categories
const serviceCategories = [
  'Corporate and Commercial Law',
  'Dispute Resolution',
  'Petitions and Applications',
  'Real Estate and Property Law',
  'Registrations and Compliances',
  'Wills Trusts and Estate Planning'
];

serviceCategories.forEach(category => {
  db.categories.updateOne(
    { name: category },
    {
      $setOnInsert: {
        name: category,
        slug: category.toLowerCase().replace(/\s+/g, '-'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
});

// Print completion message
print('Database initialization completed successfully');
