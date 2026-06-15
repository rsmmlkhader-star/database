import express, { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AppError } from '../middleware/errorHandler';

const router: Router = express.Router();

interface LoginRequest {
  email: string;
  password: string;
}

interface SignupRequest {
  email: string;
  name: string;
  password: string;
}

// TODO: Implement actual database queries

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body as LoginRequest;

    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }

    // TODO: Query user from database
    // const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    // TODO: Verify password
    // const isValid = await bcrypt.compare(password, user.password_hash);

    // TODO: Generate JWT token
    const token = jwt.sign(
      { email, userId: 'placeholder' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRATION || '7d' }
    );

    res.json({ token, user: { email } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'Login failed');
  }
});

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { email, name, password } = req.body as SignupRequest;

    if (!email || !name || !password) {
      throw new AppError(400, 'Email, name, and password are required');
    }

    // TODO: Check if user exists
    // TODO: Hash password
    // TODO: Store user in database

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'Signup failed');
  }
});

export const authRoutes = router;
