const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.json());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wuksj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: { version: '1', strict: true, deprecationErrors: true },
});
let db;

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;

// Generate JWT Token
app.post('/login', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });
  res.status(200).json({ token });
});

// Middleware to verify JWT Token
const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized Access' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    req.user = decoded;
    next();
  });
};

// MongoDB Connection and Routes
async function run() {
  try {
    await client.connect();
    db = client.db('rooms');
    console.log('Connected to MongoDB');

    app.use(express.static(path.join(__dirname, 'public')));

    // Base API path: rooms
    app.get('/rooms', async (req, res) => {
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 15;
      const skip = page * limit;

      try {
        const rooms = await db.collection('rooms').find().skip(skip).limit(limit).toArray();
        res.json(rooms);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rooms', details: error.message });
      }
    });

    // POST Rooms by IDs
    app.post('/api/roomsById', async (req, res) => {
      const ids = req.body.map((id) => (ObjectId.isValid(id) ? new ObjectId(id) : null)).filter(Boolean);

      if (ids.length === 0) {
        return res.status(400).json({ error: 'Invalid IDs provided' });
      }

      try {
        const result = await db.collection('rooms').find({ _id: { $in: ids } }).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rooms by IDs', details: error.message });
      }
    });

    // Additional route example: GET a single room by ID
    app.get('/api/rooms/:id', async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid room ID' });
      }

      try {
        const room = await db.collection('rooms').findOne({ _id: new ObjectId(id) });
        if (!room) {
          return res.status(404).json({ message: 'Room not found' });
        }
        res.json(room);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch the room', details: error.message });
      }
    });

    // Example protected route with JWT
    app.get('/api/protected', verifyJWT, (req, res) => {
      res.status(200).json({ message: 'Welcome to the protected route!', user: req.user });
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
  }
}

run().catch(console.dir);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running ${PORT}`);
});
