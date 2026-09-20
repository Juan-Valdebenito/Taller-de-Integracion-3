import { Request, Response, NextFunction } from 'express';
import { body, validationResult, ValidationChain } from 'express-validator';

/**
 * Middleware para capturar y procesar errores de validación y sanitización.
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      status: 'fail',
      message: 'Datos de entrada inválidos o no cumplen con los requisitos de seguridad',
      errors: errors.array().map((err) => ({
        field: (err as any).path || (err as any).param,
        message: err.msg,
      })),
    });
    return;
  }
  next();
};

/**
 * Reglas de validación y sanitización para Registro de Usuarios.
 * - Escapa caracteres HTML/XSS en el nombre.
 * - Normaliza y verifica el correo electrónico.
 * - Valida fortaleza de la contraseña.
 */
export const validateRegistration: ValidationChain[] = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es requerido')
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres')
    .escape(),

  body('email')
    .trim()
    .notEmpty().withMessage('El correo electrónico es requerido')
    .isEmail().withMessage('El correo electrónico debe ser válido')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('password')
    .notEmpty().withMessage('La contraseña es requerida')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener un mínimo de 8 caracteres')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una letra y un número'),

  body('role')
    .optional()
    .isIn(['PASSENGER', 'COMPANY', 'ADMIN'])
    .withMessage('Rol inválido. Debe ser PASSENGER, COMPANY o ADMIN'),
];

/**
 * Reglas de validación y sanitización para Login de Usuarios.
 */
export const validateLogin: ValidationChain[] = [
  body('email')
    .trim()
    .notEmpty().withMessage('El correo electrónico es requerido')
    .isEmail().withMessage('El formato de correo no es válido')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('password')
    .notEmpty().withMessage('La contraseña es requerida'),
];

/**
 * Reglas de validación y sanitización para Actualización de Perfil de Usuario.
 */
export const validateUserUpdate: ValidationChain[] = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres')
    .escape(),

  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('El formato de correo no es válido')
    .normalizeEmail({ gmail_remove_dots: false }),

  body('password')
    .optional()
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos una letra y un número'),
];
