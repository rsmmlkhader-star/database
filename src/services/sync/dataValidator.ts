import { ValidationRule } from '../types';
import logger from '../utils/logger';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  fieldName: string;
  value: any;
  message: string;
}

export class DataValidator {
  /**
   * Validates a row against defined rules
   */
  validateRow(
    row: any,
    rules: ValidationRule[]
  ): ValidationResult {
    const errors: ValidationError[] = [];

    for (const rule of rules) {
      const value = row[rule.fieldName];

      // Check required
      if (rule.required && (value === null || value === undefined || value === '')) {
        errors.push({
          fieldName: rule.fieldName,
          value,
          message: `${rule.fieldName} is required`
        });
        continue;
      }

      // Skip validation if empty and not required
      if (!rule.required && (value === null || value === undefined)) {
        continue;
      }

      // Type validation
      const typeError = this.validateType(value, rule.dataType);
      if (typeError) {
        errors.push({
          fieldName: rule.fieldName,
          value,
          message: typeError
        });
        continue;
      }

      // Length validation
      if (rule.dataType === 'string') {
        if (rule.minLength && value.length < rule.minLength) {
          errors.push({
            fieldName: rule.fieldName,
            value,
            message: `${rule.fieldName} must be at least ${rule.minLength} characters`
          });
        }
        if (rule.maxLength && value.length > rule.maxLength) {
          errors.push({
            fieldName: rule.fieldName,
            value,
            message: `${rule.fieldName} must be at most ${rule.maxLength} characters`
          });
        }
      }

      // Pattern validation
      if (rule.pattern && !rule.pattern.test(String(value))) {
        errors.push({
          fieldName: rule.fieldName,
          value,
          message: rule.errorMessage
        });
      }

      // Enum validation
      if (rule.allowedValues && !rule.allowedValues.includes(value)) {
        errors.push({
          fieldName: rule.fieldName,
          value,
          message: `${rule.fieldName} must be one of: ${rule.allowedValues.join(', ')}`
        });
      }

      // Custom validation
      if (rule.customValidator && !rule.customValidator(value)) {
        errors.push({
          fieldName: rule.fieldName,
          value,
          message: rule.errorMessage
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates data type
   */
  private validateType(value: any, dataType: string): string | null {
    switch (dataType) {
      case 'string':
        if (typeof value !== 'string') {
          return `Expected string, got ${typeof value}`;
        }
        break;

      case 'number':
        if (typeof value !== 'number') {
          return `Expected number, got ${typeof value}`;
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return `Expected boolean, got ${typeof value}`;
        }
        break;

      case 'date':
        if (!(value instanceof Date) && isNaN(Date.parse(String(value)))) {
          return `Invalid date format`;
        }
        break;

      case 'enum':
        // Enum validation is done separately
        break;
    }

    return null;
  }
}
