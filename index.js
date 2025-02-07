const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(
  cors({
    origin: ['http://localhost:8000', 'http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })
);
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

    app.use(express.static('public'));

    // GET All Rooms with Pagination
    app.get('/rooms', async (req, res) => {
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 15;
      const skip = page * limit;

      try {
        const rooms = await db.collection('rooms').find().skip(skip).limit(limit).toArray();
        res.send(rooms);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rooms' });
      }
    });

    // POST Rooms by IDs
    app.post('/roomsById', async (req, res) => {
      const ids = req.body.map((id) => new ObjectId(id));
      try {
        const result = await db.collection('rooms').find({ _id: { $in: ids } }).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch rooms by IDs' });
      }
    });

    // GET Total Room Count
    app.get('/roomCount', async (req, res) => {
      try {
        const count = await db.collection('rooms').estimatedDocumentCount();
        res.send({ totalRooms: count });
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch room count' });
      }
    });

    // POST Book a Room (Protected Route)
    app.post('/api/book-room', verifyJWT, async (req, res) => {
      const { name, email, phone, checkInDate, checkOutDate, roomType } = req.body;

      if (!name || !email || !phone || !checkInDate || !checkOutDate || !roomType) {
        return res.status(400).json({ message: 'All fields are required!' });
      }

      try {
        const booking = { name, email, phone, checkInDate, checkOutDate, roomType };
        const result = await db.collection('bookings').insertOne(booking);

        res.status(201).json({ message: 'Room booked successfully!', bookingId: result.insertedId });
      } catch (error) {
        res.status(500).json({ message: 'Failed to book the room', error: error.message });
      }
    });

    // POST a Review (Protected Route)
    app.post('/api/reviews', verifyJWT, async (req, res) => {
      const { roomId, userId, username, rating, comment } = req.body;

      if (!roomId || !userId || !username || !rating || !comment) {
        return res.status(400).json({ error: 'All fields are required!' });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5!' });
      }

      const review = {
        roomId: new ObjectId(roomId),
        userId: new ObjectId(userId),
        username,
        rating: parseInt(rating),
        comment,
        timestamp: new Date(),
      };

      try {
        await db.collection('reviews').insertOne(review);
        res.status(201).json({ message: 'Review added successfully!', review });
      } catch (error) {
        res.status(500).json({ error: 'Failed to post review', details: error.message });
      }
    });

    // GET Reviews for a Room
    app.get('/api/reviews/:roomId', async (req, res) => {
      const { roomId } = req.params;

      if (!ObjectId.isValid(roomId)) {
        return res.status(400).json({ error: 'Invalid Room ID' });
      }

      try {
        const reviews = await db.collection('reviews').find({ roomId: new ObjectId(roomId) }).toArray();
        res.json(reviews);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reviews' });
      }
    });

    // Default Route
    app.get('/', (req, res) => {
      res.send('Welcome to the Hotel Booking API!');
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
  }
}

run().catch(console.dir);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
