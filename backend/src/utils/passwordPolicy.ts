export interface PasswordValidationResult {
  valid: boolean;
  message?: string;
  errors: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    specialChar: boolean;
  };
}

/**
 * Validates password requirement:
 * - At least 8 characters
 * - At least 1 uppercase letter (A-Z)
 * - At least 1 lowercase letter (a-z)
 * - At least 1 number (0-9)
 * - At least 1 special character (!@#$%^&*...)
 */
export function validatePassword(password: string): PasswordValidationResult {
  const pwd = String(password || '');
  
  const length = pwd.length >= 8;
  const uppercase = /[A-Z]/.test(pwd);
  const lowercase = /[a-z]/.test(pwd);
  const number = /\d/.test(pwd);
  const specialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);

  const valid = length && uppercase && lowercase && number && specialChar;
  
  let message: string | undefined;
  if (!valid) {
    const missing: string[] = [];
    if (!length) missing.push('at least 8 characters');
    if (!uppercase) missing.push('an uppercase letter (A-Z)');
    if (!lowercase) missing.push('a lowercase letter (a-z)');
    if (!number) missing.push('a number (0-9)');
    if (!specialChar) missing.push('a special character (!@#$%^&*)');
    
    message = `Password requirement failed: Must contain ${missing.join(', ')}.`;
  }

  return {
    valid,
    message,
    errors: {
      length,
      uppercase,
      lowercase,
      number,
      specialChar
    }
  };
}
