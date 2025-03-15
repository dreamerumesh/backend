require('dotenv').config();
const express = require('express');
const redis = require('redis');
const { promisify } = require('util');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const cors = require('cors');
const app = express();
app.use(express.json());

// Create Redis client using env variables
const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  password: process.env.REDIS_PASSWORD,
});

client.on("error", (err) => {
  console.error("🔴 Redis Client Error:", err);
});

(async () => {
  try {
    await client.connect();
    console.log("🟢 Connected to Redis");
  } catch (err) {
    console.error("🔴 Redis Connection Failed:", err);
  }
})();


// Promisify Redis commands for easier use
const redisGet = promisify(client.get).bind(client);
const redisSet = promisify(client.set).bind(client);
const redisDel = promisify(client.del).bind(client);

// Use CORS middleware
app.use(cors({
    
  }));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1); // Exit the application if MongoDB connection fails
  });
// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  
});

const User = mongoose.model('User', userSchema);

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Generate OTP
// function generateOTP() {
//   return Math.floor(100000 + Math.random() * 900000).toString();
// }

// Routes
app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(400).json({ error: 'User already exists' });
  }
});
// login route
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
  
    try {
      // Find the user by email
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      // Compare the provided password with the hashed password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
  
      // If credentials are valid, respond with success
      res.status(200).json({ message: 'Login successful' });
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).json({ error: 'Failed to login' });
    }
  });

  
  
  app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
  
    try {
      //console.log('Forgot Password Request Received for Email:', email);
  
      // Find the user by email
      const user = await User.findOne({ email });
      if (!user) {
        //console.error('User not found for email:', email);
        return res.status(404).json({ error: 'User not found' });
      }
  
      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
     // console.log('Generated OTP:', otp);
  
      // Store OTP in Redis with an expiration time (e.g., 15 minutes)
      await client.set(email, otp, { EX: 900 }); // Key: email, Value: OTP, Expiration: 900 seconds
      //console.log('OTP stored in Redis for email:', email);
  
      // Send OTP via email
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset OTP',
        text: `Your OTP for password reset is: ${otp}`,
      };
  
      await transporter.sendMail(mailOptions);
      //console.log('OTP sent to email:', email);
  
      // Respond with success message
      res.status(200).json({ message: 'OTP sent to your email' });
    } catch (error) {
      console.error('Error sending OTP:', error);
      res.status(500).json({ error: 'Failed to send OTP' });
    }
  });

  // reset-password
  app.post('/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
  
    try {
     // console.log('Reset Password Request:', { email, otp });
  
      // Step 1: Retrieve the OTP from Redis
      const storedOTP = await client.get(email);
      //console.log('Stored OTP from Redis:', storedOTP);
  
      if (!storedOTP || storedOTP !== otp) {
        //console.error('Invalid OTP:', { storedOTP, otp });
        return res.status(400).json({ error: 'Invalid OTP' });
      }
  
      // Step 2: Find the user in the database
      const user = await User.findOne({ email });
      if (!user) {
        //console.error('User not found for email:', email);
        return res.status(404).json({ error: 'User not found' });
      }
  
      // Step 3: Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      //console.log('New hashed password generated');
  
      // Step 4: Update the user's password
      user.password = hashedPassword;
      await user.save();
      //console.log('Password updated in the database');
  
      // Step 5: Delete the OTP from Redis
      await client.del(email);
      //console.log('OTP deleted from Redis');
  
      // Respond with success message
      res.status(200).json({ message: 'Password reset successful' });
    } catch (error) {
      console.error('Error during password reset:', error);
      res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
    }
  });




// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));