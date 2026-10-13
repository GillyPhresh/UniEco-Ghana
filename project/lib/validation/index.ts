import { z } from 'zod';

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const signUpBaseSchema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Include at least one uppercase letter')
    .regex(/[a-z]/, 'Include at least one lowercase letter')
    .regex(/[0-9]/, 'Include at least one number'),
  confirmPassword: z.string(),
  terms: z.boolean().refine((v) => v === true, {
    message: 'You must accept the terms to continue',
  }),
});

export const signUpSchema = signUpBaseSchema.refine(
  (data) => data.password === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
);

export const studentOnboardingSchema = z.object({
  university_id: z.string().uuid('Select your university'),
  programme: z.string().min(2, 'Enter your programme of study'),
  faculty: z.string().min(2, 'Enter your faculty'),
  department: z.string().min(2, 'Enter your department'),
  level: z.enum(['100', '200', '300', '400', '500', '600', 'graduate'], {
    errorMap: () => ({ message: 'Select your level' }),
  }),
  index_number: z
    .string()
    .min(3, 'Enter your index/student number')
    .max(30, 'Index number seems too long'),
  admission_year: z
    .number()
    .int()
    .min(2000, 'Enter a valid admission year')
    .max(new Date().getFullYear() + 1, 'Admission year cannot be in the future'),
  phone: z
    .string()
    .min(10, 'Enter a valid phone number')
    .max(15, 'Phone number is too long'),
  graduation_year: z.number().int().min(2000).max(2050).optional(),
});

export const vendorRegistrationSchema = z.object({
  business_name: z.string().min(2, 'Enter your business name'),
  business_category: z.string().min(1, 'Select a business category'),
  description: z
    .string()
    .min(20, 'Tell us a bit more about your business (at least 20 characters)')
    .max(500, 'Keep the description under 500 characters'),
  location_address: z.string().min(5, 'Enter your business address'),
  location_city: z.string().min(2, 'Enter your city'),
  location_region: z.string().min(2, 'Enter your region'),
  product_service_type: z.string().min(2, 'Describe what you sell or offer'),
  contact_phone: z.string().min(10, 'Enter a valid phone number'),
  contact_email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  vendor_type: z.enum(['student_vendor', 'external_vendor']),
});

export const externalVendorSchema = vendorRegistrationSchema.extend({
  university_id: z.string().uuid('Select the nearest university'),
});

export const profileUpdateSchema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  phone: z.string().min(10, 'Enter a valid phone number').max(15).optional().or(z.literal('')),
  bio: z.string().max(300, 'Keep your bio under 300 characters').optional().or(z.literal('')),
  avatar_url: z.string().url().optional().or(z.literal('')),
});

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[a-z]/, 'Include at least one lowercase letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const notificationSettingsSchema = z.object({
  email_orders: z.boolean().default(true),
  email_messages: z.boolean().default(true),
  email_events: z.boolean().default(true),
  email_promotions: z.boolean().default(false),
  push_orders: z.boolean().default(true),
  push_messages: z.boolean().default(true),
  push_events: z.boolean().default(false),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[a-z]/, 'Include at least one lowercase letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const productSchema = z.object({
  name: z.string().min(2, 'Product name is required'),
  price: z.number().positive('Price must be greater than 0'),
  currency: z.string().default('GHS'),
  stock: z.number().int().min(0, 'Stock cannot be negative'),
  description: z.string().max(1000).optional(),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Give a rating from 1 to 5').max(5),
  comment: z.string().max(500, 'Keep your review under 500 characters').optional(),
});

export const eventSchema = z.object({
  title: z.string().min(2, 'Event title is required'),
  description: z.string().max(2000).optional(),
  start_time: z.string(),
  end_time: z.string(),
  location: z.string().optional(),
  is_virtual: z.boolean().default(false),
});

export const businessCategories = [
  'Food & Drinks',
  'Fashion & Apparel',
  'Electronics',
  'Printing & Stationery',
  'Health & Beauty',
  'Services',
  'Books & Academic',
  'Art & Crafts',
  'Transport',
  'Other',
] as const;

export const regions = [
  'Greater Accra',
  'Ashanti',
  'Bono',
  'Bono East',
  'Ahafo',
  'Central',
  'Eastern',
  'Western',
  'Western North',
  'Volta',
  'Oti',
  'Northern',
  'Savannah',
  'North East',
  'Upper East',
  'Upper West',
] as const;

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type StudentOnboardingInput = z.infer<typeof studentOnboardingSchema>;
export type VendorRegistrationInput = z.infer<typeof vendorRegistrationSchema>;
export type ExternalVendorInput = z.infer<typeof externalVendorSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
export type VendorInput = z.infer<typeof vendorRegistrationSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type EventInput = z.infer<typeof eventSchema>;
