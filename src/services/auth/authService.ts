import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../../database/connection';
import logger from '../../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupCredentials {
  email: string;
  name: string;
  password: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  async signup(credentials: SignupCredentials): Promise<any> {
    try {
      // Check if user exists
      const existingResult = await query(
        'SELECT id FROM users WHERE email = $1',
        [credentials.email]
      );

      if (existingResult.rows.length > 0) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(credentials.password, 10);

      // Create user
      const userId = uuidv4();
      const result = await query(
        `INSERT INTO users (id, email, name, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, created_at`,
        [userId, credentials.email, credentials.name, passwordHash]
      );

      logger.info(`User created: ${credentials.email}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Signup failed', error);
      throw error;
    }
  }

  /**
   * Authenticate user and generate token
   */
  async login(credentials: LoginCredentials): Promise<{ token: string; user: any }> {
    try {
      // Fetch user
      const result = await query('SELECT * FROM users WHERE email = $1', [
        credentials.email
      ]);

      if (result.rows.length === 0) {
        throw new Error('Invalid email or password');
      }

      const user = result.rows[0];

      // Verify password
      const isValid = await bcrypt.compare(
        credentials.password,
        user.password_hash
      );

      if (!isValid) {
        throw new Error('Invalid email or password');
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email } as TokenPayload,
        process.env.JWT_SECRET || 'secret',
        { expiresIn: process.env.JWT_EXPIRATION || '7d' }
      );

      logger.info(`User logged in: ${credentials.email}`);

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name
        }
      };
    } catch (error) {
      logger.error('Login failed', error);
      throw error;
    }
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'secret'
      ) as TokenPayload;
      return decoded;
    } catch (error) {
      logger.error('Token verification failed', error);
      return null;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<any> {
    try {
      const result = await query(
        'SELECT id, email, name, created_at FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get user', error);
      throw error;
    }
  }
}
