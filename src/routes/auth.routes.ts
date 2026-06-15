import { Router, Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { AuthService } from '../services/auth/authService';

const router = Router();
const authService = new AuthService();

// Middleware to verify token
export function verifyToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    throw new AppError(401, 'No token provided');
  }

  const payload = authService.verifyToken(token);
  if (!payload) {
    throw new AppError(401, 'Invalid token');
  }

  (req as any).userId = payload.userId;
  (req as any).email = payload.email;
  next();
}

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }

    const result = await authService.login({ email, password });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      throw new AppError(400, 'Email, name, and password are required');
    }

    const user = await authService.signup({ email, name, password });
    res.status(201).json({ message: 'User created successfully', user });
  } catch (error) {
    next(error);
  }
});

router.get('/profile', verifyToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await authService.getUserById((req as any).userId);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

export const authRoutes = router;
