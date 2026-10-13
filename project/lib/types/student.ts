export type ItemType = 'business' | 'product' | 'service' | 'event';

export interface SavedItem {
  id: string;
  user_id: string;
  item_type: ItemType;
  item_id: string;
  collection: string | null;
  created_at: string;
}

export interface RecentlyViewed {
  id: string;
  user_id: string;
  item_type: ItemType;
  item_id: string;
  viewed_at: string;
}

export interface StudentPreferences {
  id: string;
  student_id: string;
  interests: string[];
  notification_preferences: {
    email: boolean;
    push: boolean;
    events: boolean;
    messages: boolean;
    reviews: boolean;
    announcements: boolean;
  };
  privacy_settings: {
    profile_visibility: 'public' | 'university' | 'private';
    contact_visibility: 'public' | 'university' | 'private';
  };
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  participant_one: string;
  participant_two: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationWithDetails extends Conversation {
  other_participant: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  last_message: {
    body: string | null;
    created_at: string;
    sender_id: string;
  } | null;
  unread_count: number;
}

export interface ReviewWithDetails {
  id: string;
  reviewer_id: string;
  vendor_id: string | null;
  product_id: string | null;
  event_id: string | null;
  rating: number;
  comment: string | null;
  is_approved: boolean;
  created_at: string;
  reviewer: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  vendor: {
    business_name: string;
    business_slug: string;
  } | null;
}

export const STUDENT_INTERESTS = [
  'Technology',
  'Fashion',
  'Food',
  'Sports',
  'Business',
  'Education',
  'Entertainment',
  'Music',
  'Photography',
  'Health & Fitness',
  'Travel',
  'Gaming',
] as const;

export const COLLECTION_SUGGESTIONS = [
  'Food',
  'Services',
  'Shops',
  'Accommodation',
  'Events',
  'Other',
] as const;

export const NOTIFICATION_CATEGORIES = [
  { key: 'messages', label: 'Messages', description: 'When you receive a new message' },
  { key: 'events', label: 'Events', description: 'Reminders for events you saved' },
  { key: 'reviews', label: 'Reviews', description: 'When someone responds to your review' },
  { key: 'announcements', label: 'Announcements', description: 'Platform and campus updates' },
] as const;
